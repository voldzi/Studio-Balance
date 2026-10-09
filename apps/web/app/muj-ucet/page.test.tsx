import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readWebSession: vi.fn(),
  redirect: vi.fn((href: string): never => { throw new Error(`redirect:${href}`); })
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("../../lib/identity", () => ({ identityCookies: { session: "sb_session" }, readWebSession: mocks.readWebSession }));

import AccountPage from "./page";

beforeEach(() => {
  mocks.redirect.mockClear();
  mocks.readWebSession.mockReset();
});

describe("account section entry", () => {
  it.each(["news", "messages", "reservations", "profile", "favorites"])("returns an expired session to %s after login", async (view) => {
    mocks.readWebSession.mockResolvedValue(undefined);
    const href = `/prihlaseni?returnTo=${encodeURIComponent(`/muj-ucet?view=${view}`)}`;
    await expect(AccountPage({ searchParams: Promise.resolve({ view }) })).rejects.toThrow(`redirect:${href}`);
    expect(mocks.redirect).toHaveBeenCalledWith(href);
  });

  it.each(["//attacker.example", "/\\attacker.example", "news&returnTo=https://attacker.example", "NEWS", ["news", "messages"]])("rejects an unknown or repeated section selector %j", async (view) => {
    mocks.readWebSession.mockResolvedValue(undefined);
    await expect(AccountPage({ searchParams: Promise.resolve({ view }) })).rejects.toThrow("redirect:/prihlaseni?returnTo=%2Fmuj-ucet");
  });

  it("renders an authenticated news entry directly instead of briefly showing Home", async () => {
    mocks.readWebSession.mockResolvedValue({ subject: "synthetic-client" });
    const element = await AccountPage({ searchParams: Promise.resolve({ view: "news" }) });
    expect(element.props.initialView).toBe("news");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
