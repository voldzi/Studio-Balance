import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkWorkerReady, isWorkerReady, READINESS_MAX_AGE_MS, recordWorkerReady } from "./readiness.js";

describe("worker readiness", () => {
  it("rejects a stale, future, invalid, or different revision marker", () => {
    const now = Date.now();
    const marker = (completedAt: string, version = "abc1234") => ({ version, completedAt });
    expect(isWorkerReady(marker(new Date(now).toISOString()), "abc1234", now)).toBe(true);
    expect(isWorkerReady(marker(new Date(now - READINESS_MAX_AGE_MS - 1).toISOString()), "abc1234", now)).toBe(false);
    expect(isWorkerReady(marker(new Date(now + 1).toISOString()), "abc1234", now)).toBe(false);
    expect(isWorkerReady(marker("invalid"), "abc1234", now)).toBe(false);
    expect(isWorkerReady(marker(new Date(now).toISOString(), "def5678"), "abc1234", now)).toBe(false);
  });

  it("fails before first generation and on damaged evidence, then accepts an atomic completion", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "studio-worker-ready-"));
    const file = path.join(directory, "ready.json");
    try {
      expect(await checkWorkerReady("abc1234", file)).toBe(false);
      await writeFile(file, "partial");
      expect(await checkWorkerReady("abc1234", file)).toBe(false);
      await recordWorkerReady("abc1234", file);
      expect(await checkWorkerReady("abc1234", file)).toBe(true);
      expect(JSON.parse(await readFile(file, "utf8")).version).toBe("abc1234");
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
