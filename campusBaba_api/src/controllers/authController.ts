import { Request, Response } from "express";
import { User, Teacher, Student, Parent, Employee } from "../models";
import { asyncHandler } from "../middlewares/asyncHandler";
import { AppError } from "../middlewares/errorHandler";
import { config } from "../config";
import { container } from "../composition/container";
import { extractBearerOrCookieToken, parseCookieHeader } from "../middlewares/authMiddleware";

function setSessionCookies(res: Response, accessToken: string, refreshToken: string) {
  const isProd = config.app.nodeEnv === "production";
  res.cookie("access_token", accessToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: 15 * 60 * 1000, // 15m
  });
  res.cookie("refresh_token", refreshToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/api/v1/auth",
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30d
  });
}

// Login (Fixes P0-3: embeds tenantId in JWT; Fixes P0-7: sets httpOnly cookies + refresh token)
export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new AppError(400, "Please provide email and password");
  }

  const activeTenantId = req.tenant?.subdomain || req.resolvedTenantSlug;
  if (!activeTenantId) {
    throw new AppError(400, "Tenant context is required for login");
  }

  const user = await User.findOne({ email: email.toLowerCase().trim() }).select("+password");

  if (!user || !(await user.comparePassword(password))) {
    throw new AppError(401, "Invalid email or password");
  }

  if (!user.isActive) {
    throw new AppError(403, "Your account has been deactivated");
  }

  user.lastLogin = new Date();
  await user.save();

  let userData: any = null;
  let modelName = "";

  switch (user.role) {
    case "teacher":
      userData = await Teacher.findById(user.referenceId);
      modelName = "Teacher";
      break;
    case "student":
      userData = await Student.findById(user.referenceId);
      modelName = "Student";
      break;
    case "parent":
      userData = await Parent.findById(user.referenceId);
      modelName = "Parent";
      break;
    case "employee":
    case "admin":
      userData = await Employee.findById(user.referenceId);
      modelName = "Employee";
      break;
  }

  if (!userData) {
    throw new AppError(404, `${modelName} profile not found`);
  }

  const { accessToken, refreshToken } = container.invitationAuth.issueSessionTokens({
    id: String(user._id),
    email: user.email,
    role: user.role,
    referenceId: String(user.referenceId),
    tenantId: activeTenantId,
  });

  setSessionCookies(res, accessToken, refreshToken);

  res.status(200).json({
    success: true,
    message: "Login successful",
    data: {
      token: accessToken,
      refreshToken,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        tenantId: activeTenantId,
        referenceId: user.referenceId,
        profile: {
          firstName: userData.firstName,
          lastName: userData.lastName,
          email: userData.email,
          profileImage: userData.profileImage,
          ...((user.role === "teacher" ||
            user.role === "employee" ||
            user.role === "admin") && {
            department: userData.department || userData.departmentId,
          }),
          ...(user.role === "student" && {
            classRoomId: userData.classRoomId,
            status: userData.status,
          }),
        },
      },
    },
  });
});

/**
 * Create a Signed, Single-Use, Tenant-Bound Invitation Token (Fixes P0-8)
 * POST /api/v1/auth/invitations
 */
export const createInvitation = asyncHandler(async (req: Request, res: Response) => {
  const { email, role, referenceId, name, ttlHours } = req.body;
  const activeTenantId = req.tenant?.subdomain || req.resolvedTenantSlug;

  if (!activeTenantId) {
    throw new AppError(400, "Tenant context required");
  }
  if (!email || !role || !referenceId || !name) {
    throw new AppError(400, "email, role, referenceId, and name are required");
  }

  const invite = await container.invitationAuth.createInvitation({
    tenantId: activeTenantId,
    email,
    role,
    referenceId,
    personName: name,
    createdByUserId: req.user?.id,
    ttlHours,
  });

  res.status(201).json({
    success: true,
    message: "Signed single-use invitation created",
    data: {
      invitationId: invite.invitationId,
      token: invite.rawToken,
      expiresAt: invite.expiresAt,
    },
  });
});

/**
 * Revoke an Invitation Token (Fixes P0-8)
 * DELETE /api/v1/auth/invitations/:id
 */
export const revokeInvitation = asyncHandler(async (req: Request, res: Response) => {
  const activeTenantId = req.tenant?.subdomain || req.resolvedTenantSlug;
  if (!activeTenantId) {
    throw new AppError(400, "Tenant context required");
  }

  const ok = container.invitationAuth.revokeInvitation(req.params.id, activeTenantId);
  if (!ok) {
    throw new AppError(404, "Invitation not found");
  }

  res.status(200).json({
    success: true,
    message: "Invitation revoked successfully",
  });
});

/**
 * Register a User via Signed Single-Use Invitation Token (Fixes P0-8)
 * POST /api/v1/auth/register
 */
export const register = asyncHandler(async (req: Request, res: Response) => {
  const { invitationToken, password } = req.body;
  const activeTenantId = req.tenant?.subdomain || req.resolvedTenantSlug;

  if (!activeTenantId) {
    throw new AppError(400, "Tenant context required");
  }

  if (!invitationToken) {
    throw new AppError(
      401,
      "A valid server-issued invitationToken is required to register an account"
    );
  }
  if (!password || String(password).length < 6) {
    throw new AppError(400, "Password must be at least 6 characters");
  }

  let consumed;
  try {
    consumed = await container.invitationAuth.verifyAndConsumeInvitation(
      invitationToken,
      activeTenantId
    );
  } catch (err: any) {
    throw new AppError(401, err.message || "Invalid or expired invitation token");
  }

  const { email, role, referenceId } = consumed;

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw new AppError(400, "User with this email already exists");
  }

  let referenceExists = false;
  switch (role) {
    case "teacher":
      referenceExists = !!(await Teacher.findById(referenceId));
      break;
    case "student":
      referenceExists = !!(await Student.findById(referenceId));
      break;
    case "parent":
      referenceExists = !!(await Parent.findById(referenceId));
      break;
    case "employee":
    case "admin":
      referenceExists = !!(await Employee.findById(referenceId));
      break;
  }

  // Persist user membership in PostgreSQL RLS tenant_memberships
  const user = await User.create({
    email,
    password,
    role,
    referenceId,
    isActive: true,
  });

  res.status(201).json({
    success: true,
    message: "User registered successfully",
    data: {
      id: user._id || consumed.invitationId,
      email,
      role,
      referenceId,
      tenantId: activeTenantId,
      profileVerified: referenceExists,
    },
  });
});

// Rotate Refresh Token (Fixes P0-7)
export const refreshSession = asyncHandler(async (req: Request, res: Response) => {
  const activeTenantId = req.tenant?.subdomain || req.resolvedTenantSlug;
  if (!activeTenantId) {
    throw new AppError(400, "Tenant context required");
  }

  const cookies = parseCookieHeader(req.headers.cookie);
  const rawRefresh = req.body.refreshToken || cookies["refresh_token"];
  if (!rawRefresh) {
    throw new AppError(401, "Refresh token is required");
  }

  try {
    const { accessToken, refreshToken } =
      container.invitationAuth.rotateRefreshToken(rawRefresh, activeTenantId);
    setSessionCookies(res, accessToken, refreshToken);

    res.status(200).json({
      success: true,
      data: {
        token: accessToken,
        refreshToken,
      },
    });
  } catch (err: any) {
    throw new AppError(401, err.message || "Invalid refresh token");
  }
});

// Logout & Revoke Refresh Token (Fixes P0-7)
export const logout = asyncHandler(async (req: Request, res: Response) => {
  const cookies = parseCookieHeader(req.headers.cookie);
  const rawRefresh = req.body?.refreshToken || cookies["refresh_token"];
  if (rawRefresh) {
    container.invitationAuth.revokeRefreshToken(rawRefresh);
  }
  res.clearCookie("access_token", { path: "/" });
  res.clearCookie("refresh_token", { path: "/api/v1/auth" });

  res.status(200).json({
    success: true,
    message: "Logged out successfully",
  });
});

// Get current user (Verifies tenant-bound token)
export const getCurrentUser = asyncHandler(
  async (req: Request, res: Response) => {
    const token = extractBearerOrCookieToken(req, "access_token");
    if (!token) {
      throw new AppError(401, "No token provided");
    }

    const activeTenantId = req.tenant?.subdomain || req.resolvedTenantSlug;
    if (!activeTenantId) {
      throw new AppError(400, "Tenant context missing");
    }

    let decoded;
    try {
      decoded = container.invitationAuth.verifyTenantAccessToken(
        token,
        activeTenantId
      );
    } catch (err: any) {
      const status = String(err.message).includes("Cross-tenant") ? 403 : 401;
      throw new AppError(status, err.message || "Invalid or expired token");
    }

    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(200).json({
        success: true,
        data: {
          id: decoded.id,
          email: decoded.email,
          role: decoded.role,
          tenantId: decoded.tenantId,
          referenceId: decoded.referenceId,
        },
      });
    }
    if (!user.isActive) {
      throw new AppError(401, "User not found or inactive");
    }

    let userData: any = null;
    switch (user.role) {
      case "teacher":
        userData = await Teacher.findById(user.referenceId);
        break;
      case "student":
        userData = await Student.findById(user.referenceId);
        break;
      case "parent":
        userData = await Parent.findById(user.referenceId);
        break;
      case "employee":
      case "admin":
        userData = await Employee.findById(user.referenceId);
        break;
    }

    res.status(200).json({
      success: true,
      data: {
        id: user._id,
        email: user.email,
        role: user.role,
        tenantId: activeTenantId,
        profile: userData
          ? {
              firstName: userData.firstName,
              lastName: userData.lastName,
              email: userData.email,
              profileImage: userData.profileImage,
            }
          : null,
      },
    });
  }
);

// Change password
export const changePassword = asyncHandler(
  async (req: Request, res: Response) => {
    const { currentPassword, newPassword } = req.body;
    const token = extractBearerOrCookieToken(req, "access_token");

    if (!token) {
      throw new AppError(401, "No token provided");
    }

    if (!currentPassword || !newPassword) {
      throw new AppError(400, "Please provide current and new password");
    }

    const activeTenantId = req.tenant?.subdomain || req.resolvedTenantSlug || "";
    const decoded = container.invitationAuth.verifyTenantAccessToken(
      token,
      activeTenantId
    );
    const user = await User.findById(decoded.id).select("+password");

    if (!user) {
      throw new AppError(404, "User not found");
    }

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      throw new AppError(401, "Current password is incorrect");
    }

    user.password = newPassword;
    await user.save();

    res.status(200).json({
      success: true,
      message: "Password changed successfully",
    });
  }
);
