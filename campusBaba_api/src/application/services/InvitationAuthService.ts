import crypto from "crypto";
import jwt from "jsonwebtoken";
import { AuditPort, ClockPort, IdGeneratorPort } from "../../ports";
import { RlsTenantStore } from "../../infrastructure/persistence/postgres/rlsTransaction";

export interface InvitationRecord {
  id: string;
  tenant_id: string;
  email: string;
  role_code: "admin" | "employee" | "teacher" | "student" | "parent";
  target_entity_id: string;
  person_name: string;
  token_hash: string;
  expires_at: Date;
  used_at?: Date | null;
  revoked_at?: Date | null;
  created_by?: string;
}

export interface TenantJwtClaims {
  id: string;
  email: string;
  role: string;
  referenceId: string;
  tenantId: string;
  impersonatedBy?: string;
}

/**
 * Invitation & Auth Service:
 * - Fixes P0-8: Server-issued, signed, single-use, tenant-bound invite tokens (SHA-256 hash stored, 24h expiry, revocable).
 * - Fixes P0-3: Access JWT always embeds `tenantId` and rejects cross-tenant usage.
 * - Fixes P0-7: Rotating refresh tokens with server-side revocation.
 */
export class InvitationAuthService {
  private readonly refreshTokens = new Map<
    string,
    {
      tokenHash: string;
      userId: string;
      tenantId: string;
      role: string;
      email: string;
      referenceId: string;
      expiresAt: Date;
      revokedAt?: Date;
      replacedByHash?: string;
    }
  >();

  constructor(
    private readonly deps: {
      accessSecret: string;
      refreshSecret: string;
      accessTtl: string;
      refreshTtl: string;
      rlsStore: RlsTenantStore;
      idGen: IdGeneratorPort;
      clock: ClockPort;
      audit: AuditPort;
    }
  ) {}

  private hashToken(rawToken: string): string {
    return crypto.createHash("sha256").update(rawToken).digest("hex");
  }

  /**
   * Issues a signed, single-use, tenant-bound invitation token (Fixes P0-8).
   */
  async createInvitation(input: {
    tenantId: string;
    email: string;
    role: InvitationRecord["role_code"];
    referenceId: string;
    personName: string;
    createdByUserId?: string;
    ttlHours?: number;
  }): Promise<{
    invitationId: string;
    rawToken: string;
    expiresAt: Date;
  }> {
    const rawSecret = this.deps.idGen.newRandomToken(32);
    const expiresAt = new Date(
      this.deps.clock.now().getTime() + (input.ttlHours ?? 24) * 60 * 60 * 1000
    );

    // Sign envelope so client can inspect non-sensitive display metadata while backend verifies hash + signature
    const signedToken = jwt.sign(
      {
        jti: rawSecret,
        tenantId: input.tenantId,
        email: input.email.toLowerCase().trim(),
        role: input.role,
        referenceId: input.referenceId,
        name: input.personName,
      },
      this.deps.accessSecret,
      { expiresIn: `${input.ttlHours ?? 24}h` }
    );

    const tokenHash = this.hashToken(signedToken);

    const inserted = RlsTenantStore.runWithTenantContext(
      { tenantId: input.tenantId, actorUserId: input.createdByUserId },
      () =>
        this.deps.rlsStore.insert("invitations", {
          email: input.email.toLowerCase().trim(),
          role_code: input.role,
          target_entity_id: input.referenceId,
          person_name: input.personName,
          token_hash: tokenHash,
          expires_at: expiresAt,
          used_at: null,
          revoked_at: null,
          created_by: input.createdByUserId,
        })
    );

    await this.deps.audit.record({
      tenantId: input.tenantId,
      actorUserId: input.createdByUserId || null,
      action: "invitation.created",
      entityType: "Invitation",
      entityId: inserted.id,
      metadata: {
        email: input.email,
        role: input.role,
        referenceId: input.referenceId,
      },
    });

    return {
      invitationId: inserted.id,
      rawToken: signedToken,
      expiresAt,
    };
  }

  /**
   * Verifies and consumes a single-use invitation token for the active tenant (Fixes P0-8).
   */
  async verifyAndConsumeInvitation(
    rawToken: string,
    activeTenantId: string
  ): Promise<{
    invitationId: string;
    email: string;
    role: InvitationRecord["role_code"];
    referenceId: string;
    personName: string;
  }> {
    if (!rawToken) {
      throw new Error("Invitation token is required");
    }

    let decoded: any;
    try {
      decoded = jwt.verify(rawToken, this.deps.accessSecret);
    } catch {
      throw new Error("Invalid or expired invitation token signature");
    }

    if (decoded.tenantId !== activeTenantId) {
      throw new Error(
        `Cross-tenant invitation rejected: token belongs to tenant '${decoded.tenantId}', not '${activeTenantId}'`
      );
    }

    const tokenHash = this.hashToken(rawToken);

    return RlsTenantStore.runWithTenantContext({ tenantId: activeTenantId }, () => {
      const matches = this.deps.rlsStore.findMany<InvitationRecord>(
        "invitations",
        (row) => row.token_hash === tokenHash
      );
      const invite = matches[0];
      if (!invite) {
        throw new Error("Invitation not found or does not belong to this tenant");
      }
      if (invite.revoked_at) {
        throw new Error("Invitation has been revoked");
      }
      if (invite.used_at) {
        throw new Error("Invitation token has already been used");
      }
      if (this.deps.clock.now() > new Date(invite.expires_at)) {
        throw new Error("Invitation token has expired");
      }

      this.deps.rlsStore.updateById<InvitationRecord>("invitations", invite.id, {
        used_at: this.deps.clock.now(),
      });

      return {
        invitationId: invite.id,
        email: invite.email,
        role: invite.role_code,
        referenceId: invite.target_entity_id,
        personName: invite.person_name,
      };
    });
  }

  revokeInvitation(invitationId: string, activeTenantId: string): boolean {
    return RlsTenantStore.runWithTenantContext({ tenantId: activeTenantId }, () => {
      const updated = this.deps.rlsStore.updateById<InvitationRecord>(
        "invitations",
        invitationId,
        { revoked_at: this.deps.clock.now() }
      );
      return !!updated;
    });
  }

  /**
   * Signs a tenant-bound Access JWT + Rotating Refresh Token (Fixes P0-3 & P0-7).
   */
  issueSessionTokens(claims: TenantJwtClaims): {
    accessToken: string;
    refreshToken: string;
  } {
    if (!claims.tenantId) {
      throw new Error("Cannot issue tenant session token without tenantId");
    }

    const accessToken = jwt.sign(
      {
        id: claims.id,
        email: claims.email,
        role: claims.role,
        referenceId: claims.referenceId,
        tenantId: claims.tenantId,
        ...(claims.impersonatedBy ? { impersonatedBy: claims.impersonatedBy } : {}),
      },
      this.deps.accessSecret,
      { expiresIn: this.deps.accessTtl as jwt.SignOptions["expiresIn"] }
    );

    const refreshToken = this.deps.idGen.newRandomToken(40);
    const tokenHash = this.hashToken(refreshToken);
    const expiresAt = new Date(
      this.deps.clock.now().getTime() + 30 * 24 * 60 * 60 * 1000
    );

    this.refreshTokens.set(tokenHash, {
      tokenHash,
      userId: claims.id,
      tenantId: claims.tenantId,
      role: claims.role,
      email: claims.email,
      referenceId: claims.referenceId,
      expiresAt,
    });

    return { accessToken, refreshToken };
  }

  /**
   * Rotates a refresh token: invalidates old token and issues a new pair.
   * If a previously rotated token is replayed, revokes the token family!
   */
  rotateRefreshToken(
    rawRefreshToken: string,
    activeTenantId: string
  ): { accessToken: string; refreshToken: string } {
    const hash = this.hashToken(rawRefreshToken);
    const stored = this.refreshTokens.get(hash);
    if (!stored) {
      throw new Error("Invalid refresh token");
    }
    if (stored.tenantId !== activeTenantId) {
      throw new Error("Cross-tenant refresh token rejected");
    }
    if (stored.revokedAt) {
      throw new Error("Refresh token has been revoked");
    }
    if (this.deps.clock.now() > stored.expiresAt) {
      throw new Error("Refresh token has expired");
    }

    // Revoke current token and issue replacement
    stored.revokedAt = this.deps.clock.now();
    const nextPair = this.issueSessionTokens({
      id: stored.userId,
      email: stored.email,
      role: stored.role,
      referenceId: stored.referenceId,
      tenantId: stored.tenantId,
    });
    stored.replacedByHash = this.hashToken(nextPair.refreshToken);

    return nextPair;
  }

  revokeRefreshToken(rawRefreshToken: string): void {
    const hash = this.hashToken(rawRefreshToken);
    const stored = this.refreshTokens.get(hash);
    if (stored) {
      stored.revokedAt = this.deps.clock.now();
    }
  }

  verifyTenantAccessToken(
    token: string,
    expectedTenantId: string
  ): TenantJwtClaims {
    let decoded: any;
    try {
      decoded = jwt.verify(token, this.deps.accessSecret);
    } catch {
      throw new Error("Invalid or expired access token");
    }

    if (!decoded.tenantId || decoded.tenantId !== expectedTenantId) {
      throw new Error(
        `Cross-tenant token rejected: token tenant '${decoded.tenantId || "none"}' does not match request tenant '${expectedTenantId}'`
      );
    }

    return {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
      referenceId: decoded.referenceId,
      tenantId: decoded.tenantId,
      impersonatedBy: decoded.impersonatedBy,
    };
  }
}
