import {
  AuditPort,
  IdGeneratorPort,
  PdfPort,
} from "../../ports";
import { ProviderResolver } from "../../infrastructure/security/ProviderResolver";
import { RlsTenantStore } from "../../infrastructure/persistence/postgres/rlsTransaction";
import {
  calculateBangladeshTermGpa,
  computeMeritPositions,
  evaluateMcqSubmission,
  SubjectScoreInput,
  StudentTermMarksheet,
} from "../../domain/grading/BangladeshGradingPolicy";
import {
  allocatePaymentOldestDueFirst,
  calculateProRatedCoachingFee,
  calculateTeacherPayroll,
} from "../../domain/finance/FeeAllocationPolicy";

/**
 * Application Service orchestrating Phase 4 Bangladesh Modules:
 * 1. Coaching Batches (Capacity + Waitlist + Mid-Month Pro-Rated Fee + MCQ Auto-Grading + Teacher Payroll)
 * 2. Academics & 5.00 GPA Grading (NCTB/Madrasa/Coaching + 4th Subject Bonus + Merit List + Marksheet PDF)
 * 3. Bangladeshi Payments (bKash/Nagad/Rocket Manual Send-Money TrxID Submission + Accountant Verification + Duplicate TrxID Guard + Oldest-Due Allocation)
 * 4. SMS Wallet & BTRC-Compliant Notifications
 * 5. Library, Transport & Hostel Operations
 */
export class BangladeshModulesService {
  constructor(
    private readonly deps: {
      rlsStore: RlsTenantStore;
      providerResolver: ProviderResolver;
      pdf: PdfPort;
      audit: AuditPort;
      idGen: IdGeneratorPort;
    }
  ) {}

  // ---------------------------------------------------------------------------
  // 1. Coaching Batches & Enrollments
  // ---------------------------------------------------------------------------
  createCoachingBatch(
    tenantId: string,
    input: {
      batchCode: string;
      name: string;
      nameBn?: string;
      scheduleSummary: string;
      capacity: number;
      monthlyFee: number;
      feeModel?: "monthly" | "package" | "per_subject";
      courseId?: string;
      teacherStaffId?: string;
    }
  ) {
    return RlsTenantStore.runWithTenantContext({ tenantId }, () => {
      const existing = this.deps.rlsStore.findMany(
        "coaching_batches",
        (b: any) => b.batch_code === input.batchCode
      );
      if (existing.length > 0) {
        throw new Error(`Batch code '${input.batchCode}' already exists in this tenant`);
      }

      return this.deps.rlsStore.insert("coaching_batches", {
        batch_code: input.batchCode,
        name: input.name,
        name_bn: input.nameBn || input.name,
        schedule_summary: input.scheduleSummary,
        capacity: input.capacity,
        waitlist_count: 0,
        monthly_fee: input.monthlyFee,
        fee_model: input.feeModel || "monthly",
        course_id: input.courseId,
        teacher_staff_id: input.teacherStaffId,
        status: "active",
      });
    });
  }

  enrollStudentInBatch(
    tenantId: string,
    input: {
      batchId: string;
      studentId: string;
      joinDate?: Date | string;
      siblingDiscountPct?: number;
      multiSubjectDiscountPct?: number;
    }
  ) {
    return RlsTenantStore.runWithTenantContext({ tenantId }, () => {
      const batch = this.deps.rlsStore.findById<any>("coaching_batches", input.batchId);
      if (!batch) throw new Error("Coaching batch not found");

      const currentEnrollments = this.deps.rlsStore.findMany<any>(
        "batch_enrollments",
        (e) => e.batch_id === input.batchId && e.status === "active"
      );

      const isWaitlisted = currentEnrollments.length >= Number(batch.capacity);
      if (isWaitlisted) {
        this.deps.rlsStore.updateById("coaching_batches", batch.id, {
          waitlist_count: Number(batch.waitlist_count || 0) + 1,
        });
      }

      const feeBreakdown = calculateProRatedCoachingFee({
        monthlyFeeBdt: Number(batch.monthly_fee),
        joinDate: input.joinDate || new Date(),
        siblingDiscountPct: input.siblingDiscountPct,
        multiSubjectDiscountPct: input.multiSubjectDiscountPct,
      });

      const enrollment = this.deps.rlsStore.insert("batch_enrollments", {
        batch_id: input.batchId,
        student_id: input.studentId,
        joined_date: input.joinDate || new Date(),
        discount_pct:
          (input.siblingDiscountPct || 0) + (input.multiSubjectDiscountPct || 0),
        is_waitlisted: isWaitlisted,
        status: isWaitlisted ? "waitlisted" : "active",
        pro_rated_fee: feeBreakdown,
      });

      return { enrollment, feeBreakdown, isWaitlisted };
    });
  }

  // ---------------------------------------------------------------------------
  // 2. Bangladesh 5.00 GPA Marksheets, Tabulation & PDF Generation
  // ---------------------------------------------------------------------------
  generateClassTabulationAndMeritList(
    tenantId: string,
    studentsScores: {
      studentId: string;
      studentName: string;
      subjects: SubjectScoreInput[];
    }[],
    options?: { enableFourthSubjectBonus?: boolean }
  ): StudentTermMarksheet[] {
    const sheets = studentsScores.map((st) =>
      calculateBangladeshTermGpa(st.subjects, {
        studentId: st.studentId,
        enableFourthSubjectBonus: options?.enableFourthSubjectBonus ?? true,
      })
    );
    return computeMeritPositions(sheets);
  }

  async generateBanglaMarksheetPdf(
    tenantId: string,
    input: {
      schoolNameBn: string;
      studentNameBn: string;
      studentCode: string;
      marksheet: StudentTermMarksheet;
    }
  ): Promise<Buffer> {
    const rowsHtml = input.marksheet.subjects
      .map(
        (s) =>
          `<tr><td>${s.subjectCode}</td><td>${s.subjectName}${s.isFourthSubject ? " (4th)" : ""}</td><td>${s.marksObtained}/${s.totalMarks}</td><td>${s.letterGrade}</td><td>${s.gradePoint.toFixed(2)}</td></tr>`
      )
      .join("");

    const html = `<!DOCTYPE html><html lang="bn"><head><meta charset="utf-8"/><style>body{font-family:'Noto Sans Bengali',sans-serif;}</style></head><body><h1>${input.schoolNameBn}</h1><h2>শিক্ষার্থী: ${input.studentNameBn} (${input.studentCode})</h2><table>${rowsHtml}</table><p>GPA: ${input.marksheet.finalGpa.toFixed(2)} (${input.marksheet.finalLetterGrade})</p></body></html>`;

    return this.deps.pdf.renderHtmlToPdf(html, { format: "A4" });
  }

  // ---------------------------------------------------------------------------
  // 3. Bangladeshi Payments: Manual bKash/Nagad TrxID + Accountant Verification
  // ---------------------------------------------------------------------------
  async submitManualMfsPayment(
    tenantId: string,
    input: {
      invoiceId: string;
      studentId: string;
      amountBdt: number;
      gateway: "bkash" | "nagad" | "rocket" | "upay" | "manual";
      transactionId: string;
      senderPhone: string;
      slipFileId?: string;
    }
  ) {
    const trx = input.transactionId.trim().toUpperCase();
    if (!trx) {
      throw new Error("Transaction ID (TrxID) is required");
    }

    return RlsTenantStore.runWithTenantContext({ tenantId }, () => {
      // Enforce UNIQUE (tenant_id, gateway, transaction_id)
      const duplicate = this.deps.rlsStore.findMany<any>(
        "payments",
        (p) =>
          p.gateway === input.gateway &&
          String(p.transaction_id).toUpperCase() === trx
      );
      if (duplicate.length > 0) {
        throw new Error(
          `Duplicate Transaction ID: '${trx}' has already been submitted for gateway '${input.gateway}'`
        );
      }

      const paymentCode = `PAY-${this.deps.idGen.newUuid().slice(0, 8).toUpperCase()}`;
      return this.deps.rlsStore.insert("payments", {
        payment_code: paymentCode,
        invoice_id: input.invoiceId,
        student_id: input.studentId,
        amount: Number(input.amountBdt.toFixed(2)),
        payment_method: "mfs_manual",
        gateway: input.gateway,
        transaction_id: trx,
        sender_phone: input.senderPhone,
        slip_file_id: input.slipFileId || null,
        verification_status: "pending_verification",
      });
    });
  }

  async verifyManualMfsPayment(
    tenantId: string,
    input: {
      paymentId: string;
      approverStaffId: string;
      decision: "verified" | "rejected";
      openInvoices?: {
        invoiceId: string;
        dueDate: Date | string;
        netAmount: number;
        paidAmount: number;
      }[];
    }
  ) {
    const result = RlsTenantStore.runWithTenantContext(
      { tenantId, actorUserId: input.approverStaffId },
      () => {
        const payment = this.deps.rlsStore.findById<any>("payments", input.paymentId);
        if (!payment) throw new Error("Payment record not found");
        if (payment.verification_status !== "pending_verification") {
          throw new Error(`Payment is already '${payment.verification_status}'`);
        }

        const updatedPayment = this.deps.rlsStore.updateById<any>(
          "payments",
          input.paymentId,
          {
            verification_status: input.decision,
            verified_by_staff_id: input.approverStaffId,
          }
        );

        let allocationResult = {
          allocations: [] as ReturnType<typeof allocatePaymentOldestDueFirst>["allocations"],
          unallocatedAdvanceBdt: 0,
        };

        if (
          input.decision === "verified" &&
          input.openInvoices &&
          input.openInvoices.length > 0
        ) {
          allocationResult = allocatePaymentOldestDueFirst(
            Number(payment.amount),
            input.openInvoices
          );
          for (const alloc of allocationResult.allocations) {
            this.deps.rlsStore.insert("payment_allocations", {
              payment_id: payment.id,
              invoice_id: alloc.invoiceId,
              allocated_amount: alloc.allocatedAmount,
            });
          }
        }

        return { payment: updatedPayment, ...allocationResult };
      }
    );

    await this.deps.audit.record({
      tenantId,
      actorUserId: input.approverStaffId,
      action: `payment.trx_${input.decision}`,
      entityType: "Payment",
      entityId: input.paymentId,
      metadata: {
        decision: input.decision,
        allocationsCount: result.allocations.length,
      },
    });

    return result;
  }

  // ---------------------------------------------------------------------------
  // 4. SMS Wallet & BTRC-Compliant Notifications
  // ---------------------------------------------------------------------------
  async sendTenantSms(
    tenantId: string,
    input: {
      to: string;
      message: string;
      senderId?: string;
      isPromotional?: boolean;
      preferredDriver?: string;
      tenantSmsCreditsAvailable: number;
    }
  ) {
    const adapter = this.deps.providerResolver.resolveSms(
      tenantId,
      input.preferredDriver
    );

    const res = await adapter.send(input.to, input.message, {
      senderId: input.senderId,
      isPromotional: input.isPromotional,
      tenantId,
    });

    if (input.tenantSmsCreditsAvailable < res.segmentCount) {
      throw new Error(
        `Insufficient tenant SMS credits: requires ${res.segmentCount} segment(s), available ${input.tenantSmsCreditsAvailable}`
      );
    }

    const logEntry = RlsTenantStore.runWithTenantContext({ tenantId }, () =>
      this.deps.rlsStore.insert("sms_logs", {
        recipient_phone: input.to,
        message_body: input.message,
        encoding: res.encoding,
        character_count: res.characterCount,
        segment_count: res.segmentCount,
        sender_id: input.senderId || "CAMPUSBABA",
        gateway: res.gateway,
        gateway_message_id: res.gatewayMessageId,
        status: res.status,
      })
    );

    return {
      smsLog: logEntry,
      remainingCredits: input.tenantSmsCreditsAvailable - res.segmentCount,
      ...res,
    };
  }

  // ---------------------------------------------------------------------------
  // 5. Library, Transport & Hostel Operations
  // ---------------------------------------------------------------------------
  addLibraryBook(
    tenantId: string,
    input: {
      barcode: string;
      title: string;
      titleBn?: string;
      author: string;
      category: string;
      totalCopies: number;
      isbn?: string;
    }
  ) {
    return RlsTenantStore.runWithTenantContext({ tenantId }, () =>
      this.deps.rlsStore.insert("library_books", {
        barcode: input.barcode,
        isbn: input.isbn || null,
        title: input.title,
        title_bn: input.titleBn || input.title,
        author: input.author,
        category: input.category,
        total_copies: input.totalCopies,
        available_copies: input.totalCopies,
      })
    );
  }

  issueLibraryBook(
    tenantId: string,
    input: { bookId: string; studentId: string; dueDate: string }
  ) {
    return RlsTenantStore.runWithTenantContext({ tenantId }, () => {
      const book = this.deps.rlsStore.findById<any>("library_books", input.bookId);
      if (!book) throw new Error("Book not found");
      if (Number(book.available_copies) <= 0) {
        throw new Error("No copies currently available for loan");
      }

      this.deps.rlsStore.updateById("library_books", book.id, {
        available_copies: Number(book.available_copies) - 1,
      });

      return this.deps.rlsStore.insert("library_loans", {
        book_id: book.id,
        borrower_student_id: input.studentId,
        issued_at: new Date(),
        due_date: input.dueDate,
        fine_amount: 0,
        status: "issued",
      });
    });
  }

  createTransportRoute(
    tenantId: string,
    input: {
      routeCode: string;
      name: string;
      nameBn?: string;
      stops: { name: string; feeBdt: number }[];
      monthlyFee: number;
    }
  ) {
    return RlsTenantStore.runWithTenantContext({ tenantId }, () =>
      this.deps.rlsStore.insert("transport_routes", {
        route_code: input.routeCode,
        name: input.name,
        name_bn: input.nameBn || input.name,
        stops: input.stops,
        monthly_fee: input.monthlyFee,
        status: "active",
      })
    );
  }

  allocateHostelBed(
    tenantId: string,
    input: {
      buildingName: string;
      roomNumber: string;
      genderPolicy: "male" | "female";
      bedCapacity: number;
      monthlySeatRent: number;
      studentId: string;
      bedNumber: string;
    }
  ) {
    return RlsTenantStore.runWithTenantContext({ tenantId }, () => {
      let room = this.deps.rlsStore.findMany<any>(
        "hostel_rooms",
        (r) =>
          r.building_name === input.buildingName &&
          r.room_number === input.roomNumber
      )[0];

      if (!room) {
        room = this.deps.rlsStore.insert("hostel_rooms", {
          building_name: input.buildingName,
          room_number: input.roomNumber,
          gender_policy: input.genderPolicy,
          bed_capacity: input.bedCapacity,
          occupied_beds: 0,
          monthly_seat_rent: input.monthlySeatRent,
        });
      }

      if (Number(room.occupied_beds) >= Number(room.bed_capacity)) {
        throw new Error("Hostel room is at full bed capacity");
      }

      this.deps.rlsStore.updateById("hostel_rooms", room.id, {
        occupied_beds: Number(room.occupied_beds) + 1,
      });

      return this.deps.rlsStore.insert("hostel_allocations", {
        room_id: room.id,
        student_id: input.studentId,
        bed_number: input.bedNumber,
        allocated_date: new Date().toISOString().slice(0, 10),
        status: "active",
      });
    });
  }

  // ---------------------------------------------------------------------------
  // 6. Listing, Study Materials (Subject-Wise PDFs), MCQ Quizzes & Assignments
  // ---------------------------------------------------------------------------
  listBatches(tenantId: string) {
    return RlsTenantStore.runWithTenantContext({ tenantId }, () => {
      const batches = this.deps.rlsStore.findMany<any>("coaching_batches");
      const enrollments = this.deps.rlsStore.findMany<any>("batch_enrollments");
      return batches.map((b) => {
        const batchEnrollments = enrollments.filter((e) => e.batch_id === b.id);
        return {
          ...b,
          activeCount: batchEnrollments.filter((e) => !e.is_waitlisted).length,
          waitlistCount: batchEnrollments.filter((e) => e.is_waitlisted).length,
          enrollments: batchEnrollments,
        };
      });
    });
  }

  listLibraryBooks(tenantId: string) {
    return RlsTenantStore.runWithTenantContext({ tenantId }, () =>
      this.deps.rlsStore.findMany<any>("library_books")
    );
  }

  listLibraryLoans(tenantId: string) {
    return RlsTenantStore.runWithTenantContext({ tenantId }, () =>
      this.deps.rlsStore.findMany<any>("library_loans")
    );
  }

  listSmsLogs(tenantId: string) {
    return RlsTenantStore.runWithTenantContext({ tenantId }, () =>
      this.deps.rlsStore
        .findMany<any>("sms_logs")
        .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    );
  }

  listMfsPayments(tenantId: string, studentId?: string) {
    return RlsTenantStore.runWithTenantContext({ tenantId }, () =>
      this.deps.rlsStore.findMany<any>(
        "payments",
        (p) => p.payment_method === "mfs_manual" && (!studentId || p.student_id === studentId)
      )
    );
  }

  attachStudyMaterialMetadata(
    tenantId: string,
    fileId: string,
    meta: {
      title: string;
      subject: string;
      batchName?: string;
      courseName?: string;
      description?: string;
      uploadedByName?: string;
    }
  ) {
    return RlsTenantStore.runWithTenantContext({ tenantId }, () =>
      this.deps.rlsStore.updateById("files", fileId, {
        title: meta.title,
        subject: meta.subject,
        batch_name: meta.batchName || "All Batches",
        course_name: meta.courseName || "",
        description: meta.description || "",
        uploaded_by_name: meta.uploadedByName || "Teacher",
      })
    );
  }

  listStudyMaterials(
    tenantId: string,
    filters?: { subject?: string; batchName?: string; search?: string }
  ) {
    return RlsTenantStore.runWithTenantContext({ tenantId }, () => {
      const items = this.deps.rlsStore.findMany<any>(
        "files",
        (f) => f.module === "lecture-sheets" && f.status === "ready"
      );
      const q = filters?.search?.trim().toLowerCase();
      return items.filter((item) => {
        if (filters?.subject && filters.subject !== "all" && item.subject !== filters.subject) {
          return false;
        }
        if (
          filters?.batchName &&
          filters.batchName !== "all" &&
          item.batch_name !== filters.batchName
        ) {
          return false;
        }
        if (q) {
          const hay = `${item.title || ""} ${item.subject || ""} ${item.original_name || ""} ${item.description || ""}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });
    });
  }

  deleteStudyMaterial(tenantId: string, fileId: string) {
    return RlsTenantStore.runWithTenantContext({ tenantId }, () =>
      this.deps.rlsStore.updateById("files", fileId, { status: "deleted" })
    );
  }

  createMcqQuiz(
    tenantId: string,
    input: {
      title: string;
      subject: string;
      batchName?: string;
      durationMinutes?: number;
      negativeMarkPerWrong?: number;
      createdByName?: string;
      questions: {
        questionId?: string;
        questionText: string;
        options: string[];
        correctOptionIndex: number;
        marks?: number;
      }[];
    }
  ) {
    return RlsTenantStore.runWithTenantContext({ tenantId }, () => {
      const normalizedQuestions = input.questions.map((q, idx) => ({
        questionId: q.questionId || `q-${idx + 1}`,
        questionText: q.questionText,
        options: q.options,
        correctOptionIndex: q.correctOptionIndex,
        marks: q.marks ?? 1,
      }));
      return this.deps.rlsStore.insert("mcq_questions", {
        record_type: "quiz",
        title: input.title,
        subject: input.subject,
        batch_name: input.batchName || "All Batches",
        duration_minutes: input.durationMinutes ?? 20,
        negative_mark_per_wrong: input.negativeMarkPerWrong ?? 0.25,
        created_by_name: input.createdByName || "Teacher",
        questions: normalizedQuestions,
      });
    });
  }

  listMcqQuizzes(tenantId: string, includeCorrectAnswers: boolean) {
    return RlsTenantStore.runWithTenantContext({ tenantId }, () => {
      const quizzes = this.deps.rlsStore.findMany<any>(
        "mcq_questions",
        (r) => r.record_type === "quiz"
      );
      if (includeCorrectAnswers) return quizzes;
      return quizzes.map((qz) => ({
        ...qz,
        questions: (qz.questions || []).map((q: any) => ({
          questionId: q.questionId,
          questionText: q.questionText,
          options: q.options,
          marks: q.marks,
        })),
      }));
    });
  }

  submitMcqQuizAttempt(
    tenantId: string,
    input: {
      quizId: string;
      studentId: string;
      studentName: string;
      answers: { questionId: string; selectedOptionIndex: number | null }[];
    }
  ) {
    return RlsTenantStore.runWithTenantContext({ tenantId }, () => {
      const quiz = this.deps.rlsStore.findById<any>("mcq_questions", input.quizId);
      if (!quiz || quiz.record_type !== "quiz") {
        throw new Error("MCQ quiz not found");
      }
      const answersMap: Record<string, number | null> = {};
      for (const a of input.answers) {
        answersMap[a.questionId] = a.selectedOptionIndex;
      }
      const evaluation = evaluateMcqSubmission({
        questions: (quiz.questions || []).map((q: any) => ({
          id: q.questionId,
          correctOptionIndex: q.correctOptionIndex,
          marks: q.marks ?? 1,
        })),
        answers: answersMap,
        negativeMarkPerWrong: quiz.negative_mark_per_wrong ?? 0.25,
      });
      const maxPossibleMarks = (quiz.questions || []).reduce(
        (sum: number, q: any) => sum + (Number(q.marks) || 1),
        0
      );
      const fullEvaluation = { ...evaluation, maxPossibleMarks };
      const submission = this.deps.rlsStore.insert("mcq_questions", {
        record_type: "submission",
        quiz_id: quiz.id,
        quiz_title: quiz.title,
        subject: quiz.subject,
        student_id: input.studentId,
        student_name: input.studentName,
        answers: input.answers,
        evaluation: fullEvaluation,
      });
      return { submission, evaluation: fullEvaluation };
    });
  }

  listMcqSubmissions(tenantId: string, studentId?: string) {
    return RlsTenantStore.runWithTenantContext({ tenantId }, () =>
      this.deps.rlsStore.findMany<any>(
        "mcq_questions",
        (r) => r.record_type === "submission" && (!studentId || r.student_id === studentId)
      )
    );
  }

  createAssignment(
    tenantId: string,
    input: {
      title: string;
      subject: string;
      batchName?: string;
      dueDate: string;
      maxMarks?: number;
      description: string;
      teacherName?: string;
    }
  ) {
    return RlsTenantStore.runWithTenantContext({ tenantId }, () =>
      this.deps.rlsStore.insert("notices", {
        record_type: "assignment",
        title: input.title,
        subject: input.subject,
        batch_name: input.batchName || "All Batches",
        due_date: input.dueDate,
        max_marks: input.maxMarks ?? 20,
        description: input.description,
        teacher_name: input.teacherName || "Teacher",
      })
    );
  }

  listAssignments(tenantId: string, studentId?: string) {
    return RlsTenantStore.runWithTenantContext({ tenantId }, () => {
      const assignments = this.deps.rlsStore.findMany<any>(
        "notices",
        (n) => n.record_type === "assignment"
      );
      const submissions = this.deps.rlsStore.findMany<any>(
        "notices",
        (n) => n.record_type === "assignment_submission"
      );
      return assignments.map((a) => {
        const allSubs = submissions.filter((s) => s.assignment_id === a.id);
        const mySub = studentId ? allSubs.find((s) => s.student_id === studentId) : null;
        return {
          ...a,
          submissionCount: allSubs.length,
          mySubmission: mySub || null,
          submissions: studentId ? undefined : allSubs,
        };
      });
    });
  }

  submitAssignment(
    tenantId: string,
    input: {
      assignmentId: string;
      studentId: string;
      studentName: string;
      submissionText: string;
      attachmentUrl?: string;
    }
  ) {
    return RlsTenantStore.runWithTenantContext({ tenantId }, () => {
      const assignment = this.deps.rlsStore.findById<any>("notices", input.assignmentId);
      if (!assignment || assignment.record_type !== "assignment") {
        throw new Error("Assignment not found");
      }
      return this.deps.rlsStore.insert("notices", {
        record_type: "assignment_submission",
        assignment_id: assignment.id,
        student_id: input.studentId,
        student_name: input.studentName,
        submission_text: input.submissionText,
        attachment_url: input.attachmentUrl || "",
        status: "submitted",
      });
    });
  }

  // Expose pure domain helpers for controllers
  evaluateMcq(params: Parameters<typeof evaluateMcqSubmission>[0]) {
    return evaluateMcqSubmission(params);
  }

  calculatePayroll(params: Parameters<typeof calculateTeacherPayroll>[0]) {
    return calculateTeacherPayroll(params);
  }
}
