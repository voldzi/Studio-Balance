-- Operational evidence of taught lessons; not payroll or full DPP working time.
-- No inferred/backfilled attendance: each record requires explicit administrator confirmation.
CREATE TABLE instructor_lesson_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL UNIQUE REFERENCES class_sessions(id),
  instructor_id uuid NOT NULL REFERENCES instructors(id),
  instructor_name_snapshot text NOT NULL,
  class_name_snapshot text NOT NULL,
  actual_start_at timestamptz NOT NULL,
  actual_end_at timestamptz NOT NULL,
  reward_cents integer CHECK (reward_cents BETWEEN 0 AND 1000000),
  participants_snapshot integer NOT NULL CHECK (participants_snapshot BETWEEN 0 AND 500),
  attendance_snapshot jsonb NOT NULL CHECK (jsonb_typeof(attendance_snapshot) = 'array'),
  original_snapshot jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  submission_hash text NOT NULL CHECK (submission_hash ~ '^[a-f0-9]{64}$'),
  confirmed_by text NOT NULL,
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (actual_end_at > actual_start_at),
  CHECK (actual_end_at - actual_start_at BETWEEN interval '15 minutes' AND interval '240 minutes'),
  CHECK (date_trunc('minute',actual_start_at)=actual_start_at AND date_trunc('minute',actual_end_at)=actual_end_at)
);

CREATE INDEX instructor_lesson_records_month_idx ON instructor_lesson_records (actual_start_at, instructor_id);
