export function workerLog(message: string, requestId = "system", level: "info" | "error" = "info"): string {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    service: "studio-balance-worker",
    message,
    requestId,
    environment: process.env.APP_ENV ?? "development",
    version: process.env.APP_VERSION ?? "0.1.0"
  });
}
