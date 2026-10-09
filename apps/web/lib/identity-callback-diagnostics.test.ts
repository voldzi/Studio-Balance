import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ finishLogin: vi.fn(), createWebSession: vi.fn() }));
vi.mock("./identity", async (importOriginal) => ({ ...(await importOriginal<typeof import("./identity")>()), ...mock }));

import { GET as adminCallback } from "../app/admin/auth/callback/route";
import { GET as webCallback } from "../app/auth/callback/route";

afterEach(() => { vi.restoreAllMocks(); vi.resetAllMocks(); });

describe("session cookie diagnostics at the authentication boundary", () => {
  it.each([["web", true], ["web", false], ["admin", true], ["admin", false]] as const)("records actual %s cookie persistence (remembered=%s) without identity data", async (mode, rememberDevice) => {
    const session = { subject: "synthetic-owner", email: "private@example.test", emailVerified: false, roles: ["admin"], mfaVerified: true };
    const login = { rememberDevice, returnTo: mode === "admin" ? "/admin" : "/muj-ucet", refreshToken: "private-synthetic-refresh", roles: session.roles, session };
    mock.finishLogin.mockResolvedValue(login);
    mock.createWebSession.mockResolvedValue("a".repeat(43));
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const request = new NextRequest(`http://localhost:3000/${mode === "admin" ? "admin/" : ""}auth/callback?code=private-code&state=private-state`, {
      headers: { "x-request-id": "req_callback" }
    });
    const response = await (mode === "admin" ? adminCallback(request) : webCallback(request));
    expect(response.status).toBe(307);
    expect(mock.createWebSession).toHaveBeenCalledWith(login, mode, "req_callback");
    expect(response.headers.get("set-cookie")).toContain(`${mode === "admin" ? "sb_admin_session" : "sb_session"}=`);
    if (rememberDevice) expect(response.headers.get("set-cookie")).toContain("Max-Age=7776000");
    else expect(response.headers.get("set-cookie")).not.toContain("Max-Age=7776000");
    expect(log).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({ message: "application_session_cookie_issued", requestId: "req_callback", mode,
      persistence: rememberDevice ? "remembered_90_days" : "browser_session" });
    const serialized = JSON.stringify(log.mock.calls);
    for (const sensitive of [session.email, session.subject, login.refreshToken, "a".repeat(43), "private-code", "private-state"]) expect(serialized).not.toContain(sensitive);
  });

  it("records an existing admin cookie being cleared by a failed callback without guessing its server state", async () => {
    mock.finishLogin.mockRejectedValue(new Error("Invalid OIDC login state"));
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const failure = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const request = new NextRequest("http://localhost:3000/admin/auth/callback?code=private-code", {
      headers: { cookie: `sb_admin_session=${"b".repeat(43)}`, "x-request-id": "req_failed_callback" }
    });
    const response = await adminCallback(request);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/admin/prihlaseni");
    expect(mock.createWebSession).not.toHaveBeenCalled();
    expect(JSON.parse(String(failure.mock.calls[0]?.[0]))).toMatchObject({ message: "admin_oidc_login_failed", errorCode: "ADMIN_OIDC_STATE_INVALID", requestId: "req_failed_callback" });
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({ message: "application_session_cookie_cleared", reason: "callback_failed", requestId: "req_failed_callback", mode: "admin" });
    expect(JSON.stringify([...log.mock.calls, ...failure.mock.calls])).not.toContain("b".repeat(43));
  });
});
