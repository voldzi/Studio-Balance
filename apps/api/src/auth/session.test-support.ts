import { decodeJwt } from "jose";

import type { StudioRole, StudioSession } from "./session.js";

/** Test-only adapter for controller tests that historically mint signed fixture JWTs. */
export const opaqueSessionServiceTestDouble = {
  async resolveCookie(cookieHeader: string | undefined, kind: "web" | "admin"): Promise<StudioSession | undefined> {
    const expectedName = kind === "admin" ? "sb_admin_session" : "sb_session";
    const token = cookieHeader?.split(";").map((part) => part.trim().split("=", 2)).find(([name]) => name === expectedName)?.[1];
    if (!token) return undefined;
    try {
      const claims = decodeJwt(token);
      if (typeof claims.sub !== "string" || typeof claims.email !== "string" || typeof claims.email_verified !== "boolean" || !Array.isArray(claims.roles) || !claims.roles.every(isRole)) return undefined;
      return {
        subject: claims.sub,
        email: claims.email,
        emailVerified: claims.email_verified,
        ...(typeof claims.given_name === "string" ? { firstName: claims.given_name } : {}),
        ...(typeof claims.family_name === "string" ? { lastName: claims.family_name } : {}),
        roles: claims.roles
      };
    } catch {
      return undefined;
    }
  }
};

function isRole(value: unknown): value is StudioRole {
  return value === "client" || value === "admin" || value === "super_admin";
}
