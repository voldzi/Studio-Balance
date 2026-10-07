import { readFile, rename, writeFile } from "node:fs/promises";

export const READINESS_FILE = "/tmp/studio-balance-worker-ready.json";
export const READINESS_MAX_AGE_MS = 7 * 60 * 60_000;

export function isWorkerReady(value: unknown, version: string, now = Date.now()): boolean {
  if (!value || typeof value !== "object") return false;
  const state = value as Record<string, unknown>;
  if (state.version !== version || typeof state.completedAt !== "string") return false;
  const age = now - Date.parse(state.completedAt);
  return Number.isFinite(age) && age >= 0 && age <= READINESS_MAX_AGE_MS;
}

export async function recordWorkerReady(version: string, file = READINESS_FILE): Promise<void> {
  const pending = `${file}.pending`;
  await writeFile(pending, JSON.stringify({ version, completedAt: new Date().toISOString() }), { mode: 0o600 });
  await rename(pending, file);
}

export async function checkWorkerReady(version: string, file = READINESS_FILE): Promise<boolean> {
  try { return isWorkerReady(JSON.parse(await readFile(file, "utf8")), version); }
  catch { return false; }
}
