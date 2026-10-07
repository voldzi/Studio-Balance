import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";

import { HttpException, HttpStatus, Inject, Injectable } from "@nestjs/common";
import { createRemoteJWKSet, errors as joseErrors, jwtVerify } from "jose";
import type { PoolClient } from "pg";

import { RuntimeConfigService } from "../config/runtime-config.js";
import { DatabaseService } from "../database/database.service.js";
import type { StudioRole, StudioSession } from "./session.js";

export type ApplicationSessionKind = "web" | "admin";

export const SESSION_ABSOLUTE_LIFETIME_MS = 90 * 24 * 60 * 60 * 1000;
export const SESSION_IDLE_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_REVALIDATION_INTERVAL_MS = 15 * 60 * 1000;
export const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000;

type SessionRow = {
  absolute_expires_at: Date;
  email: string;
  email_verified: boolean;
  first_name: string | null;
  idle_expires_at: Date;
  last_name: string | null;
  last_revalidated_at: Date;
  last_seen_at: Date;
  mfa_verified: boolean;
  oidc_subject: string;
  refresh_token_ciphertext: string | null;
  roles: string[];
  revoked_at: Date | null;
};

type RefreshedSession = { refreshToken?: string; session: StudioSession; subject: string };
type RefreshUnavailable = { unavailable: true; refreshToken?: string };
type SessionResolution = StudioSession | RefreshUnavailable | undefined;
const sessionColumns = `oidc_subject, email, email_verified, first_name, last_name, mfa_verified, roles, refresh_token_ciphertext,
  absolute_expires_at, idle_expires_at, last_revalidated_at, last_seen_at, revoked_at`;

@Injectable()
export class OpaqueSessionService {
  private readonly encryptionKey: Buffer;
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;
  private readonly pendingRevalidations = new Map<string, Promise<StudioSession | undefined>>();

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(RuntimeConfigService) private readonly config: RuntimeConfigService
  ) {
    this.jwks = createRemoteJWKSet(new URL(`${this.config.value.oidc.backchannelIssuer ?? this.config.value.oidc.issuer}/protocol/openid-connect/certs`), { timeoutDuration: 8_000 });
    this.encryptionKey = Buffer.from(hkdfSync(
      "sha256",
      Buffer.from(this.config.value.sessionSecret),
      Buffer.from("studio-balance/application-session/v1"),
      Buffer.from("keycloak-refresh-token"),
      32
    ));
  }

  async create(input: { kind: ApplicationSessionKind; refreshToken: string; session: StudioSession }): Promise<{ token: string }> {
    if (input.kind === "admin" && (!isAdministrator(input.session.roles) || !input.session.mfaVerified)) {
      throw new Error("Admin role and MFA assurance are required");
    }

    const now = new Date();
    const absoluteExpiresAt = new Date(now.getTime() + SESSION_ABSOLUTE_LIFETIME_MS);
    const idleExpiresAt = new Date(Math.min(absoluteExpiresAt.getTime(), now.getTime() + SESSION_IDLE_LIFETIME_MS));
    const token = randomBytes(32).toString("base64url");

    await this.database.query(
      `INSERT INTO application_sessions (
        token_hash, kind, oidc_subject, email, email_verified, first_name, last_name, mfa_verified, roles,
        refresh_token_ciphertext, absolute_expires_at, idle_expires_at, last_revalidated_at, last_seen_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13)`,
      [
        hashToken(token),
        input.kind,
        input.session.subject,
        input.session.email,
        input.session.emailVerified,
        input.session.firstName ?? null,
        input.session.lastName ?? null,
        input.session.mfaVerified,
        input.session.roles,
        this.encrypt(input.refreshToken),
        absoluteExpiresAt,
        idleExpiresAt,
        now
      ]
    );
    return { token };
  }

  async resolveCookie(cookieHeader: string | undefined, kind: ApplicationSessionKind): Promise<StudioSession | undefined> {
    return this.resolveToken(cookieValue(cookieHeader, kind === "admin" ? "sb_admin_session" : "sb_session"), kind);
  }

  async resolveToken(token: string | undefined, kind: ApplicationSessionKind): Promise<StudioSession | undefined> {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return undefined;
    const tokenHash = hashToken(token);
    let row = await this.readSession(tokenHash, kind);
    if (!row) return undefined;
    const now = new Date();
    if (isCurrent(row, now)) {
      if (now.getTime() - row.last_seen_at.getTime() < SESSION_TOUCH_INTERVAL_MS) return sessionFromRow(row);
      const touched = await this.database.query<SessionRow>(
        `UPDATE application_sessions
         SET last_seen_at = $3, idle_expires_at = LEAST(absolute_expires_at, $4), updated_at = $3
         WHERE token_hash = $1 AND kind = $2 AND revoked_at IS NULL
           AND absolute_expires_at > $3 AND idle_expires_at > $3
           AND last_revalidated_at > $5 AND last_seen_at <= $6
         RETURNING ${sessionColumns}`,
        [tokenHash, kind, now, new Date(now.getTime() + SESSION_IDLE_LIFETIME_MS),
          new Date(now.getTime() - SESSION_REVALIDATION_INTERVAL_MS), new Date(now.getTime() - SESSION_TOUCH_INTERVAL_MS)]
      );
      if (touched.rows[0]) return sessionFromRow(touched.rows[0]);
      // A concurrent touch, refresh or revocation can win the conditional update.
      row = await this.readSession(tokenHash, kind);
      if (!row) return undefined;
      if (isCurrent(row, new Date())) return sessionFromRow(row);
    }

    const key = `${kind}:${tokenHash}`;
    const pending = this.pendingRevalidations.get(key);
    if (pending) return pending;
    if (this.pendingRevalidations.size >= 50) throw identityUnavailable();
    const revalidation = this.resolveStaleToken(tokenHash, kind);
    this.pendingRevalidations.set(key, revalidation);
    try {
      return await revalidation;
    } finally {
      this.pendingRevalidations.delete(key);
    }
  }

  private async resolveStaleToken(tokenHash: string, kind: ApplicationSessionKind): Promise<StudioSession | undefined> {
    const resolved = await this.database.transaction<SessionResolution>(async (client) => {
      const row = await this.readSession(tokenHash, kind, client);
      if (!row) return undefined;

      const now = new Date();
      if (row.absolute_expires_at <= now || row.idle_expires_at <= now) {
        await this.revokeLocked(client, tokenHash, kind);
        return undefined;
      }
      if (isCurrent(row, now) && now.getTime() - row.last_seen_at.getTime() < SESSION_TOUCH_INTERVAL_MS) return sessionFromRow(row);

      let session = sessionFromRow(row);
      let refreshTokenCiphertext = row.refresh_token_ciphertext;
      let revalidatedAt = row.last_revalidated_at;
      if (now.getTime() - row.last_revalidated_at.getTime() >= SESSION_REVALIDATION_INTERVAL_MS) {
        if (!refreshTokenCiphertext) {
          await this.revokeLocked(client, tokenHash, kind);
          return undefined;
        }
        let refreshed: Awaited<ReturnType<OpaqueSessionService["refresh"]>>;
        try {
          refreshed = await this.refresh(this.decrypt(refreshTokenCiphertext), kind);
        } catch {
          // A damaged locally encrypted credential cannot be used again.
          await this.revokeLocked(client, tokenHash, kind);
          return undefined;
        }
        if (refreshed && "unavailable" in refreshed) {
          if (refreshed.refreshToken) {
            // The provider may rotate the refresh token before its JWKS becomes
            // unavailable. Preserve that opaque credential without accepting any
            // new identity or extending the last successful verification.
            await client.query(
              `UPDATE application_sessions SET refresh_token_ciphertext = $3, updated_at = $4
               WHERE token_hash = $1 AND kind = $2 AND revoked_at IS NULL`,
              [tokenHash, kind, this.encrypt(refreshed.refreshToken), now]
            );
          }
          return { unavailable: true };
        }
        if (!refreshed || refreshed.subject !== row.oidc_subject || (kind === "admin" && !isAdministrator(refreshed.session.roles))) {
          await this.revokeLocked(client, tokenHash, kind);
          return undefined;
        }
        // MFA assurance belongs to the original interactive authentication.
        // A refresh may update identity and roles, but must never upgrade a
        // password-only session into an administrator session.
        session = { ...refreshed.session, mfaVerified: row.mfa_verified };
        refreshTokenCiphertext = refreshed.refreshToken ? this.encrypt(refreshed.refreshToken) : refreshTokenCiphertext;
        revalidatedAt = now;
      }

      const idleExpiresAt = new Date(Math.min(row.absolute_expires_at.getTime(), now.getTime() + SESSION_IDLE_LIFETIME_MS));
      await client.query(
        `UPDATE application_sessions
         SET email = $3, email_verified = $4, first_name = $5, last_name = $6, roles = $7,
             refresh_token_ciphertext = $8, last_revalidated_at = $9, last_seen_at = $10,
             idle_expires_at = $11, updated_at = $10
         WHERE token_hash = $1 AND kind = $2 AND revoked_at IS NULL`,
        [tokenHash, kind, session.email, session.emailVerified, session.firstName ?? null, session.lastName ?? null, session.roles, refreshTokenCiphertext, revalidatedAt, now, idleExpiresAt]
      );
      return session;
    });
    if (resolved && "unavailable" in resolved) {
      throw identityUnavailable();
    }
    return resolved;
  }

  async revokeCookie(cookieHeader: string | undefined, kind: ApplicationSessionKind): Promise<void> {
    await this.revokeToken(cookieValue(cookieHeader, kind === "admin" ? "sb_admin_session" : "sb_session"), kind);
  }

  async revokeToken(token: string | undefined, kind: ApplicationSessionKind): Promise<void> {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return;
    const tokenHash = hashToken(token);
    const result = await this.database.query<Pick<SessionRow, "refresh_token_ciphertext">>(
      `SELECT refresh_token_ciphertext FROM application_sessions
       WHERE token_hash = $1 AND kind = $2 AND revoked_at IS NULL`,
      [tokenHash, kind]
    );
    const refreshTokenCiphertext = result.rows[0]?.refresh_token_ciphertext;
    await this.database.query(
      `UPDATE application_sessions
       SET revoked_at = now(), refresh_token_ciphertext = NULL, updated_at = now()
       WHERE token_hash = $1 AND kind = $2 AND revoked_at IS NULL`,
      [tokenHash, kind]
    );
    if (refreshTokenCiphertext) {
      try {
        await this.revokeAtIdentityProvider(this.decrypt(refreshTokenCiphertext), kind);
      } catch {
        // The local session is already irreversibly revoked. A damaged or already-invalid
        // identity-provider token must not turn a successful local logout into an error.
      }
    }
  }

  private async readSession(tokenHash: string, kind: ApplicationSessionKind, client?: PoolClient): Promise<SessionRow | undefined> {
    const sql = `SELECT ${sessionColumns}
       FROM application_sessions
       WHERE token_hash = $1 AND kind = $2 AND revoked_at IS NULL
       ${client ? "FOR UPDATE" : ""}`;
    const values = [tokenHash, kind];
    const result = client ? await client.query<SessionRow>(sql, values) : await this.database.query<SessionRow>(sql, values);
    return result.rows[0];
  }

  private async revokeLocked(client: PoolClient, tokenHash: string, kind: ApplicationSessionKind): Promise<void> {
    await client.query(
      `UPDATE application_sessions SET revoked_at = now(), refresh_token_ciphertext = NULL, updated_at = now()
       WHERE token_hash = $1 AND kind = $2 AND revoked_at IS NULL`,
      [tokenHash, kind]
    );
  }

  private async refresh(refreshToken: string, kind: ApplicationSessionKind): Promise<RefreshedSession | RefreshUnavailable | undefined> {
    const client = kind === "admin"
      ? { id: this.config.value.oidc.adminClientId, secret: this.config.value.oidc.adminClientSecret }
      : { id: this.config.value.oidc.webClientId, secret: this.config.value.oidc.webClientSecret };
    let rotatedRefreshToken: string | undefined;
    try {
      const response = await fetch(`${this.config.value.oidc.backchannelIssuer ?? this.config.value.oidc.issuer}/protocol/openid-connect/token`, {
        method: "POST",
        headers: {
          authorization: `Basic ${Buffer.from(`${client.id}:${client.secret}`).toString("base64")}`,
          "content-type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: client.id }).toString(),
        cache: "no-store",
        signal: AbortSignal.timeout(8_000)
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null) as { error?: unknown } | null;
        return error?.error === "invalid_grant" ? undefined : { unavailable: true };
      }
      const body = (await response.json()) as { id_token?: unknown; refresh_token?: unknown };
      rotatedRefreshToken = typeof body.refresh_token === "string" ? body.refresh_token : undefined;
      if (typeof body.id_token !== "string") return undefined;
      const claims = await jwtVerify(body.id_token, this.jwks, {
        algorithms: ["RS256", "ES256"],
        issuer: this.config.value.oidc.issuer,
        audience: client.id
      });
      const session = sessionFromClaims(claims.payload);
      if (!session) return undefined;
      return { subject: session.subject, session, ...(typeof body.refresh_token === "string" ? { refreshToken: body.refresh_token } : {}) };
    } catch (error) {
      if (error instanceof joseErrors.JWTClaimValidationFailed || error instanceof joseErrors.JWTExpired ||
        error instanceof joseErrors.JWSSignatureVerificationFailed || error instanceof joseErrors.JWSInvalid ||
        error instanceof joseErrors.JWTInvalid || error instanceof joseErrors.JOSEAlgNotAllowed || error instanceof joseErrors.JOSENotSupported) return undefined;
      return { unavailable: true, ...(rotatedRefreshToken ? { refreshToken: rotatedRefreshToken } : {}) };
    }
  }

  private async revokeAtIdentityProvider(refreshToken: string, kind: ApplicationSessionKind): Promise<void> {
    const client = kind === "admin"
      ? { id: this.config.value.oidc.adminClientId, secret: this.config.value.oidc.adminClientSecret }
      : { id: this.config.value.oidc.webClientId, secret: this.config.value.oidc.webClientSecret };
    try {
      await fetch(`${this.config.value.oidc.backchannelIssuer ?? this.config.value.oidc.issuer}/protocol/openid-connect/revoke`, {
        method: "POST",
        headers: {
          authorization: `Basic ${Buffer.from(`${client.id}:${client.secret}`).toString("base64")}`,
          "content-type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({ token: refreshToken, token_type_hint: "refresh_token", client_id: client.id }).toString(),
        cache: "no-store",
        signal: AbortSignal.timeout(8_000)
      });
    } catch {
      // Local revocation remains authoritative when Keycloak is temporarily unavailable.
    }
  }

  private encrypt(value: string): string {
    const initializationVector = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.encryptionKey, initializationVector);
    const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return [initializationVector, cipher.getAuthTag(), ciphertext].map((part) => part.toString("base64url")).join(".");
  }

  private decrypt(value: string): string {
    const [initializationVector, tag, ciphertext] = value.split(".").map((part) => Buffer.from(part, "base64url"));
    if (!initializationVector || !tag || !ciphertext || initializationVector.length !== 12 || tag.length !== 16) throw new Error("Invalid encrypted refresh token");
    const decipher = createDecipheriv("aes-256-gcm", this.encryptionKey, initializationVector);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  }
}

function isCurrent(row: SessionRow, now: Date): boolean {
  return row.absolute_expires_at > now && row.idle_expires_at > now &&
    now.getTime() - row.last_revalidated_at.getTime() < SESSION_REVALIDATION_INTERVAL_MS;
}

function identityUnavailable(): HttpException {
  return new HttpException({ code: "IDENTITY_PROVIDER_UNAVAILABLE", message: "Přihlášení nyní nelze ověřit. Zkuste to za chvíli znovu." }, HttpStatus.SERVICE_UNAVAILABLE);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function cookieValue(cookieHeader: string | undefined, name: string): string | undefined {
  return cookieHeader
    ?.split(";")
    .map((part) => part.trim().split("=", 2))
    .find(([key]) => key === name)?.[1];
}

function isAdministrator(roles: StudioRole[]): boolean {
  return roles.some((role) => role === "admin" || role === "super_admin");
}

function sessionFromRow(row: SessionRow): StudioSession {
  return {
    subject: row.oidc_subject,
    email: row.email,
    emailVerified: row.email_verified,
    mfaVerified: row.mfa_verified,
    ...(row.first_name ? { firstName: row.first_name } : {}),
    ...(row.last_name ? { lastName: row.last_name } : {}),
    roles: row.roles.filter(isStudioRole)
  };
}

function sessionFromClaims(payload: Record<string, unknown>): StudioSession | undefined {
  if (typeof payload.sub !== "string" || typeof payload.email !== "string") return undefined;
  const realmAccess = payload.realm_access;
  const roles = typeof realmAccess === "object" && realmAccess !== null && Array.isArray((realmAccess as { roles?: unknown }).roles)
    ? (realmAccess as { roles: unknown[] }).roles.filter(isStudioRole)
    : [];
  return {
    subject: payload.sub,
    email: payload.email,
    emailVerified: payload.email_verified === true,
    mfaVerified: Array.isArray(payload.amr) && payload.amr.includes("otp"),
    ...(typeof payload.given_name === "string" ? { firstName: payload.given_name } : {}),
    ...(typeof payload.family_name === "string" ? { lastName: payload.family_name } : {}),
    roles
  };
}

function isStudioRole(value: unknown): value is StudioRole {
  return value === "client" || value === "admin" || value === "super_admin";
}
