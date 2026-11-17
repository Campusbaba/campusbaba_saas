import { Router } from "express";
import * as paymentController from "../controllers/paymentController";
import { validateRequest } from "../middlewares/validateRequest";
import { authorize } from "../middlewares/authMiddleware";
import { PERMISSIONS } from "../domain/rbac/Permissions";
import { createPaymentSchema, updatePaymentSchema } from "../validators";

const router = Router();

router.post(
  "/",
  authorize(PERMISSIONS.PAYMENTS_WRITE),
  validateRequest(createPaymentSchema),
  paymentController.createPayment
);
router.get(
  "/",
  authorize(PERMISSIONS.PAYMENTS_READ),
  paymentController.getAllPayments
);
router.get(
  "/stats",
  authorize(PERMISSIONS.PAYMENTS_READ),
  paymentController.getPaymentStats
);
router.get(
  "/enrollments",
  authorize(PERMISSIONS.PAYMENTS_READ),
  paymentController.getEnrolledStudents
);
router.get(
  "/student/:studentId",
  authorize(PERMISSIONS.PAYMENTS_READ),
  paymentController.getStudentPayments
);
router.get(
  "/:id",
  authorize(PERMISSIONS.PAYMENTS_READ),
  paymentController.getPaymentById
);
router.put(
  "/:id",
  authorize(PERMISSIONS.PAYMENTS_WRITE),
  validateRequest(updatePaymentSchema),
  paymentController.updatePayment
);
router.patch(
  "/:id/activate-student",
  authorize(PERMISSIONS.PAYMENTS_WRITE),
  paymentController.activateStudent
);
router.delete(
  "/:id",
  authorize(PERMISSIONS.PAYMENTS_WRITE),
  paymentController.deletePayment
);

export default router;
