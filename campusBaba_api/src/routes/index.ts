import { Router } from "express";
import authRoutes from "./authRoutes";
import studentRoutes from "./studentRoutes";
import parentRoutes from "./parentRoutes";
import teacherRoutes from "./teacherRoutes";
import employeeRoutes from "./employeeRoutes";
import departmentRoutes from "./departmentRoutes";
import courseRoutes from "./courseRoutes";
import classRoomRoutes from "./classRoomRoutes";
import attendanceRoutes from "./attendanceRoutes";
import routineRoutes from "./routineRoutes";
import examRoutes from "./examRoutes";
import paymentRoutes from "./paymentRoutes";
import expenseRoutes from "./expenseRoutes";
import noticeRoutes from "./noticeRoutes";
import dashboardRoutes from "./dashboardRoutes";
import reportRoutes from "./reportRoutes";
import bdModulesRoutes from "./bdModulesRoutes";
import governanceRoutes from "./governanceRoutes";

import superAdminRoutes from "./superAdminRoutes";
import { tenantResolver } from "../middlewares/tenantResolver";
import { authenticate, authorize } from "../middlewares/authMiddleware";
import { PERMISSIONS } from "../domain/rbac/Permissions";

const router = Router();

// Master DB Routes (Protected inside superAdminRoutes via requireSuperAdmin — Fixes P0-1)
router.use("/superadmin", superAdminRoutes);

// Tenant DB Routes (Requires verified tenant Host / Context — Fixes P0-3)
router.use(tenantResolver);

// Auth & Invitations Routes
router.use("/auth", authRoutes);

// P0-2 Fix: All Tenant Resource Routes require verified tenant-bound JWT + RBAC Permissions
router.use("/students", authenticate, studentRoutes);
router.use("/parents", authenticate, parentRoutes);
router.use("/teachers", authenticate, teacherRoutes);
router.use("/employees", authenticate, employeeRoutes);
router.use("/departments", authenticate, departmentRoutes);
router.use("/courses", authenticate, courseRoutes);
router.use("/classrooms", authenticate, classRoomRoutes);
router.use("/attendance", authenticate, attendanceRoutes);
router.use("/routines", authenticate, routineRoutes);
router.use("/exams", authenticate, examRoutes);
router.use("/payments", authenticate, paymentRoutes);
router.use(
  "/expenses",
  authenticate,
  authorize(PERMISSIONS.EXPENSES_READ),
  expenseRoutes
);
router.use("/notices", authenticate, noticeRoutes);
router.use("/dashboard", authenticate, dashboardRoutes);
router.use(
  "/reports",
  authenticate,
  authorize(PERMISSIONS.REPORTS_FINANCIAL_READ),
  reportRoutes
);

// Phase 4 Bangladesh & Cloudflare R2 Storage Modules
router.use("/bd", bdModulesRoutes);

// Centralized Tenant Access Control, RBAC, Feature Flags & Gateway Credentials
router.use("/governance", governanceRoutes);

export default router;
