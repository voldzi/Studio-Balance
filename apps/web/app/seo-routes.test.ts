import { afterEach, describe, expect, it, vi } from "vitest";

import robots from "./robots";
import sitemap from "./sitemap";

const originalEnvironment = {
  API_URL: process.env.API_URL,
  APP_ENV: process.env.APP_ENV,
  PUBLIC_APP_URL: process.env.PUBLIC_APP_URL
};

afterEach(() => {
  vi.unstubAllGlobals();
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("search engine discovery routes", () => {
  it("announces the canonical sitemap and protects private paths for every named crawler", () => {
    process.env.PUBLIC_APP_URL = "https://studio-balance.cz";
    const result = robots();
    expect(result.sitemap).toBe("https://studio-balance.cz/sitemap.xml");
    expect(JSON.stringify(result.rules)).toContain("OAI-SearchBot");
    expect(JSON.stringify(result.rules)).toContain("Claude-SearchBot");
    expect(JSON.stringify(result.rules)).toContain("SeznamBot");
    expect(JSON.stringify(result.rules)).toContain("/admin/");
  });

  it("lists every public content page and active lesson from the API", async () => {
    process.env.PUBLIC_APP_URL = "https://studio-balance.cz";
    process.env.API_URL = "http://api:3001";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      items: [
        { active: true, slug: "trx" },
        { active: false, slug: "archivni-lekce" }
      ]
    }), { status: 200 })));

    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls).toContain("https://studio-balance.cz/balance-flow");
    expect(urls).toContain("https://studio-balance.cz/recenze");
    expect(urls).toContain("https://studio-balance.cz/lekce/trx");
    expect(urls).not.toContain("https://studio-balance.cz/lekce/archivni-lekce");
    expect(urls.some((url) => url.includes("localhost"))).toBe(false);
  });
});
