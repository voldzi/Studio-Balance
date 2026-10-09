import { afterEach, describe, expect, it, vi } from "vitest";

import { identityRequestId, logAdminLoginRequired, logSessionCookieCleared, logSessionCookieIssued, safeIdentityRequestId, sessionCookieState } from "./identity-log";

afterEach(() => vi.restoreAllMocks());

describe("private session diagnostics", () => {
  it("describes missing and unresolved credentials without guessing why the browser lost them", () => {
    expect(sessionCookieState(undefined, false)).toBe("missing");
    expect(sessionCookieState("malformed-private-value", false)).toBe("malformed");
    expect(sessionCookieState("a".repeat(43), false)).toBe("unrecognized");
    expect(sessionCookieState("a".repeat(43), true)).toBe("valid_without_admin_assurance");
  });

  it("bounds request identifiers and never echoes an invalid arbitrary value", () => {
    expect(identityRequestId(new Request("https://studio-balance.test", { headers: { "x-request-id": "req_private" } }))).toBe("req_private");
    for (const candidate of ["a".repeat(101), "unsafe account@example.test", "unsafe:value"]) {
      expect(safeIdentityRequestId(candidate)).toMatch(/^req_[a-f0-9-]{36}$/);
      expect(safeIdentityRequestId(candidate)).not.toContain(candidate);
    }
  });

  it("logs only allowlisted cookie state and persistence metadata", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    logAdminLoginRequired("req_admin", { adminCookie: sessionCookieState("a".repeat(43), false), webCookie: "missing", rememberDeviceRequested: true });
    logSessionCookieIssued("req_issue", "admin", true);
    logSessionCookieIssued("req_issue_web", "web", false);
    logSessionCookieCleared("req_clear", "admin", "callback_failed");
    const records = log.mock.calls.map(([serialized]) => JSON.parse(String(serialized)));
    expect(records).toEqual([
      expect.objectContaining({ message: "admin_interactive_login_required", requestId: "req_admin", adminCookie: "unrecognized", webCookie: "missing", rememberDeviceRequested: true }),
      expect.objectContaining({ message: "application_session_cookie_issued", requestId: "req_issue", mode: "admin", persistence: "remembered_90_days" }),
      expect.objectContaining({ message: "application_session_cookie_issued", requestId: "req_issue_web", mode: "web", persistence: "browser_session" }),
      expect.objectContaining({ message: "application_session_cookie_cleared", reason: "callback_failed" })
    ]);
    for (const record of records) expect(record).toMatchObject({ timestamp: expect.any(String), level: "info", service: "studio-balance-web", environment: expect.any(String), version: expect.any(String) });
    expect(JSON.stringify(records)).not.toContain("a".repeat(43));
    expect(JSON.stringify(records)).not.toMatch(/token_hash|refresh_token|email|authorization|password|error_description/i);
  });
});
