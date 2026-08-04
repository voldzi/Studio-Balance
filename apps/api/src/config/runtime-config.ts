import { Injectable } from "@nestjs/common";
import { z } from "zod";

const schema = z.object({
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  APP_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
  APP_VERSION: z.string().min(1).default("0.1.0"),
  DATABASE_URL: z
    .string()
    .url()
    .default("postgresql://studio_balance:local-development-only@localhost:5433/studio_balance"),
  SESSION_SECRET: z.string().min(32).optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info")
});

export type RuntimeConfig = {
  apiPort: number;
  databaseUrl: string;
  environment: z.infer<typeof schema>["APP_ENV"];
  logLevel: z.infer<typeof schema>["LOG_LEVEL"];
  sessionSecret: string;
  version: string;
};

export function loadRuntimeConfig(environment: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const result = schema.safeParse(environment);

  if (!result.success) {
    const names = result.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Invalid runtime configuration: ${names}`);
  }

  const databaseUrl = new URL(result.data.DATABASE_URL);
  if (
    result.data.APP_ENV === "production" &&
    (databaseUrl.hostname !== "haproxy.home.cz" || databaseUrl.port !== "5000")
  ) {
    throw new Error("Production DATABASE_URL must use haproxy.home.cz:5000");
  }

  if (result.data.APP_ENV === "production" && !result.data.SESSION_SECRET) {
    throw new Error("Production SESSION_SECRET is required");
  }

  return {
    apiPort: result.data.API_PORT,
    databaseUrl: result.data.DATABASE_URL,
    environment: result.data.APP_ENV,
    logLevel: result.data.LOG_LEVEL,
    sessionSecret: result.data.SESSION_SECRET ?? "local-development-session-secret-change-before-sharing",
    version: result.data.APP_VERSION
  };
}

@Injectable()
export class RuntimeConfigService {
  readonly value = loadRuntimeConfig();
}
