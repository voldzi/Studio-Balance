import { describe, expect, it } from "vitest";

import { publicSessionLabel, STUDIO_TIME_ZONE } from "./index.js";

describe("public session presentation", () => {
  it("uses the binding studio timezone", () => {
    expect(STUDIO_TIME_ZONE).toBe("Europe/Prague");
  });

  it("does not reveal a numeric remaining-place count", () => {
    expect(publicSessionLabel("full")).toBe("Lekce je obsazena");
  });
});
