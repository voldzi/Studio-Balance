-- ADR 0018: retain historical rule versions; dated availability belongs to sessions.
ALTER TABLE weekly_schedule_rules
  DROP CONSTRAINT weekly_schedule_rules_class_type_id_weekday_key,
  ADD COLUMN generate_until date,
  ADD COLUMN predecessor_id uuid REFERENCES weekly_schedule_rules(id),
  ADD COLUMN booking_paused boolean NOT NULL DEFAULT false,
  ADD COLUMN session_cancelled boolean NOT NULL DEFAULT false;
CREATE INDEX weekly_schedule_rules_validity ON weekly_schedule_rules (generate_from, generate_until);
ALTER TABLE class_sessions ADD COLUMN booking_paused boolean NOT NULL DEFAULT false;
