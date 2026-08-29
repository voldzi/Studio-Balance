import { createHash, createHmac, randomBytes } from "node:crypto";

import { SignJWT, createRemoteJWKSet, jwtVerify } from "jose";

const attemptCookieName = "sb_oidc_attempt";
export const sessionCookieName = "sb_session";
const adminAttemptCookieName = "sb_admin_oidc_attempt";
const adminSessionCookieName = "sb_admin_session";
const sessionIssuer = "studio-balance-web";

type OidcDiscovery = {
  authorization_endpoint: string;
  issuer: string;
  jwks_uri: string;
  token_endpoint: string;
};

type LoginAttempt = {
  nonce: string;
  rememberDevice: boolean;
  returnTo: string;
  state: string;
  verifier: string;
};

export type WebSession = {
  email: string;
  emailVerified: boolean;
  firstName?: string;
  lastName?: string;
  mfaVerified: boolean;
  roles: ("client" | "admin" | "super_admin")[];
  subject: string;
};

export type CompletedLogin = {
  refreshToken: string;
  rememberDevice: boolean;
  returnTo: string;
  roles: WebSession["roles"];
  session: WebSession;
};

type IdentityConfig = {
  apiUrl: string;
  backchannelIssuer?: string;
  callbackPath: string;
  clientId: string;
  clientSecret: string;
  issuer: string;
  publicAppUrl: string;
  sessionSecret: string;
};
export type IdentityMode = "web" | "admin";

export const rememberedDeviceMaxAgeSeconds = 90 * 24 * 60 * 60;

function configuredValue(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing ${name} for web identity`);
  return value;
}

export function identityConfig(mode: IdentityMode = "web"): IdentityConfig {
  const publicAppUrl = configuredValue("PUBLIC_APP_URL", "http://localhost:3000");
  const sessionSecret = configuredValue("SESSION_SECRET", "local-development-session-secret-change-before-sharing");
  const issuer = configuredValue("OIDC_ISSUER_URL", "http://localhost:8081/realms/studio-balance").replace(/\/$/, "");
  const configuredBackchannelIssuer = process.env.OIDC_BACKCHANNEL_ISSUER_URL?.replace(/\/$/, "");
  const apiUrl = configuredValue("API_URL", "http://localhost:3001").replace(/\/$/, "");

  if (!URL.canParse(publicAppUrl) || !URL.canParse(issuer) || !URL.canParse(apiUrl) || (configuredBackchannelIssuer && !URL.canParse(configuredBackchannelIssuer)) || sessionSecret.length < 32) {
    throw new Error("Invalid web identity configuration");
  }
  if (process.env.NODE_ENV === "production" && process.env.APP_ENV === "production" && (!process.env.SESSION_SECRET || !process.env.API_URL)) {
    throw new Error("Production SESSION_SECRET and API_URL are required for web identity");
  }

  return {
    apiUrl,
    callbackPath: mode === "admin" ? "/admin/auth/callback" : "/auth/callback",
    ...(configuredBackchannelIssuer ? { backchannelIssuer: configuredBackchannelIssuer } : {}),
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

export async function createLoginAttempt(
  returnTo: string,
  mode: IdentityMode = "web",
  loginHint?: string,
  rememberDevice = false,
  requiredAction?: "UPDATE_PASSWORD"
): Promise<{ authorizationUrl: string; cookieValue: string }> {
  const config = identityConfig(mode);
  const discovery = await discover(config);
  const state = base64Url(randomBytes(32));
  const nonce = base64Url(randomBytes(32));
  const verifier = base64Url(randomBytes(48));
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const attempt: LoginAttempt = { state, nonce, verifier, returnTo: safeReturnTo(returnTo), rememberDevice };
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
  if (requiredAction) url.searchParams.set("kc_action", requiredAction);
  const normalizedLoginHint = loginHint?.trim();
  if (normalizedLoginHint && normalizedLoginHint.length <= 254) url.searchParams.set("login_hint", normalizedLoginHint);
  if (mode === "admin") {
    // A distinct client and Keycloak flow require password + TOTP for a new
    // privileged device. Later requests use the opaque admin session instead.
    url.searchParams.set("prompt", "login");
    url.searchParams.set("max_age", "0");
  }

  return { authorizationUrl: url.toString(), cookieValue };
}

export async function finishLogin(input: {
  code: string;
  cookieValue: string | undefined;
  state: string | null;
}, mode: IdentityMode = "web"): Promise<CompletedLogin> {
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
      ...backchannelHeaders(config),
      authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: body.toString(),
    cache: "no-store"
  });
  if (!tokenResponse.ok) throw new Error("OIDC token exchange failed");

  const tokens = (await tokenResponse.json()) as { id_token?: unknown; refresh_token?: unknown };
  if (typeof tokens.id_token !== "string" || typeof tokens.refresh_token !== "string") throw new Error("OIDC response did not contain identity and refresh tokens");

  const claims = await jwtVerify(tokens.id_token, createRemoteJWKSet(new URL(discovery.jwks_uri), { headers: backchannelHeaders(config) }), {
    algorithms: ["RS256", "ES256"],
    issuer: config.issuer,
    audience: config.clientId
  });
  const session = sessionFromClaims(claims.payload);
  if (!session || claims.payload.nonce !== attempt.nonce) throw new Error("OIDC identity claims are incomplete");

  return { returnTo: attempt.returnTo, roles: session.roles, session, refreshToken: tokens.refresh_token, rememberDevice: attempt.rememberDevice };
}

export async function createWebSession(login: CompletedLogin, mode: IdentityMode): Promise<string> {
  const response = await internalRequest("/api/internal/sessions", {
    kind: mode,
    refreshToken: login.refreshToken,
    session: login.session
  });
  if (!isOpaqueTokenResponse(response)) throw new Error("Opaque application session could not be created");
  return response.token;
}

export async function readWebSession(cookieValue: string | undefined, mode: IdentityMode = "web"): Promise<WebSession | undefined> {
  if (!cookieValue || !/^[A-Za-z0-9_-]{43}$/.test(cookieValue)) return undefined;
  try {
    const response = await internalRequest("/api/internal/sessions/resolve", { kind: mode, token: cookieValue });
    if (!isSessionResponse(response)) return undefined;
    return response.session ?? undefined;
  } catch {
    return undefined;
  }
}

export async function revokeWebSession(cookieValue: string | undefined, mode: IdentityMode): Promise<void> {
  if (!cookieValue || !/^[A-Za-z0-9_-]{43}$/.test(cookieValue)) return;
  try {
    await internalRequest("/api/internal/sessions/revoke", { kind: mode, token: cookieValue });
  } catch {
    // Cookie deletion still prevents use in the browser if the API is temporarily unavailable.
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
  const discoveryIssuer = config.backchannelIssuer ?? config.issuer;
  const response = await fetch(`${discoveryIssuer}/.well-known/openid-configuration`, {
    cache: "no-store",
    headers: backchannelHeaders(config)
  });
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
  return {
    ...discovery,
    jwks_uri: backchannelUrl(discovery.jwks_uri, config),
    token_endpoint: backchannelUrl(discovery.token_endpoint, config)
  } as OidcDiscovery;
}

function backchannelHeaders(config: IdentityConfig): Record<string, string> {
  if (!config.backchannelIssuer) return {};
  const publicIssuer = new URL(config.issuer);
  return {
    host: publicIssuer.host,
    "x-forwarded-host": publicIssuer.host,
    "x-forwarded-proto": publicIssuer.protocol.slice(0, -1)
  };
}

function backchannelUrl(endpoint: string, config: IdentityConfig): string {
  if (!config.backchannelIssuer) return endpoint;

  const publicIssuer = new URL(config.issuer);
  const target = new URL(endpoint);
  if (target.origin !== publicIssuer.origin || !target.pathname.startsWith(`${publicIssuer.pathname}/`)) {
    throw new Error("OIDC discovery endpoint is outside the configured issuer");
  }

  const backchannelIssuer = new URL(config.backchannelIssuer);
  const relativePath = target.pathname.slice(publicIssuer.pathname.length);
  backchannelIssuer.pathname = `${backchannelIssuer.pathname}${relativePath}`.replace(/\/+/g, "/");
  backchannelIssuer.search = target.search;
  return backchannelIssuer.toString();
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
    return {
      state: payload.state,
      nonce: payload.nonce,
      verifier: payload.verifier,
      returnTo: safeReturnTo(payload.returnTo),
      rememberDevice: payload.rememberDevice === true
    };
  } catch {
    return undefined;
  }
}

async function internalRequest(path: string, body: Record<string, unknown>): Promise<unknown> {
  const config = identityConfig();
  const timestamp = String(Date.now());
  const signature = createHmac("sha256", config.sessionSecret).update(`${timestamp}:POST:${path}`).digest("base64url");
  const response = await fetch(`${config.apiUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-studiobalance-internal-signature": signature,
      "x-studiobalance-internal-timestamp": timestamp
    },
    body: JSON.stringify(body),
    cache: "no-store"
  });
  if (!response.ok) throw new Error("Internal application session request failed");
  return response.json();
}

export function sessionFromClaims(payload: Record<string, unknown>): WebSession | undefined {
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

function isStudioRole(value: unknown): value is WebSession["roles"][number] {
  return value === "client" || value === "admin" || value === "super_admin";
}

function isOpaqueTokenResponse(value: unknown): value is { token: string } {
  return typeof value === "object" && value !== null && "token" in value && typeof value.token === "string" && /^[A-Za-z0-9_-]{43}$/.test(value.token);
}

function isSessionResponse(value: unknown): value is { session: WebSession | null } {
  if (typeof value !== "object" || value === null || !("session" in value)) return false;
  if (value.session === null) return true;
  const session = value.session as Record<string, unknown>;
  return typeof session === "object" && session !== null &&
    typeof session.subject === "string" && typeof session.email === "string" && typeof session.emailVerified === "boolean" &&
    typeof session.mfaVerified === "boolean" &&
    Array.isArray(session.roles) && session.roles.every(isStudioRole) &&
    (session.firstName === undefined || typeof session.firstName === "string") &&
    (session.lastName === undefined || typeof session.lastName === "string");
}
