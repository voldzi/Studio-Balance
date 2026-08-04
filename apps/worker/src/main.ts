import { loadLocalEnvironment } from "./load-local-env.js";
import { workerLog } from "./log.js";

loadLocalEnvironment();
console.log(workerLog("worker_started"));

const keepAlive = setInterval(() => undefined, 60_000);

function stop(signal: string): void {
  clearInterval(keepAlive);
  console.log(workerLog("worker_stopped", signal));
  process.exit(0);
}

process.once("SIGINT", () => stop("SIGINT"));
process.once("SIGTERM", () => stop("SIGTERM"));
