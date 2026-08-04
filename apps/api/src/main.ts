import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";

import { AppModule } from "./app.module.js";
import { loadLocalEnvironment } from "./config/load-local-env.js";
import { RuntimeConfigService } from "./config/runtime-config.js";
import { configureHttp, generateRequestId } from "./http/configure-http.js";
import { writeLog } from "./observability/structured-log.js";

loadLocalEnvironment();

async function bootstrap(): Promise<void> {
  const adapter = new FastifyAdapter({
    genReqId: generateRequestId,
    logger: false
  });
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
    abortOnError: false,
    logger: false
  });
  const config = app.get(RuntimeConfigService).value;

  configureHttp(app, config);
  app.enableShutdownHooks();

  await app.listen(config.apiPort, "0.0.0.0");
  writeLog(config, "info", "api_started", "system", { port: config.apiPort });
}

try {
  await bootstrap();
} catch (error) {
  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "error",
      service: "studio-balance-api",
      message: "api_bootstrap_failed",
      requestId: "system",
      environment: process.env.APP_ENV ?? "development",
      version: process.env.APP_VERSION ?? "0.1.0",
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorMessage: error instanceof Error ? error.message : "Unknown bootstrap failure"
    })
  );
  process.exitCode = 1;
}
