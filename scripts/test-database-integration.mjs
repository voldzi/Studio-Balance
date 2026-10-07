// Mandatory CI gate. Never infer an integration connection from production .env.
import { createRequire } from "node:module";
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const api = new URL("../apps/api/", import.meta.url);
const require = createRequire(new URL("package.json", api));
const { Client } = require("pg");
const connectionString = process.env.STUDIO_TEST_DATABASE_URL;
if (!connectionString) throw new Error("STUDIO_TEST_DATABASE_URL is mandatory for the integration gate");
const url = new URL(connectionString);
if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || !/^\/studio_balance_(ci|test)(_[a-z0-9]+)?$/.test(url.pathname)) {
  throw new Error("Integration gate requires a dedicated local studio_balance_ci/test database");
}
const client = new Client({ connectionString, connectionTimeoutMillis: 5000, query_timeout: 10_000 });
await client.connect();
try {
  const version = Number((await client.query("SHOW server_version_num")).rows[0].server_version_num);
  if (version < 180000 || version >= 190000) throw new Error("Integration gate requires PostgreSQL 18");
  // Pre-create once to avoid concurrent CREATE EXTENSION races in isolated schemas.
  await client.query("CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public");
} finally { await client.end(); }
const files = (await readdir(new URL("src/", api), { recursive: true })).filter(file => file.endsWith(".integration.test.ts")).sort().map(file => `src/${file}`);
if (!files.length) throw new Error("No database integration tests were found");
const result = spawnSync("pnpm", ["exec", "vitest", "run", "--no-file-parallelism", ...files], { cwd: fileURLToPath(api), env: process.env, stdio: "inherit" });
if (result.error) throw new Error("Unable to run the database integration tests");
process.exitCode = result.status ?? 1;
