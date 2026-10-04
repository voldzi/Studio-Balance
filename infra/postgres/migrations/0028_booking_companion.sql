-- One row remains one seat, one attendance record and one fee snapshot.
ALTER TABLE bookings ADD COLUMN participant_kind text NOT NULL DEFAULT 'self',
  ADD COLUMN participant_name text,
  ADD COLUMN companion_responsibility_accepted_at timestamptz;
ALTER TABLE bookings ADD CONSTRAINT bookings_participant_check CHECK (
  (participant_kind = 'self' AND participant_name IS NULL AND companion_responsibility_accepted_at IS NULL)
  OR (participant_kind = 'companion' AND participant_name IS NOT NULL
      AND length(btrim(participant_name)) BETWEEN 2 AND 200
      AND companion_responsibility_accepted_at IS NOT NULL));
DROP INDEX bookings_one_active_per_user_session_idx;
CREATE UNIQUE INDEX bookings_one_active_participant_per_user_session_idx
  ON bookings(user_id, session_id, participant_kind) WHERE status = 'reserved';
