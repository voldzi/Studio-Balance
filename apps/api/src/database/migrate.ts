import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { Client } from "pg";

import { loadLocalEnvironment } from "../config/load-local-env.js";
import { loadRuntimeConfig } from "../config/runtime-config.js";

loadLocalEnvironment();
const config = loadRuntimeConfig();
const migrationsDirectory = path.resolve(process.cwd(), "../../infra/postgres/migrations");
const client = new Client({ connectionString: config.databaseUrl });

await client.connect();

try {
  await client.query("SELECT pg_advisory_lock(hashtext('studio_balance_migrations'))");
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const files = (await readdir(migrationsDirectory)).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = await readFile(path.join(migrationsDirectory, file), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const previous = await client.query<{ checksum: string }>(
      "SELECT checksum FROM schema_migrations WHERE name = $1",
      [file]
    );

    if (previous.rowCount === 1) {
      if (previous.rows[0]?.checksum !== checksum) {
        throw new Error(`Applied migration has changed: ${file}`);
      }
      continue;
    }

    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)", [file, checksum]);
      await client.query("COMMIT");
      console.log(`Applied ${file}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
} finally {
  await client.query("SELECT pg_advisory_unlock(hashtext('studio_balance_migrations'))").catch(() => undefined);
  await client.end();
}
