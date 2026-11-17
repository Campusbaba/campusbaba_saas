import { Router } from "express";
import * as bdCtrl from "../controllers/bdModulesController";
import {
  authenticate,
  authorize,
  requireFeatureFlag,
} from "../middlewares/authMiddleware";
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

// Coaching Batches & MCQ Auto-Grading (Governed by coachingBatches feature flag)
router.post(
  "/batches",
  requireFeatureFlag("coachingBatches"),
  authorize(PERMISSIONS.BATCHES_WRITE),
  bdCtrl.createBatch
);
router.post(
  "/batches/:batchId/enroll",
  requireFeatureFlag("coachingBatches"),
  authorize(PERMISSIONS.BATCHES_WRITE),
  bdCtrl.enrollInBatch
);
router.post(
  "/exams/mcq/evaluate",
  authorize(PERMISSIONS.MARKS_EVALUATE),
  bdCtrl.gradeMcqExam
);

// Bangladesh 5.00 GPA Tabulation & Marksheet PDF (Governed by gpa5Grading feature flag)
router.post(
  "/academics/gpa-tabulation",
  requireFeatureFlag("gpa5Grading"),
  authorize(PERMISSIONS.MARKS_READ),
  bdCtrl.calculateClassMeritTabulation
);
router.post(
  "/academics/marksheet-pdf",
  requireFeatureFlag("gpa5Grading"),
  authorize(PERMISSIONS.MARKS_READ),
  bdCtrl.renderMarksheetPdf
);

// Bangladeshi MFS Manual TrxID Submission & Accountant Verification
router.post(
  "/mfs-payments/submit",
  requireFeatureFlag("onlinePayments"),
  authorize(PERMISSIONS.PAYMENTS_READ),
  bdCtrl.submitMfsTrxPayment
);
router.post(
  "/mfs-payments/:paymentId/verify",
  requireFeatureFlag("onlinePayments"),
  authorize(PERMISSIONS.PAYMENTS_VERIFY_TRX),
  bdCtrl.verifyMfsTrxPayment
);

// BTRC SMS Gateway (Governed by sms feature flag)
router.post(
  "/sms/send",
  requireFeatureFlag("sms"),
  authorize(PERMISSIONS.SMS_SEND),
  bdCtrl.sendSmsNotification
);

// Library, Transport & Hostel (Governed by library, transport, hostel feature flags)
router.post(
  "/library/books",
  requireFeatureFlag("library"),
  authorize(PERMISSIONS.LIBRARY_WRITE),
  bdCtrl.createLibraryBook
);
router.post(
  "/library/loans",
  requireFeatureFlag("library"),
  authorize(PERMISSIONS.LIBRARY_WRITE),
  bdCtrl.issueLibraryBook
);
router.post(
  "/transport/routes",
  requireFeatureFlag("transport"),
  authorize(PERMISSIONS.TRANSPORT_WRITE),
  bdCtrl.createTransportRoute
);
router.post(
  "/hostel/allocations",
  requireFeatureFlag("hostel"),
  authorize(PERMISSIONS.HOSTEL_WRITE),
  bdCtrl.allocateHostelRoomBed
);

// Coaching Batches Listing
router.get(
  "/batches",
  requireFeatureFlag("coachingBatches"),
  authorize(PERMISSIONS.BATCHES_READ),
  bdCtrl.listBatches
);

// Subject-Wise PDF Lecture Sheets & Digital Study Library
router.get(
  "/materials",
  authorize(PERMISSIONS.FILES_READ),
  bdCtrl.listStudyMaterials
);
router.post(
  "/materials",
  authorize(PERMISSIONS.FILES_UPLOAD),
  bdCtrl.uploadStudyMaterial
);
router.get(
  "/materials/:id/view",
  authorize(PERMISSIONS.FILES_READ),
  bdCtrl.viewStudyMaterialPdf
);
router.delete(
  "/materials/:id",
  authorize(PERMISSIONS.FILES_UPLOAD),
  bdCtrl.deleteStudyMaterial
);

// Library Listings
router.get(
  "/library/books",
  requireFeatureFlag("library"),
  authorize(PERMISSIONS.LIBRARY_READ),
  bdCtrl.listLibraryBooks
);
router.get(
  "/library/loans",
  requireFeatureFlag("library"),
  authorize(PERMISSIONS.LIBRARY_READ),
  bdCtrl.listLibraryLoans
);

// SMS Logs & MFS Payment Listings
router.get(
  "/sms/logs",
  requireFeatureFlag("sms"),
  authorize(PERMISSIONS.SMS_SEND),
  bdCtrl.listSmsLogs
);
router.get(
  "/mfs-payments",
  authorize(PERMISSIONS.PAYMENTS_READ),
  bdCtrl.listMfsPayments
);

// Online MCQ Practice & Auto-Grading Quizzes
router.get(
  "/mcq",
  authorize(PERMISSIONS.EXAMS_READ),
  bdCtrl.listMcqQuizzes
);
router.post(
  "/mcq",
  authorize(PERMISSIONS.EXAMS_WRITE),
  bdCtrl.createMcqQuiz
);
router.post(
  "/mcq/:quizId/submit",
  authorize(PERMISSIONS.EXAMS_READ),
  bdCtrl.submitMcqQuizAttempt
);
router.get(
  "/mcq/submissions",
  authorize(PERMISSIONS.EXAMS_READ),
  bdCtrl.listMcqSubmissions
);

// Homework & Assignments
router.get(
  "/assignments",
  authorize(PERMISSIONS.ACADEMICS_READ),
  bdCtrl.listAssignments
);
router.post(
  "/assignments",
  authorize(PERMISSIONS.EXAMS_WRITE),
  bdCtrl.createAssignment
);
router.post(
  "/assignments/:id/submit",
  authorize(PERMISSIONS.ACADEMICS_READ),
  bdCtrl.submitAssignment
);

export default router;
