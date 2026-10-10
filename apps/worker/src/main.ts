import { loadLocalEnvironment } from "./load-local-env.js";
import { deleteExpiredReviewRates } from "./review-rate-cleanup.js";
import { workerLog } from "./log.js";
import { generateWeeklySchedule, weeklySchedulePool } from "./weekly-schedule.js";
import { unlink } from "node:fs/promises";
import { READINESS_FILE, recordWorkerReady } from "./readiness.js";

loadLocalEnvironment();
console.log(workerLog("worker_started"));

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl && process.env.APP_ENV === "production") {
  throw new Error("DATABASE_URL is required for the production schedule worker.");
}
const pool = databaseUrl ? weeklySchedulePool(databaseUrl) : null;
let working = false;
let retry: ReturnType<typeof setTimeout> | undefined;
await unlink(READINESS_FILE).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
async function refreshSchedule(): Promise<void> {
  if (!pool || working) return;
  working = true;
  try {
    const result = await generateWeeklySchedule(pool);
    if (result.locked) await recordWorkerReady(process.env.APP_VERSION ?? "0.1.0");
    else retry = setTimeout(() => { void refreshSchedule(); }, 10_000);
    console.log(workerLog(`weekly_schedule_generated created=${result.created} skipped=${result.skipped} locked=${result.locked}`));
  } catch (error) {
    console.error(workerLog(`weekly_schedule_failed: ${error instanceof Error ? error.message : "unknown error"}`, "weekly-schedule", "error"));
    if (process.env.APP_ENV === "production") {
      await pool.end();
      process.exit(1);
    }
  } finally {
    working = false;
  }
}
void refreshSchedule();
let cleaningReviewRates = false;
async function cleanReviewRates(): Promise<void> {
  if (!pool || cleaningReviewRates) return;
  cleaningReviewRates = true;
  try {
    const removed = await deleteExpiredReviewRates(pool);
    if (removed) console.log(workerLog(`review_rate_events_expired removed=${removed}`, "review-rate-cleanup"));
  } catch (error) {
    console.error(workerLog(`review_rate_cleanup_failed errorName=${error instanceof Error ? error.name : "UnknownError"}`, "review-rate-cleanup", "error"));
  } finally { cleaningReviewRates = false; }
}
void cleanReviewRates();
const reviewRateMaintenance = setInterval(() => { void cleanReviewRates(); }, 10 * 60_000);
const keepAlive = setInterval(() => { void refreshSchedule(); }, 6 * 60 * 60_000);

async function stop(signal: string): Promise<void> {
  clearInterval(keepAlive);
  clearInterval(reviewRateMaintenance);
  clearTimeout(retry);
  await pool?.end();
  console.log(workerLog("worker_stopped", signal));
  process.exit(0);
}

process.once("SIGINT", () => { void stop("SIGINT"); });
process.once("SIGTERM", () => { void stop("SIGTERM"); });
