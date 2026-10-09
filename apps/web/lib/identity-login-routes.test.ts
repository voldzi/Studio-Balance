import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GET as adminLogin } from "../app/admin/auth/login/route";
import { GET as clientLogin } from "../app/auth/login/route";

const originalAppUrl = process.env.PUBLIC_APP_URL;
const client = { subject: "synthetic", email: "synthetic@example.test", emailVerified: false, mfaVerified: false, roles: ["client"] };

afterEach(() => {
  vi.unstubAllGlobals(); vi.restoreAllMocks();
  if (originalAppUrl === undefined) delete process.env.PUBLIC_APP_URL;
  else process.env.PUBLIC_APP_URL = originalAppUrl;
});

describe("remembered login entry points", () => {
  it.each(["missing", "unrecognized"])("records %s admin cookies only when an interactive login is actually needed", async (state) => {
    process.env.PUBLIC_APP_URL = "https://studio-balance.cz";
    const issuer = process.env.OIDC_ISSUER_URL ?? "http://localhost:8081/realms/studio-balance";
    const fetchMock = vi.fn().mockImplementation(async (url: string) => ({ ok: true, json: async () => url.includes("/api/internal/sessions/resolve")
      ? { session: null }
      : { issuer, authorization_endpoint: `${issuer}/protocol/openid-connect/auth`, token_endpoint: `${issuer}/protocol/openid-connect/token`, jwks_uri: `${issuer}/protocol/openid-connect/certs` } }));
    vi.stubGlobal("fetch", fetchMock);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const token = "a".repeat(43);
    const request = new NextRequest("https://studio-balance.cz/admin/auth/login?rememberDevice=1", {
      headers: { "x-request-id": "req_login_diagnostic", ...(state === "unrecognized" ? { cookie: `sb_admin_session=${token}` } : {}) }
    });
    const response = await adminLogin(request);
    expect(new URL(response.headers.get("location")!).pathname).toContain("/protocol/openid-connect/auth");
    expect(log).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({ message: "admin_interactive_login_required",
      requestId: "req_login_diagnostic", adminCookie: state, webCookie: "missing", rememberDeviceRequested: true });
    expect(JSON.stringify(log.mock.calls)).not.toContain(token);
    if (state === "unrecognized") expect((fetchMock.mock.calls[0]?.[1] as RequestInit).headers).toMatchObject({ "x-request-id": "req_login_diagnostic" });
  });
  it.each(["web", "admin"])("keeps a remembered %s session and shows temporary unavailability without starting another OIDC flow", async (kind) => {
    process.env.PUBLIC_APP_URL = "https://studio-balance.cz";
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const request = new NextRequest(`https://studio-balance.cz/${kind === "admin" ? "admin/" : ""}auth/login`, {
      headers: { cookie: `${kind === "admin" ? "sb_admin_session" : "sb_session"}=${"a".repeat(43)}` }
    });
    const response = await (kind === "admin" ? adminLogin(request) : clientLogin(request));
    const location = new URL(response.headers.get("location")!);
    expect(location.origin).toBe("https://studio-balance.cz");
    expect(location.searchParams.get("error")).toBe("unavailable");
    expect(response.headers.has("set-cookie")).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/api/internal/sessions/resolve");
  });

  it("reuses a verified administrator session but keeps a backslash return URL on the studio origin", async () => {
    process.env.PUBLIC_APP_URL = "https://studio-balance.cz";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ session: { ...client, roles: ["admin"], mfaVerified: true } }) }));
    const request = new NextRequest(`https://studio-balance.cz/admin/auth/login?returnTo=${encodeURIComponent("/\\attacker.example")}`, {
      headers: { cookie: `sb_admin_session=${"a".repeat(43)}` }
    });
    const response = await adminLogin(request);
    expect(response.headers.get("location")).toBe("https://studio-balance.cz/muj-ucet");
    expect(response.headers.has("set-cookie")).toBe(false);
  });

  it("accepts an existing MFA-proven fallback admin session when a separate web session cannot be revalidated", async () => {
    process.env.PUBLIC_APP_URL = "https://studio-balance.cz";
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      return JSON.parse(String(init.body)).kind === "admin"
        ? { ok: true, json: async () => ({ session: { ...client, roles: ["admin"], mfaVerified: true } }) }
        : { ok: false, status: 503 };
    }));
    const request = new NextRequest("https://studio-balance.cz/admin/auth/login", {
      headers: { cookie: `sb_admin_session=${"a".repeat(43)}; sb_session=${"b".repeat(43)}` }
    });
    expect((await adminLogin(request)).headers.get("location")).toBe("https://studio-balance.cz/admin");
  });
});
