import { createHash, randomBytes } from "node:crypto";

import { SignJWT, createRemoteJWKSet, jwtVerify } from "jose";

const attemptCookieName = "sb_oidc_attempt";
export const sessionCookieName = "sb_session";
const adminAttemptCookieName = "sb_admin_oidc_attempt";
const adminSessionCookieName = "sb_admin_session";
const sessionIssuer = "studio-balance-web";
const sessionAudience = "studio-balance-api";

type OidcDiscovery = {
  authorization_endpoint: string;
  issuer: string;
  jwks_uri: string;
  token_endpoint: string;
};

type LoginAttempt = {
  nonce: string;
  returnTo: string;
  state: string;
  verifier: string;
};

export type WebSession = {
  email: string;
  emailVerified: boolean;
  firstName?: string;
  lastName?: string;
  roles: ("client" | "admin" | "super_admin")[];
  subject: string;
};

type IdentityConfig = {
  callbackPath: string;
  clientId: string;
  clientSecret: string;
  issuer: string;
  publicAppUrl: string;
  sessionSecret: string;
};
export type IdentityMode = "web" | "admin";

function configuredValue(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing ${name} for web identity`);
  return value;
}

export function identityConfig(mode: IdentityMode = "web"): IdentityConfig {
  const publicAppUrl = configuredValue("PUBLIC_APP_URL", "http://localhost:3000");
  const sessionSecret = configuredValue("SESSION_SECRET", "local-development-session-secret-change-before-sharing");
  const issuer = configuredValue("OIDC_ISSUER_URL", "http://localhost:8081/realms/studio-balance").replace(/\/$/, "");

  if (!URL.canParse(publicAppUrl) || !URL.canParse(issuer) || sessionSecret.length < 32) {
    throw new Error("Invalid web identity configuration");
  }

  if (process.env.NODE_ENV === "production" && process.env.APP_ENV === "production" && !process.env.SESSION_SECRET) {
    throw new Error("Production SESSION_SECRET is required for web identity");
  }

  return {
    callbackPath: mode === "admin" ? "/admin/auth/callback" : "/auth/callback",
    publicAppUrl: publicAppUrl.replace(/\/$/, ""),
    issuer,
    sessionSecret,
    clientId: mode === "admin" ? configuredValue("OIDC_ADMIN_CLIENT_ID", "studiobalance-admin") : configuredValue("OIDC_WEB_CLIENT_ID", "studiobalance-web"),
    clientSecret: mode === "admin" ? configuredValue("OIDC_ADMIN_CLIENT_SECRET", "local-admin-client-only") : configuredValue("OIDC_WEB_CLIENT_SECRET", "local-web-client-only")
  };
}

export function callbackUrl(config = identityConfig()): string {
  return `${config.publicAppUrl}${config.callbackPath}`;
}

export function isSecureCookie(config = identityConfig()): boolean {
  return new URL(config.publicAppUrl).protocol === "https:";
}

export function publicRedirectUrl(path: string, mode: IdentityMode = "web"): URL {
  return new URL(path, identityConfig(mode).publicAppUrl);
}

function key(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

function base64Url(value: Buffer): string {
  return value.toString("base64url");
}

export function safeReturnTo(value: string | null | undefined): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/muj-ucet";
}

export async function createLoginAttempt(returnTo: string, mode: IdentityMode = "web", loginHint?: string): Promise<{ authorizationUrl: string; cookieValue: string }> {
  const config = identityConfig(mode);
  const discovery = await discover(config);
  const state = base64Url(randomBytes(32));
  const nonce = base64Url(randomBytes(32));
  const verifier = base64Url(randomBytes(48));
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const attempt: LoginAttempt = { state, nonce, verifier, returnTo: safeReturnTo(returnTo) };
  const cookieValue = await new SignJWT(attempt)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(sessionIssuer)
    .setAudience("studio-balance-oidc-attempt")
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(key(config.sessionSecret));
  const url = new URL(discovery.authorization_endpoint);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", callbackUrl(config));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid profile email");
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (mode === "admin") {
    url.searchParams.set("prompt", "login");
    url.searchParams.set("max_age", "0");
    const normalizedLoginHint = loginHint?.trim();
    if (normalizedLoginHint && normalizedLoginHint.length <= 254) url.searchParams.set("login_hint", normalizedLoginHint);
  }

  return { authorizationUrl: url.toString(), cookieValue };
}

export async function finishLogin(input: {
  code: string;
  cookieValue: string | undefined;
  state: string | null;
}, mode: IdentityMode = "web"): Promise<{ returnTo: string; roles: WebSession["roles"]; session: string }> {
  const config = identityConfig(mode);
  const attempt = await readAttempt(input.cookieValue, config);
  if (!attempt || !input.state || attempt.state !== input.state) throw new Error("Invalid OIDC login state");

  const discovery = await discover(config);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: callbackUrl(config),
    client_id: config.clientId,
    code_verifier: attempt.verifier
  });
  const tokenResponse = await fetch(discovery.token_endpoint, {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: body.toString(),
    cache: "no-store"
  });
  if (!tokenResponse.ok) throw new Error("OIDC token exchange failed");

  const tokens = (await tokenResponse.json()) as { id_token?: unknown };
  if (typeof tokens.id_token !== "string") throw new Error("OIDC response did not contain an ID token");

  const claims = await jwtVerify(tokens.id_token, createRemoteJWKSet(new URL(discovery.jwks_uri)), {
    algorithms: ["RS256", "ES256"],
    issuer: config.issuer,
    audience: config.clientId
  });
  if (claims.payload.nonce !== attempt.nonce || typeof claims.payload.sub !== "string" || typeof claims.payload.email !== "string") {
    throw new Error("OIDC identity claims are incomplete");
  }

  const realmAccess = claims.payload.realm_access;
  const roles =
    typeof realmAccess === "object" && realmAccess !== null && Array.isArray((realmAccess as { roles?: unknown }).roles)
      ? (realmAccess as { roles: unknown[] }).roles.filter((role): role is string => typeof role === "string")
      : [];
  const session: WebSession = {
    subject: claims.payload.sub,
    email: claims.payload.email,
    emailVerified: claims.payload.email_verified === true,
    ...(typeof claims.payload.given_name === "string" ? { firstName: claims.payload.given_name } : {}),
    ...(typeof claims.payload.family_name === "string" ? { lastName: claims.payload.family_name } : {}),
    roles: roles.filter((role): role is WebSession["roles"][number] =>
      role === "client" || role === "admin" || role === "super_admin"
    )
  };

  return { returnTo: attempt.returnTo, roles: session.roles, session: await signSession(session, config) };
}

export async function readWebSession(cookieValue: string | undefined): Promise<WebSession | undefined> {
  const config = identityConfig();
  try {
    const { payload } = await jwtVerify(cookieValue ?? "", key(config.sessionSecret), {
      algorithms: ["HS256"],
      issuer: sessionIssuer,
      audience: sessionAudience
    });
    if (
      typeof payload.sub !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.email_verified !== "boolean" ||
      !Array.isArray(payload.roles) ||
      !payload.roles.every((role) => typeof role === "string")
    ) {
      return undefined;
    }
    if (!payload.roles.every((role) => role === "client" || role === "admin" || role === "super_admin")) return undefined;
    return {
      subject: payload.sub,
      email: payload.email,
      emailVerified: payload.email_verified,
      ...(typeof payload.given_name === "string" ? { firstName: payload.given_name } : {}),
      ...(typeof payload.family_name === "string" ? { lastName: payload.family_name } : {}),
      roles: payload.roles as WebSession["roles"]
    };
  } catch {
    return undefined;
  }
}

export const identityCookies = {
  attempt: attemptCookieName,
  session: sessionCookieName
};
export const adminIdentityCookies = {
  attempt: adminAttemptCookieName,
  session: adminSessionCookieName
};

async function discover(config: IdentityConfig): Promise<OidcDiscovery> {
  const response = await fetch(`${config.issuer}/.well-known/openid-configuration`, { cache: "no-store" });
  if (!response.ok) throw new Error("OIDC discovery failed");
  const discovery = (await response.json()) as Partial<OidcDiscovery>;
  if (
    discovery.issuer !== config.issuer ||
    typeof discovery.authorization_endpoint !== "string" ||
    typeof discovery.token_endpoint !== "string" ||
    typeof discovery.jwks_uri !== "string" ||
    !URL.canParse(discovery.authorization_endpoint) ||
    !URL.canParse(discovery.token_endpoint) ||
    !URL.canParse(discovery.jwks_uri)
  ) {
    throw new Error("OIDC discovery document is invalid");
  }
  return discovery as OidcDiscovery;
}

async function readAttempt(cookieValue: string | undefined, config: IdentityConfig): Promise<LoginAttempt | undefined> {
  try {
    const { payload } = await jwtVerify(cookieValue ?? "", key(config.sessionSecret), {
      algorithms: ["HS256"],
      issuer: sessionIssuer,
      audience: "studio-balance-oidc-attempt"
    });
    if (
      typeof payload.state !== "string" ||
      typeof payload.nonce !== "string" ||
      typeof payload.verifier !== "string" ||
      typeof payload.returnTo !== "string"
    ) {
      return undefined;
    }
    return { state: payload.state, nonce: payload.nonce, verifier: payload.verifier, returnTo: safeReturnTo(payload.returnTo) };
  } catch {
    return undefined;
  }
}

async function signSession(session: WebSession, config: IdentityConfig): Promise<string> {
  return new SignJWT({
    email: session.email,
    email_verified: session.emailVerified,
    ...(session.firstName ? { given_name: session.firstName } : {}),
    ...(session.lastName ? { family_name: session.lastName } : {}),
    roles: session.roles
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(session.subject)
    .setIssuer(sessionIssuer)
    .setAudience(sessionAudience)
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(key(config.sessionSecret));
}
