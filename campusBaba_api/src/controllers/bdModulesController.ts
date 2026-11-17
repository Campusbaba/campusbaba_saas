import { Request, Response } from "express";
import { asyncHandler } from "../middlewares/asyncHandler";
import { AppError } from "../middlewares/errorHandler";
import { container } from "../composition/container";

// ---------------------------------------------------------------------------
// 1. Document Storage (Cloudflare R2 / StoragePort) Endpoints
// ---------------------------------------------------------------------------
export const requestUploadUrl = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenant?.subdomain || req.resolvedTenantSlug;
  if (!tenantId) throw new AppError(400, "Tenant context required");

  const { module, entityType, entityId, originalName, mimeType, sizeBytes, isSensitive } = req.body;
  if (!module || !entityType || !entityId || !originalName || !mimeType || !sizeBytes) {
    throw new AppError(
      400,
      "module, entityType, entityId, originalName, mimeType, and sizeBytes are required"
    );
  }

  try {
    const result = await container.fileStorage.requestSignedUpload({
      tenantId,
      tenantQuotaMb: req.tenant?.storageLimitMb || 500,
      module,
      entityType,
      entityId,
      originalName,
      mimeType,
      sizeBytes: Number(sizeBytes),
      uploadedByUserId: req.user?.id || "system",
      isSensitive,
    });

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (err: any) {
    throw new AppError(400, err.message || "Failed to generate upload URL");
  }
});

export const uploadBufferDirect = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenant?.subdomain || req.resolvedTenantSlug;
  if (!tenantId) throw new AppError(400, "Tenant context required");

  const {
    module,
    entityType,
    entityId,
    originalName,
    mimeType,
    base64Content,
    isSensitive,
  } = req.body;

  if (!module || !entityType || !entityId || !originalName || !mimeType || !base64Content) {
    throw new AppError(
      400,
      "module, entityType, entityId, originalName, mimeType, and base64Content are required"
    );
  }

  const buffer = Buffer.from(base64Content, "base64");

  try {
    const fileRecord = await container.fileStorage.uploadAndConfirmBuffer({
      tenantId,
      tenantQuotaMb: req.tenant?.storageLimitMb || 500,
      module,
      entityType,
      entityId,
      originalName,
      declaredMimeType: mimeType,
      buffer,
      uploadedByUserId: req.user?.id || "system",
      isSensitive,
    });

    res.status(201).json({
      success: true,
      data: fileRecord,
    });
  } catch (err: any) {
    throw new AppError(400, err.message || "File upload failed");
  }
});

export const getFileDownloadUrl = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenant?.subdomain || req.resolvedTenantSlug;
  if (!tenantId) throw new AppError(400, "Tenant context required");

  const { id } = req.params;
  const allowedEntityIds =
    req.user?.role === "student" || req.user?.role === "parent"
      ? [req.user.referenceId]
      : undefined;

  try {
    const result = await container.fileStorage.getAuthorizedDownloadUrl({
      tenantId,
      fileId: id,
      actorUserId: req.user?.id || "anonymous",
      actorRole: req.user?.role || "admin",
      allowedEntityIds,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err: any) {
    const status = String(err.message).includes("Access denied") ? 403 : 404;
    throw new AppError(status, err.message);
  }
});

// ---------------------------------------------------------------------------
// 2. Coaching Batches & MCQ Auto-Grading Endpoints
// ---------------------------------------------------------------------------
export const createBatch = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenant?.subdomain || req.resolvedTenantSlug!;
  try {
    const batch = container.bdModules.createCoachingBatch(tenantId, req.body);
    res.status(201).json({ success: true, data: batch });
  } catch (err: any) {
    throw new AppError(400, err.message);
  }
});

export const enrollInBatch = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenant?.subdomain || req.resolvedTenantSlug!;
  try {
    const result = container.bdModules.enrollStudentInBatch(tenantId, {
      ...req.body,
      batchId: req.params.batchId,
    });
    res.status(201).json({ success: true, data: result });
  } catch (err: any) {
    throw new AppError(400, err.message);
  }
});

export const gradeMcqExam = asyncHandler(async (req: Request, res: Response) => {
  const { questions, answers, negativeMarkPerWrong } = req.body;
  if (!Array.isArray(questions) || !answers) {
    throw new AppError(400, "questions array and answers map are required");
  }
  const result = container.bdModules.evaluateMcq({
    questions,
    answers,
    negativeMarkPerWrong,
  });
  res.status(200).json({ success: true, data: result });
});

// ---------------------------------------------------------------------------
// 3. Bangladesh 5.00 GPA Tabulation & Marksheet PDF Endpoints
// ---------------------------------------------------------------------------
export const calculateClassMeritTabulation = asyncHandler(
  async (req: Request, res: Response) => {
    const tenantId = req.tenant?.subdomain || req.resolvedTenantSlug!;
    const { studentsScores, enableFourthSubjectBonus } = req.body;
    if (!Array.isArray(studentsScores)) {
      throw new AppError(400, "studentsScores array is required");
    }

    const sheets = container.bdModules.generateClassTabulationAndMeritList(
      tenantId,
      studentsScores,
      { enableFourthSubjectBonus }
    );
    res.status(200).json({ success: true, data: sheets });
  }
);

export const renderMarksheetPdf = asyncHandler(
  async (req: Request, res: Response) => {
    const tenantId = req.tenant?.subdomain || req.resolvedTenantSlug!;
    const { schoolNameBn, studentNameBn, studentCode, subjects } = req.body;
    if (!subjects || !Array.isArray(subjects)) {
      throw new AppError(400, "subjects array is required");
    }

    const [sheet] = container.bdModules.generateClassTabulationAndMeritList(
      tenantId,
      [{ studentId: studentCode, studentName: studentNameBn, subjects }]
    );

    const pdfBuffer = await container.bdModules.generateBanglaMarksheetPdf(
      tenantId,
      {
        schoolNameBn: schoolNameBn || req.tenant?.name || "ক্যাম্পাসবাবা স্কুল",
        studentNameBn: studentNameBn || "শিক্ষার্থী",
        studentCode: studentCode || "STU-0001",
        marksheet: sheet,
      }
    );

    res.status(200).json({
      success: true,
      data: {
        marksheet: sheet,
        pdfBase64: pdfBuffer.toString("base64"),
        mimeType: "application/pdf",
      },
    });
  }
);

// ---------------------------------------------------------------------------
// 4. Bangladeshi MFS Manual TrxID Submission & Accountant Verification
// ---------------------------------------------------------------------------
export const submitMfsTrxPayment = asyncHandler(
  async (req: Request, res: Response) => {
    const tenantId = req.tenant?.subdomain || req.resolvedTenantSlug!;
    try {
      const payment = await container.bdModules.submitManualMfsPayment(
        tenantId,
        req.body
      );
      res.status(201).json({
        success: true,
        message: "MFS Transaction ID submitted for accountant verification",
        data: payment,
      });
    } catch (err: any) {
      throw new AppError(400, err.message);
    }
  }
);

export const verifyMfsTrxPayment = asyncHandler(
  async (req: Request, res: Response) => {
    const tenantId = req.tenant?.subdomain || req.resolvedTenantSlug!;
    try {
      const result = await container.bdModules.verifyManualMfsPayment(tenantId, {
        paymentId: req.params.paymentId,
        approverStaffId: req.user?.id || "accountant",
        decision: req.body.decision,
        openInvoices: req.body.openInvoices,
      });
      res.status(200).json({
        success: true,
        message: `Transaction ${req.body.decision}`,
        data: result,
      });
    } catch (err: any) {
      throw new AppError(400, err.message);
    }
  }
);

// ---------------------------------------------------------------------------
// 5. BTRC-Compliant SMS Gateway Endpoint
// ---------------------------------------------------------------------------
export const sendSmsNotification = asyncHandler(
  async (req: Request, res: Response) => {
    const tenantId = req.tenant?.subdomain || req.resolvedTenantSlug!;
    try {
      const result = await container.bdModules.sendTenantSms(tenantId, {
        to: req.body.to,
        message: req.body.message,
        senderId: req.body.senderId,
        isPromotional: req.body.isPromotional,
        preferredDriver: req.body.preferredDriver,
        tenantSmsCreditsAvailable: req.tenant?.smsCredits ?? 1000,
      });
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err: any) {
      throw new AppError(400, err.message);
    }
  }
);

// ---------------------------------------------------------------------------
// 6. Library, Transport & Hostel Endpoints
// ---------------------------------------------------------------------------
export const createLibraryBook = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenant?.subdomain || req.resolvedTenantSlug!;
  try {
    const book = container.bdModules.addLibraryBook(tenantId, req.body);
    res.status(201).json({ success: true, data: book });
  } catch (err: any) {
    throw new AppError(400, err.message);
  }
});

export const issueLibraryBook = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenant?.subdomain || req.resolvedTenantSlug!;
  try {
    const loan = container.bdModules.issueLibraryBook(tenantId, req.body);
    res.status(201).json({ success: true, data: loan });
  } catch (err: any) {
    throw new AppError(400, err.message);
  }
});

export const createTransportRoute = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenant?.subdomain || req.resolvedTenantSlug!;
  try {
    const route = container.bdModules.createTransportRoute(tenantId, req.body);
    res.status(201).json({ success: true, data: route });
  } catch (err: any) {
    throw new AppError(400, err.message);
  }
});

export const allocateHostelRoomBed = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenant?.subdomain || req.resolvedTenantSlug!;
  try {
    const allocation = container.bdModules.allocateHostelBed(tenantId, req.body);
    res.status(201).json({ success: true, data: allocation });
  } catch (err: any) {
    throw new AppError(400, err.message);
  }
});

// ---------------------------------------------------------------------------
// 6. Listing, Subject-Wise PDF Study Materials, MCQ Quizzes & Assignments
// ---------------------------------------------------------------------------
export const listBatches = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenant?.subdomain || req.resolvedTenantSlug!;
  const batches = container.bdModules.listBatches(tenantId);
  res.json({ success: true, data: batches });
});

export const listLibraryBooks = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenant?.subdomain || req.resolvedTenantSlug!;
  const books = container.bdModules.listLibraryBooks(tenantId);
  res.json({ success: true, data: books });
});

export const listLibraryLoans = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenant?.subdomain || req.resolvedTenantSlug!;
  const loans = container.bdModules.listLibraryLoans(tenantId);
  res.json({ success: true, data: loans });
});

export const listSmsLogs = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenant?.subdomain || req.resolvedTenantSlug!;
  const logs = container.bdModules.listSmsLogs(tenantId);
  res.json({ success: true, data: logs });
});

export const listMfsPayments = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenant?.subdomain || req.resolvedTenantSlug!;
  const studentId =
    req.user?.role === "student" ? req.user.referenceId || req.user.id : (req.query.studentId as string | undefined);
  const payments = container.bdModules.listMfsPayments(tenantId, studentId);
  res.json({ success: true, data: payments });
});

export const listStudyMaterials = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenant?.subdomain || req.resolvedTenantSlug!;
  const { subject, batchName, search } = req.query as Record<string, string | undefined>;
  const materials = container.bdModules.listStudyMaterials(tenantId, {
    subject,
    batchName,
    search,
  });
  res.json({ success: true, data: materials });
});

export const uploadStudyMaterial = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenant?.subdomain || req.resolvedTenantSlug!;
  const {
    title,
    subject,
    batchName,
    courseName,
    description,
    originalName,
    mimeType,
    base64Content,
  } = req.body;

  if (!title || !subject || !originalName || !base64Content) {
    throw new AppError(400, "title, subject, originalName, and base64Content are required");
  }

  const buffer = Buffer.from(base64Content, "base64");
  try {
    const fileRecord = await container.fileStorage.uploadAndConfirmBuffer({
      tenantId,
      tenantQuotaMb: req.tenant?.storageLimitMb || 500,
      module: "lecture-sheets",
      entityType: "study_material",
      entityId: subject.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "general",
      originalName,
      declaredMimeType: mimeType || "application/pdf",
      buffer,
      uploadedByUserId: req.user?.id || "system",
      isSensitive: false,
    });

    const enriched = container.bdModules.attachStudyMaterialMetadata(tenantId, fileRecord.id, {
      title,
      subject,
      batchName,
      courseName,
      description,
      uploadedByName: req.user?.email || "Teacher",
    });

    res.status(201).json({ success: true, data: enriched });
  } catch (err: any) {
    throw new AppError(400, err.message || "Failed to upload study material");
  }
});

export const viewStudyMaterialPdf = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenant?.subdomain || req.resolvedTenantSlug!;
  const { id } = req.params;
  try {
    const { buffer, file } = await container.fileStorage.getAuthorizedFileBuffer({
      tenantId,
      fileId: id,
      actorUserId: req.user?.id || "system",
    });
    const download = req.query.download === "1";
    res.setHeader("Content-Type", file.mime_type || "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `${download ? "attachment" : "inline"}; filename="${file.original_name}"`
    );
    res.send(buffer);
  } catch (err: any) {
    throw new AppError(404, err.message || "Study material file not found");
  }
});

export const deleteStudyMaterial = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenant?.subdomain || req.resolvedTenantSlug!;
  const updated = container.bdModules.deleteStudyMaterial(tenantId, req.params.id);
  if (!updated) throw new AppError(404, "Study material not found");
  res.json({ success: true, data: updated });
});

export const createMcqQuiz = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenant?.subdomain || req.resolvedTenantSlug!;
  const { title, subject, batchName, durationMinutes, negativeMarkPerWrong, questions } = req.body;
  if (!title || !subject || !Array.isArray(questions) || questions.length === 0) {
    throw new AppError(400, "title, subject, and at least one question are required");
  }
  const quiz = container.bdModules.createMcqQuiz(tenantId, {
    title,
    subject,
    batchName,
    durationMinutes: Number(durationMinutes) || 20,
    negativeMarkPerWrong: negativeMarkPerWrong !== undefined ? Number(negativeMarkPerWrong) : 0.25,
    createdByName: req.user?.email || "Teacher",
    questions,
  });
  res.status(201).json({ success: true, data: quiz });
});

export const listMcqQuizzes = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenant?.subdomain || req.resolvedTenantSlug!;
  const includeAnswers =
    req.user?.role === "admin" || req.user?.role === "superadmin" || req.user?.role === "teacher";
  const quizzes = container.bdModules.listMcqQuizzes(tenantId, includeAnswers);
  res.json({ success: true, data: quizzes });
});

export const submitMcqQuizAttempt = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenant?.subdomain || req.resolvedTenantSlug!;
  const { answers } = req.body;
  if (!Array.isArray(answers)) {
    throw new AppError(400, "answers array is required");
  }
  try {
    const result = container.bdModules.submitMcqQuizAttempt(tenantId, {
      quizId: req.params.quizId,
      studentId: req.user?.referenceId || req.user?.id || "student",
      studentName: req.user?.email || "Student",
      answers,
    });
    res.status(201).json({ success: true, data: result });
  } catch (err: any) {
    throw new AppError(400, err.message);
  }
});

export const listMcqSubmissions = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenant?.subdomain || req.resolvedTenantSlug!;
  const studentId =
    req.user?.role === "student" ? req.user.referenceId || req.user.id : undefined;
  const submissions = container.bdModules.listMcqSubmissions(tenantId, studentId);
  res.json({ success: true, data: submissions });
});

export const createAssignment = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenant?.subdomain || req.resolvedTenantSlug!;
  const { title, subject, batchName, dueDate, maxMarks, description } = req.body;
  if (!title || !subject || !dueDate || !description) {
    throw new AppError(400, "title, subject, dueDate, and description are required");
  }
  const assignment = container.bdModules.createAssignment(tenantId, {
    title,
    subject,
    batchName,
    dueDate,
    maxMarks: Number(maxMarks) || 20,
    description,
    teacherName: req.user?.email || "Teacher",
  });
  res.status(201).json({ success: true, data: assignment });
});

export const listAssignments = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenant?.subdomain || req.resolvedTenantSlug!;
  const studentId =
    req.user?.role === "student" ? req.user.referenceId || req.user.id : undefined;
  const assignments = container.bdModules.listAssignments(tenantId, studentId);
  res.json({ success: true, data: assignments });
});

export const submitAssignment = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenant?.subdomain || req.resolvedTenantSlug!;
  const { submissionText, attachmentUrl } = req.body;
  if (!submissionText) {
    throw new AppError(400, "submissionText is required");
  }
  try {
    const submission = container.bdModules.submitAssignment(tenantId, {
      assignmentId: req.params.id,
      studentId: req.user?.referenceId || req.user?.id || "student",
      studentName: req.user?.email || "Student",
      submissionText,
      attachmentUrl,
    });
    res.status(201).json({ success: true, data: submission });
  } catch (err: any) {
    throw new AppError(400, err.message);
  }
});
