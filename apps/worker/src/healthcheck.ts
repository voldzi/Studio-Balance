import { checkWorkerReady } from "./readiness.js";

if (!await checkWorkerReady(process.env.APP_VERSION ?? "0.1.0")) process.exitCode = 1;
