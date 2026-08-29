export function workerLog(message: string, requestId = "system"): string {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    level: "info",
    service: "studio-balance-worker",
    message,
    requestId,
    environment: process.env.APP_ENV ?? "development",
    version: process.env.APP_VERSION ?? "0.1.0"
  });
}
