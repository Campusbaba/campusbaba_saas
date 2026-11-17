import { Router } from "express";
import * as authController from "../controllers/authController";
import { authenticate, authorize, rateLimit } from "../middlewares/authMiddleware";
import { PERMISSIONS } from "../domain/rbac/Permissions";

const router = Router();

router.post(
  "/login",
  rateLimit({ windowSeconds: 60, maxRequests: 30, keyPrefix: "tenant_login" }),
  authController.login
);

// P0-8 Fix: Registration requires a server-issued, signed, single-use invitationToken
router.post(
  "/register",
  rateLimit({ windowSeconds: 60, maxRequests: 20, keyPrefix: "tenant_register" }),
  authController.register
);

// P0-7 Fix: Refresh token rotation & logout revocation
router.post("/refresh", authController.refreshSession);
router.post("/logout", authController.logout);

// Authenticated User Profile & Password
router.get("/me", authController.getCurrentUser);
router.post("/change-password", authController.changePassword);

// P0-8 Fix: Admin-only Invitation Issuance & Revocation
router.post(
  "/invitations",
  authenticate,
  authorize(PERMISSIONS.USERS_INVITE),
  authController.createInvitation
);
router.delete(
  "/invitations/:id",
  authenticate,
  authorize(PERMISSIONS.USERS_INVITE),
  authController.revokeInvitation
);

export default router;
