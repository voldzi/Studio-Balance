import type { RuntimeConfig } from "../config/runtime-config.js";

type LogLevel = "debug" | "info" | "warn" | "error";

type LogFields = Readonly<Record<string, boolean | number | string | undefined>>;

const priorities: Record<LogLevel, number> = {
  debug: 10,
  error: 40,
  info: 20,
  warn: 30
};

export function writeLog(
  config: RuntimeConfig,
  level: LogLevel,
  message: string,
  requestId: string,
  fields: LogFields = {}
): void {
  if (priorities[level] < priorities[config.logLevel]) {
    return;
  }

  const record = {
    timestamp: new Date().toISOString(),
    level,
    service: "studio-balance-api",
    message,
    requestId,
    environment: config.environment,
    version: config.version,
    ...fields
  };

  const output = JSON.stringify(record);
  if (level === "error") {
    console.error(output);
  } else {
    console.log(output);
  }
}
