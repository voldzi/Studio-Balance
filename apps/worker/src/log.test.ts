import { describe, expect, it } from "vitest";

import { workerLog } from "./log.js";

describe("worker structured log", () => {
  it("contains every mandatory field", () => {
    expect(JSON.parse(workerLog("worker_started"))).toMatchObject({
      environment: expect.any(String),
      level: "info",
      message: "worker_started",
      requestId: "system",
      service: "studio-balance-worker",
      timestamp: expect.any(String),
      version: expect.any(String)
    });
  });
});
