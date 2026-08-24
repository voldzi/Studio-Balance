import { afterEach, describe, expect, it } from "vitest";

import { absolutePublicUrl, pageMetadata, productionPublicAppUrl, publicAppUrl, studioStructuredData } from "./seo";

const originalEnvironment = {
  APP_ENV: process.env.APP_ENV,
  NODE_ENV: process.env.NODE_ENV,
  PUBLIC_APP_URL: process.env.PUBLIC_APP_URL
};

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("SEO configuration", () => {
  it("uses the canonical production origin even when no runtime URL was injected", () => {
    delete process.env.PUBLIC_APP_URL;
    process.env.APP_ENV = "production";
    expect(publicAppUrl()).toBe(productionPublicAppUrl);
    expect(absolutePublicUrl("/sitemap.xml")).toBe("https://studio-balance.cz/sitemap.xml");
  });

  it("creates an absolute canonical and matching social URL", () => {
    process.env.PUBLIC_APP_URL = "https://www.example.cz/path";
    const metadata = pageMetadata({ description: "Popis", path: "/lekce", title: "Lekce" });
    expect(metadata.alternates?.canonical).toBe("https://www.example.cz/lekce");
    expect(metadata.openGraph?.url).toBe("https://www.example.cz/lekce");
  });

  it("publishes Studio Balance and its Bruntál address as linked structured data", () => {
    process.env.PUBLIC_APP_URL = "https://studio-balance.cz";
    const data = studioStructuredData();
    expect(JSON.stringify(data)).toContain("SportsActivityLocation");
    expect(JSON.stringify(data)).toContain("Ruská 10");
    expect(JSON.stringify(data)).toContain("https://studio-balance.cz/#studio");
  });
});
