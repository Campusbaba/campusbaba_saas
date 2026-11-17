import { Router } from "express";
import * as govCtrl from "../controllers/governanceController";
import { authenticate, authorize } from "../middlewares/authMiddleware";
import { PERMISSIONS } from "../domain/rbac/Permissions";

const router = Router();

router.use(authenticate);

// Any authenticated user in the tenant can fetch their active permissions & feature flags
router.get("/my-config", govCtrl.getMyTenantGovernance);

// Only users with USERS_MANAGE permission (Admin) can update the tenant's RBAC matrix, feature flags, grading scheme, or gateway keys
router.put(
  "/config",
  authorize(PERMISSIONS.USERS_MANAGE),
  govCtrl.updateMyTenantGovernance
);

router.post(
  "/provider-credentials",
  authorize(PERMISSIONS.USERS_MANAGE),
  govCtrl.saveTenantProviderCredentials
);

export default router;
