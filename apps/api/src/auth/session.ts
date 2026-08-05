import { jwtVerify } from "jose";

export type StudioRole = "client" | "admin" | "super_admin";

export type StudioSession = {
  email: string;
  emailVerified: boolean;
  roles: StudioRole[];
  subject: string;
};

const sessionCookieName = "sb_session";

function cookieValue(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;

  return cookieHeader
    .split(";")
    .map((part) => part.trim().split("=", 2))
    .find(([key]) => key === name)?.[1];
}

export async function verifyStudioSession(
  cookieHeader: string | undefined,
  sessionSecret: string,
  cookieName = sessionCookieName
): Promise<StudioSession | undefined> {
  const token = cookieValue(cookieHeader, cookieName);
  if (!token) return undefined;

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(sessionSecret), {
      algorithms: ["HS256"],
      issuer: "studio-balance-web",
      audience: "studio-balance-api"
    });

    if (
      typeof payload.sub !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.email_verified !== "boolean" ||
      !Array.isArray(payload.roles) ||
      !payload.roles.every((role) => role === "client" || role === "admin" || role === "super_admin")
    ) {
      return undefined;
    }

    return {
      subject: payload.sub,
      email: payload.email,
      emailVerified: payload.email_verified,
      roles: payload.roles as StudioRole[]
    };
  } catch {
    return undefined;
  }
}
