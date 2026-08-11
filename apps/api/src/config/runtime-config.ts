import { Injectable } from "@nestjs/common";
import { z } from "zod";

const optional = <T extends z.ZodTypeAny>(value: T) => z.preprocess((input) => input === "" ? undefined : input, value.optional());

const schema = z.object({
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  APP_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
  APP_VERSION: z.string().min(1).default("0.1.0"),
  DATABASE_URL: z
    .string()
    .url()
    .default("postgresql://studio_balance:local-development-only@localhost:5433/studio_balance"),
  SESSION_SECRET: z.string().min(32).optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  S3_ENDPOINT: optional(z.string().url()),
  S3_REGION: z.string().min(1).default("us-east-1"),
  S3_BUCKET: optional(z.string().min(3).max(63)),
  S3_ACCESS_KEY_ID: optional(z.string().min(1)),
  S3_SECRET_ACCESS_KEY: optional(z.string().min(1)),
  S3_FORCE_PATH_STYLE: z.enum(["true", "false"]).default("true")
});

export type MediaStorageConfig = {
  accessKeyId: string;
  bucket: string;
  endpoint: string;
  forcePathStyle: boolean;
  region: string;
  secretAccessKey: string;
};

export type RuntimeConfig = {
  apiPort: number;
  databaseUrl: string;
  environment: z.infer<typeof schema>["APP_ENV"];
  logLevel: z.infer<typeof schema>["LOG_LEVEL"];
  mediaStorage?: MediaStorageConfig;
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

  const mediaValues = [result.data.S3_ENDPOINT, result.data.S3_BUCKET, result.data.S3_ACCESS_KEY_ID, result.data.S3_SECRET_ACCESS_KEY];
  const configuredMediaValues = mediaValues.filter(Boolean).length;
  if (configuredMediaValues > 0 && configuredMediaValues !== mediaValues.length) {
    throw new Error("S3 media storage must define endpoint, bucket, access key and secret key together");
  }

  return {
    apiPort: result.data.API_PORT,
    databaseUrl: result.data.DATABASE_URL,
    environment: result.data.APP_ENV,
    logLevel: result.data.LOG_LEVEL,
    ...(configuredMediaValues === mediaValues.length ? { mediaStorage: {
      accessKeyId: result.data.S3_ACCESS_KEY_ID!,
      bucket: result.data.S3_BUCKET!,
      endpoint: result.data.S3_ENDPOINT!,
      forcePathStyle: result.data.S3_FORCE_PATH_STYLE === "true",
      region: result.data.S3_REGION,
      secretAccessKey: result.data.S3_SECRET_ACCESS_KEY!
    } } : {}),
    sessionSecret: result.data.SESSION_SECRET ?? "local-development-session-secret-change-before-sharing",
    version: result.data.APP_VERSION
  };
}

@Injectable()
export class RuntimeConfigService {
  readonly value = loadRuntimeConfig();
}
