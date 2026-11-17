import { Router } from "express";
import * as bdCtrl from "../controllers/bdModulesController";
import { authenticate, authorize } from "../middlewares/authMiddleware";
import { PERMISSIONS } from "../domain/rbac/Permissions";

const router = Router();

// All Bangladesh & Storage module routes require tenant authentication
router.use(authenticate);

// Cloudflare R2 / StoragePort Endpoints
router.post(
  "/files/upload-url",
  authorize(PERMISSIONS.FILES_UPLOAD),
  bdCtrl.requestUploadUrl
);
router.post(
  "/files/upload-direct",
  authorize(PERMISSIONS.FILES_UPLOAD),
  bdCtrl.uploadBufferDirect
);
router.get(
  "/files/:id/download-url",
  authorize(PERMISSIONS.FILES_READ),
  bdCtrl.getFileDownloadUrl
);

// Coaching Batches & MCQ Auto-Grading
router.post(
  "/batches",
  authorize(PERMISSIONS.BATCHES_WRITE),
  bdCtrl.createBatch
);
router.post(
  "/batches/:batchId/enroll",
  authorize(PERMISSIONS.BATCHES_WRITE),
  bdCtrl.enrollInBatch
);
router.post(
  "/exams/mcq/evaluate",
  authorize(PERMISSIONS.MARKS_EVALUATE),
  bdCtrl.gradeMcqExam
);

// Bangladesh 5.00 GPA Tabulation & Marksheet PDF
router.post(
  "/academics/gpa-tabulation",
  authorize(PERMISSIONS.MARKS_READ),
  bdCtrl.calculateClassMeritTabulation
);
router.post(
  "/academics/marksheet-pdf",
  authorize(PERMISSIONS.MARKS_READ),
  bdCtrl.renderMarksheetPdf
);

// Bangladeshi MFS Manual TrxID Submission & Accountant Verification
router.post(
  "/mfs-payments/submit",
  authorize(PERMISSIONS.PAYMENTS_READ),
  bdCtrl.submitMfsTrxPayment
);
router.post(
  "/mfs-payments/:paymentId/verify",
  authorize(PERMISSIONS.PAYMENTS_VERIFY_TRX),
  bdCtrl.verifyMfsTrxPayment
);

// BTRC SMS Gateway
router.post(
  "/sms/send",
  authorize(PERMISSIONS.SMS_SEND),
  bdCtrl.sendSmsNotification
);

// Library, Transport & Hostel
router.post(
  "/library/books",
  authorize(PERMISSIONS.LIBRARY_WRITE),
  bdCtrl.createLibraryBook
);
router.post(
  "/library/loans",
  authorize(PERMISSIONS.LIBRARY_WRITE),
  bdCtrl.issueLibraryBook
);
router.post(
  "/transport/routes",
  authorize(PERMISSIONS.TRANSPORT_WRITE),
  bdCtrl.createTransportRoute
);
router.post(
  "/hostel/allocations",
  authorize(PERMISSIONS.HOSTEL_WRITE),
  bdCtrl.allocateHostelRoomBed
);

export default router;
