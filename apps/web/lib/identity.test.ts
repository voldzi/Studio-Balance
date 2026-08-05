import { afterEach, describe, expect, it } from "vitest";

import { publicRedirectUrl } from "./identity";

const originalPublicAppUrl = process.env.PUBLIC_APP_URL;

afterEach(() => {
  if (originalPublicAppUrl === undefined) delete process.env.PUBLIC_APP_URL;
  else process.env.PUBLIC_APP_URL = originalPublicAppUrl;
});

describe("publicRedirectUrl", () => {
  it("always returns to the configured public origin behind a reverse proxy", () => {
    process.env.PUBLIC_APP_URL = "https://studiobalance.zeleznalady.cz";
    expect(publicRedirectUrl("/rezervace/session-id").toString()).toBe("https://studiobalance.zeleznalady.cz/rezervace/session-id");
  });

  it("uses the same public origin for the separate admin callback", () => {
    process.env.PUBLIC_APP_URL = "https://studiobalance.zeleznalady.cz";
    expect(publicRedirectUrl("/admin", "admin").toString()).toBe("https://studiobalance.zeleznalady.cz/admin");
  });
});
