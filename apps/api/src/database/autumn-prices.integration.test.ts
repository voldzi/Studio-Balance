import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";

import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const databaseUrl = process.env.STUDIO_TEST_DATABASE_URL;
const migrations = new URL("../../../../infra/postgres/migrations/", import.meta.url);

describe.skipIf(!databaseUrl)("confirmed autumn price correction (local PostgreSQL)", () => {
  let client: Client;
  let schema: string;

  beforeEach(async () => {
    const url = new URL(databaseUrl!);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("Integration tests require a local database.");
    client = new Client({ connectionString: databaseUrl });
    await client.connect();
    await client.query("CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public");
    schema = `studio_prices_test_${randomUUID().replaceAll("-", "")}`;
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}", public`);
    for (const file of (await readdir(migrations)).filter((name) => name.endsWith(".sql") && name < "0023").sort()) {
      await client.query(await readFile(new URL(file, migrations), "utf8"));
    }
  }, 30_000);

  afterEach(async () => {
    if (!client) return;
    await client.query("ROLLBACK").catch(() => undefined);
    if (schema) await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await client.end();
  });

  async function makeBooking(slug: string, future: boolean, price: number, status = "reserved") {
    const start = future ? "now() + interval '10 days'" : "now() - interval '10 days'";
    const session = await client.query<{ id: string }>(`
      INSERT INTO class_sessions (class_type_id, instructor_id, start_at, end_at,
        location_name, location_address, price_cents, capacity, booking_opens_at, booking_closes_at)
      SELECT type.id, instructor.id, ${start}, ${start} + interval '1 hour',
        'Studio Balance', 'Ruská 10, Bruntál', $2, 10,
        ${start} - interval '30 days', ${start} - interval '30 minutes'
      FROM class_types AS type CROSS JOIN LATERAL (SELECT id FROM instructors LIMIT 1) AS instructor
      WHERE type.slug = $1 RETURNING id`, [slug, price]);
    const user = await client.query<{ id: string }>(`
      INSERT INTO user_profiles (oidc_subject, email)
      VALUES ($1, $2) RETURNING id`, [randomUUID(), `${randomUUID()}@example.test`]);
    const booking = await client.query<{ id: string }>(`
      INSERT INTO bookings (user_id, session_id, status, source, price_snapshot_cents,
        terms_version, cancellation_cutoff_at)
      SELECT $1, $2, $3, 'web', $4, 'test', start_at - interval '24 hours'
      FROM class_sessions WHERE id = $2 RETURNING id`,
    [user.rows[0]!.id, session.rows[0]!.id, status, price]);
    return { bookingId: booking.rows[0]!.id, sessionId: session.rows[0]!.id };
  }

  it("updates only future active Barre booking snapshots and future Balance Flow sessions", async () => {
    const barre = await makeBooking("barre", true, 25000);
    const oldBarre = await makeBooking("barre", false, 25000, "attended");
    const balance = await makeBooking("balance-flow", true, 20000);

    await client.query("BEGIN");
    await client.query(await readFile(new URL("0023_confirmed_autumn_prices.sql", migrations), "utf8"));
    await client.query("COMMIT");

    const prices = await client.query<{ id: string; price_snapshot_cents: number }>(
      "SELECT id, price_snapshot_cents FROM bookings WHERE id = ANY($1::uuid[])",
      [[barre.bookingId, oldBarre.bookingId, balance.bookingId]]
    );
    expect(Object.fromEntries(prices.rows.map((row) => [row.id, row.price_snapshot_cents]))).toEqual({
      [barre.bookingId]: 27000, [oldBarre.bookingId]: 25000, [balance.bookingId]: 20000
    });
    expect((await client.query<{ price_cents: number }>("SELECT price_cents FROM class_sessions WHERE id=$1", [balance.sessionId])).rows[0]?.price_cents).toBe(16000);
    expect((await client.query<{ price_cents: number }>(`SELECT rule.price_cents FROM weekly_schedule_rules AS rule
      JOIN class_types AS type ON type.id=rule.class_type_id WHERE type.slug='balance-flow'`)).rows.every((row) => row.price_cents === 16000)).toBe(true);
    expect((await client.query<{ count: number }>("SELECT count(*)::int AS count FROM account_notifications WHERE booking_id=$1", [barre.bookingId])).rows[0]?.count).toBe(1);
    expect((await client.query<{ count: number }>("SELECT count(*)::int AS count FROM application_audit WHERE entity_id=$1 AND action='booking.price_corrected'", [barre.bookingId])).rows[0]?.count).toBe(1);
  });

  it("refuses a booked price change if a fee is already due", async () => {
    const barre = await makeBooking("barre", true, 25000);
    await client.query(`INSERT INTO cancellation_fees (booking_id, user_id, amount_cents)
      SELECT id, user_id, 25000 FROM bookings WHERE id=$1`, [barre.bookingId]);

    await client.query("BEGIN");
    await expect(client.query(await readFile(new URL("0023_confirmed_autumn_prices.sql", migrations), "utf8")))
      .rejects.toThrow("active or settled fee");
    await client.query("ROLLBACK");

    expect((await client.query<{ price_snapshot_cents: number }>("SELECT price_snapshot_cents FROM bookings WHERE id=$1", [barre.bookingId])).rows[0]?.price_snapshot_cents).toBe(25000);
    expect((await client.query<{ count: number }>("SELECT count(*)::int AS count FROM account_notifications WHERE booking_id=$1", [barre.bookingId])).rows[0]?.count).toBe(0);
  });
});
