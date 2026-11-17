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
