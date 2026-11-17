import { Router } from "express";
import * as studentController from "../controllers/studentController";
import { validateRequest } from "../middlewares/validateRequest";
import { authorize } from "../middlewares/authMiddleware";
import { PERMISSIONS } from "../domain/rbac/Permissions";
import {
  createStudentSchema,
  updateStudentSchema,
  getStudentSchema,
} from "../validators";

const router = Router();

router.post(
  "/",
  authorize(PERMISSIONS.STUDENTS_WRITE),
  validateRequest(createStudentSchema),
  studentController.createStudent
);
router.get(
  "/",
  authorize(PERMISSIONS.STUDENTS_READ),
  studentController.getAllStudents
);
router.get(
  "/stats",
  authorize(PERMISSIONS.STUDENTS_READ),
  studentController.getStudentStats
);
router.get(
  "/:id",
  authorize(PERMISSIONS.STUDENTS_READ),
  validateRequest(getStudentSchema),
  studentController.getStudentById
);
router.put(
  "/:id",
  authorize(PERMISSIONS.STUDENTS_WRITE),
  validateRequest(updateStudentSchema),
  studentController.updateStudent
);
router.delete(
  "/:id",
  authorize(PERMISSIONS.STUDENTS_DELETE),
  validateRequest(getStudentSchema),
  studentController.deleteStudent
);

export default router;
