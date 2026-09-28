import { Pool, type PoolClient } from "pg";

type Rule = {
  id: string;
  class_type_id: string;
  instructor_id: string;
  weekday: number;
  local_start_time: string;
  duration_minutes: number;
  arrival_lead_minutes: number;
  location_name: string;
  location_address: string;
  price_cents: number;
  capacity: number;
  booking_lead_days: number;
  equipment: string;
  suitability: string;
  generate_from: string;
};

export function localDates(from: string, through: string): { date: string; weekday: number }[] {
  const result: { date: string; weekday: number }[] = [];
  for (let day = Date.parse(`${from}T00:00:00Z`); day <= Date.parse(`${through}T00:00:00Z`); day += 86_400_000) {
    const date = new Date(day).toISOString().slice(0, 10);
    result.push({ date, weekday: new Date(day).getUTCDay() || 7 });
  }
  return result;
}

export async function generateWeeklySchedule(pool: Pool): Promise<{ created: number; skipped: number; locked: boolean }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const lock = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_xact_lock(hashtext('studio_balance_weekly_schedule')) AS locked");
    if (!lock.rows[0]?.locked) {
      await client.query("ROLLBACK");
      return { created: 0, skipped: 0, locked: false };
    }
    await client.query("LOCK TABLE class_sessions IN SHARE ROW EXCLUSIVE MODE");
    await client.query("LOCK TABLE weekly_schedule_rules IN SHARE MODE");
    const bounds = await client.query<{ first_date: string; last_date: string }>(
      `SELECT (now() AT TIME ZONE 'Europe/Prague')::date::text AS first_date,
        ((now() AT TIME ZONE 'Europe/Prague')::date + interval '3 months')::date::text AS last_date`
    );
    const firstDate = bounds.rows[0]?.first_date;
    const lastDate = bounds.rows[0]?.last_date;
    if (!firstDate || !lastDate) throw new Error("Unable to calculate the weekly schedule horizon.");
    const rules = await client.query<Rule>(`SELECT rule.id,rule.class_type_id,rule.instructor_id,rule.weekday,
      rule.local_start_time::text,rule.duration_minutes,rule.arrival_lead_minutes,
      rule.location_name,rule.location_address,rule.price_cents,rule.capacity,
      rule.booking_lead_days,rule.equipment,rule.suitability,rule.generate_from::text
      FROM weekly_schedule_rules rule
      JOIN class_types type ON type.id=rule.class_type_id AND type.active=true
      JOIN instructors instructor ON instructor.id=rule.instructor_id AND instructor.active=true
      WHERE rule.active=true ORDER BY rule.weekday,rule.local_start_time`);
    let created = 0;
    let skipped = 0;
    for (const { date, weekday } of localDates(firstDate, lastDate)) {
      for (const rule of rules.rows) {
        if (rule.weekday !== weekday || date < rule.generate_from) continue;
        if (await existsForOccurrence(client, rule, date)) { skipped++; continue; }
        const time = await client.query<{ start_at: Date }>(
          "SELECT (($1::date + $2::time) AT TIME ZONE 'Europe/Prague') AS start_at",
          [date, rule.local_start_time]
        );
        const startAt = time.rows[0]?.start_at;
        if (!startAt) throw new Error(`Unable to calculate the session start for ${date}.`);
        const collision = await client.query<{ id: string }>(`SELECT id FROM class_sessions
          WHERE status='scheduled' AND start_at < $2::timestamptz + make_interval(mins => $3)
            AND end_at > $2 AND (instructor_id=$1 OR (location_name=$4 AND location_address=$5))
          LIMIT 1`, [rule.instructor_id, startAt, rule.duration_minutes, rule.location_name, rule.location_address]);
        if (collision.rowCount) throw new Error(`Weekly session conflicts with another lesson on ${date} at ${rule.local_start_time}.`);
        const inserted = await client.query<{ id: string }>(`INSERT INTO class_sessions (
          class_type_id,instructor_id,start_at,end_at,arrival_lead_minutes,location_name,
          location_address,price_cents,capacity,booking_opens_at,booking_closes_at,
          equipment,suitability,weekly_rule_id,weekly_occurrence_date
        ) VALUES (
          $1,$2,$3,$3::timestamptz + make_interval(mins => $4),$5,$6,$7,$8,$9,
          $3::timestamptz - make_interval(days => $10),$3::timestamptz - interval '30 minutes',
          $11,$12,$13,$14
        ) ON CONFLICT (weekly_rule_id,weekly_occurrence_date) WHERE weekly_rule_id IS NOT NULL
          DO NOTHING RETURNING id`, [
          rule.class_type_id,rule.instructor_id,startAt,rule.duration_minutes,
          rule.arrival_lead_minutes,rule.location_name,rule.location_address,
          rule.price_cents,rule.capacity,rule.booking_lead_days,rule.equipment,
          rule.suitability,rule.id,date
        ]);
        if (!inserted.rows[0]) { skipped++; continue; }
        await client.query(`INSERT INTO application_audit
          (actor_type,actor_id,action,entity_type,entity_id,request_id,metadata)
          VALUES ('worker',$1,'session.created','session',$2,$3,$4::jsonb)`, [
          rule.id,inserted.rows[0].id,`weekly-schedule-${date}`,
          JSON.stringify({ ruleId: rule.id, localDate: date })
        ]);
        created++;
      }
    }
    await client.query("COMMIT");
    return { created, skipped, locked: true };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function existsForOccurrence(client: PoolClient, rule: Rule, date: string): Promise<boolean> {
  const result = await client.query(`SELECT 1 FROM class_sessions
    WHERE (weekly_rule_id=$1 AND weekly_occurrence_date=$2::date)
      OR (class_type_id=$3 AND (start_at AT TIME ZONE 'Europe/Prague')::date=$2::date)
    LIMIT 1`, [rule.id,date,rule.class_type_id]);
  return Boolean(result.rowCount);
}

export function weeklySchedulePool(databaseUrl: string): Pool {
  return new Pool({ connectionString: databaseUrl, max: 2 });
}
