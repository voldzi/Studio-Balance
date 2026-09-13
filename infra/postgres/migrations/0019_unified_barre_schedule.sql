-- CD-050: one Barre catalogue item. Morning Wednesdays belong to Kača
-- Adamovská and start at 08:00; existing afternoon Barre stays with Nicola.
-- Preserve history and booking identifiers while changing future sessions.
LOCK TABLE class_types, class_sessions, bookings, notification_outbox IN EXCLUSIVE MODE;

UPDATE instructors
SET display_name = 'Kača Adamovská',
    bio = 'Lektorka ranního Barre ve Studio Balance.',
    updated_at = now()
WHERE id = '10000000-0000-4000-8000-000000000005'::uuid;

UPDATE class_types
SET name = 'Barre',
    tagline = 'Síla, stabilita a elegance',
    description = 'Kontrolovaná lekce inspirovaná baletem, pilates a funkčním tréninkem. Posiluje hluboké svaly, stabilitu a držení těla.',
    seo_title = 'Barre | Studio Balance',
    seo_description = 'Barre ve Studio Balance: síla, stabilita, držení těla a kontrolovaný pohyb.',
    active = true,
    updated_at = now()
WHERE slug = 'barre';

DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM class_sessions s
    JOIN class_types ct ON ct.id = s.class_type_id
    WHERE ct.slug = 'barre-strength'
      AND s.status = 'scheduled'
      AND s.start_at > now()
      AND NOT (
        s.instructor_id = '10000000-0000-4000-8000-000000000005'::uuid
        AND extract(isodow FROM s.start_at AT TIME ZONE 'Europe/Prague') = 3
        AND (s.start_at AT TIME ZONE 'Europe/Prague')::time = '08:30'::time
        AND s.end_at = s.start_at + interval '60 minutes'
      )
  ) THEN
    RAISE EXCEPTION 'An unexpected future Barre Strength session requires manual review before CD-050';
  END IF;
END $$;

CREATE TEMP TABLE unified_barre_moves ON COMMIT DROP AS
SELECT s.id,
       s.start_at AS old_start,
       s.end_at AS old_end,
       s.free_cancellation_until AS old_free_cancellation_until,
       s.start_at - interval '30 minutes' AS new_start,
       target.id AS target_class_type_id
FROM class_sessions s
JOIN class_types source ON source.id = s.class_type_id AND source.slug = 'barre-strength'
JOIN class_types target ON target.slug = 'barre'
WHERE s.status = 'scheduled'
  AND s.start_at > now();

DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM unified_barre_moves move
    JOIN class_sessions other ON other.id <> move.id
      AND other.status = 'scheduled'
      AND other.start_at < move.new_start + interval '60 minutes'
      AND other.end_at > move.new_start
      AND (
        other.instructor_id = '10000000-0000-4000-8000-000000000005'::uuid
        OR (other.location_name = 'Studio Balance' AND other.location_address = 'Ruská 10, 792 01 Bruntál')
      )
  ) THEN
    RAISE EXCEPTION 'Unified Barre at 08:00 conflicts with an existing session; review CD-050';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM notification_outbox outbox
    JOIN bookings booking ON booking.id = outbox.booking_id
    JOIN unified_barre_moves move ON move.id = booking.session_id
    WHERE outbox.status = 'processing'
  ) THEN
    RAISE EXCEPTION 'A notification for a changed Barre session is processing; finish delivery before retrying CD-050';
  END IF;
END $$;

UPDATE class_sessions session
SET class_type_id = move.target_class_type_id,
    start_at = move.new_start,
    end_at = move.new_start + interval '60 minutes',
    booking_opens_at = move.new_start - (move.old_start - session.booking_opens_at),
    booking_closes_at = move.new_start - (move.old_start - session.booking_closes_at),
    free_cancellation_until = CASE
      WHEN EXISTS (SELECT 1 FROM bookings booking WHERE booking.session_id = session.id AND booking.status = 'reserved')
      THEN least(move.new_start, greatest(
        move.old_free_cancellation_until,
        (SELECT max(booking.cancellation_cutoff_at) FROM bookings booking WHERE booking.session_id = session.id AND booking.status = 'reserved'),
        move.new_start - interval '24 hours'
      ))
      ELSE move.old_free_cancellation_until
    END,
    equipment = (SELECT default_equipment FROM class_types WHERE id = move.target_class_type_id),
    suitability = concat_ws(' ',
      (SELECT audience FROM class_types WHERE id = move.target_class_type_id),
      (SELECT practical_notice FROM class_types WHERE id = move.target_class_type_id)
    ),
    change_notice = 'Ranní lekce se nově jmenuje Barre a začíná ve středu v 8:00.',
    updated_at = now()
FROM unified_barre_moves move
WHERE session.id = move.id;

UPDATE bookings booking
SET cancellation_cutoff_at = move.new_start - interval '24 hours', updated_at = now()
FROM unified_barre_moves move
WHERE booking.session_id = move.id AND booking.status = 'reserved';

INSERT INTO account_notifications (user_id, booking_id, kind, title, body)
SELECT booking.user_id, booking.id, 'session_changed', 'Ranní Barre nově začíná v 8:00',
  'Lekce ' || to_char(move.old_start AT TIME ZONE 'Europe/Prague', 'DD. MM. YYYY HH24:MI') ||
  ' se nově jmenuje Barre a začíná v ' ||
  to_char(move.new_start AT TIME ZONE 'Europe/Prague', 'DD. MM. YYYY HH24:MI') ||
  '. Rezervace zůstává platná. Bezplatné storno je možné do ' ||
  to_char(session.free_cancellation_until AT TIME ZONE 'Europe/Prague', 'DD. MM. YYYY HH24:MI') || '.'
FROM bookings booking
JOIN unified_barre_moves move ON move.id = booking.session_id
JOIN class_sessions session ON session.id = move.id
WHERE booking.status = 'reserved'
  AND NOT EXISTS (
    SELECT 1 FROM account_notifications existing
    WHERE existing.booking_id = booking.id
      AND existing.kind = 'session_changed'
      AND existing.title = 'Ranní Barre nově začíná v 8:00'
  );

UPDATE notification_outbox outbox
SET status = 'cancelled', updated_at = now()
FROM bookings booking, unified_barre_moves move
WHERE outbox.booking_id = booking.id
  AND booking.session_id = move.id
  AND outbox.kind = 'lesson_reminder'
  AND outbox.status IN ('pending', 'failed');

UPDATE notification_outbox outbox
SET payload = outbox.payload || jsonb_build_object('className', 'Barre', 'startAt', move.new_start),
    updated_at = now()
FROM bookings booking, unified_barre_moves move
WHERE outbox.booking_id = booking.id
  AND booking.session_id = move.id
  AND outbox.kind = 'booking_confirmation'
  AND outbox.status IN ('pending', 'failed');

INSERT INTO notification_outbox (user_id, booking_id, kind, channel, scheduled_at, payload)
SELECT booking.user_id, booking.id, 'session_changed', 'email', now(), jsonb_build_object(
  'className', 'Barre',
  'subject', 'Ranní Barre nově začíná v 8:00',
  'oldStartAt', move.old_start,
  'startAt', move.new_start,
  'arrivalAt', move.new_start - make_interval(mins => session.arrival_lead_minutes),
  'freeCancellationUntil', session.free_cancellation_until,
  'timezone', 'Europe/Prague'
)
FROM bookings booking
JOIN unified_barre_moves move ON move.id = booking.session_id
JOIN class_sessions session ON session.id = move.id
WHERE booking.status = 'reserved'
ON CONFLICT (booking_id, kind, scheduled_at) DO NOTHING;

INSERT INTO notification_outbox (user_id, booking_id, kind, channel, scheduled_at, payload)
SELECT booking.user_id, booking.id, 'lesson_reminder', 'email', move.new_start - reminder.lead_time,
  jsonb_build_object('className', 'Barre', 'startAt', move.new_start, 'subject', reminder.subject, 'timezone', 'Europe/Prague')
FROM bookings booking
JOIN unified_barre_moves move ON move.id = booking.session_id
CROSS JOIN (VALUES
  (interval '24 hours', 'Zítra vás čeká lekce'),
  (interval '2 hours', 'Dnes vás čeká lekce'),
  (interval '30 minutes', 'Za chvíli začínáme')
) reminder(lead_time, subject)
WHERE booking.status = 'reserved' AND move.new_start - reminder.lead_time > now()
ON CONFLICT (booking_id, kind, scheduled_at) DO UPDATE
SET payload = excluded.payload, status = 'pending', updated_at = now()
WHERE notification_outbox.status IN ('pending', 'failed', 'cancelled');

UPDATE booking_idempotency replay
SET response_body = replay.response_body || jsonb_build_object(
  'cancellationCutoffAt', booking.cancellation_cutoff_at,
  'session', (replay.response_body -> 'session') || jsonb_build_object(
    'startAt', session.start_at,
    'endAt', session.end_at,
    'arrivalAt', session.start_at - make_interval(mins => session.arrival_lead_minutes),
    'changeNotice', session.change_notice,
    'classType', jsonb_build_object('name', 'Barre', 'slug', 'barre', 'tagline', 'Síla, stabilita a elegance'),
    'instructor', (replay.response_body -> 'session' -> 'instructor') || jsonb_build_object('displayName', 'Kača Adamovská')
  )
)
FROM bookings booking
JOIN class_sessions session ON session.id = booking.session_id
JOIN unified_barre_moves move ON move.id = session.id
WHERE replay.booking_id = booking.id AND booking.status = 'reserved';

-- Move current catalogue relations to the surviving Barre item without
-- deleting historical sessions or bookings.
INSERT INTO favorite_class_types (user_id, class_type_id, created_at)
SELECT favorite.user_id, target.id, favorite.created_at
FROM favorite_class_types favorite
JOIN class_types source ON source.id = favorite.class_type_id AND source.slug = 'barre-strength'
JOIN class_types target ON target.slug = 'barre'
ON CONFLICT (user_id, class_type_id) DO NOTHING;

DELETE FROM favorite_class_types favorite
USING class_types source
WHERE favorite.class_type_id = source.id AND source.slug = 'barre-strength';

UPDATE reviews review SET class_type_id = target.id, updated_at = now()
FROM class_types source, class_types target
WHERE review.class_type_id = source.id AND source.slug = 'barre-strength' AND target.slug = 'barre';

UPDATE client_transformations transformation SET class_type_id = target.id, updated_at = now()
FROM class_types source, class_types target
WHERE transformation.class_type_id = source.id AND source.slug = 'barre-strength' AND target.slug = 'barre';

INSERT INTO class_type_instructors (class_type_id, instructor_id, schedule_note)
SELECT target.id, assignment.instructor_id,
  CASE assignment.instructor_id
    WHEN '10000000-0000-4000-8000-000000000005'::uuid THEN 'Středa ráno v 8:00'
    WHEN '10000000-0000-4000-8000-000000000001'::uuid THEN 'Odpolední lekce'
    ELSE assignment.schedule_note
  END
FROM class_type_instructors assignment
JOIN class_types source ON source.id = assignment.class_type_id AND source.slug = 'barre-strength'
JOIN class_types target ON target.slug = 'barre'
ON CONFLICT (class_type_id, instructor_id) DO UPDATE SET schedule_note = excluded.schedule_note;

INSERT INTO class_type_instructors (class_type_id, instructor_id, schedule_note)
SELECT target.id, '10000000-0000-4000-8000-000000000001'::uuid, 'Odpolední lekce'
FROM class_types target WHERE target.slug = 'barre'
ON CONFLICT (class_type_id, instructor_id) DO UPDATE SET schedule_note = excluded.schedule_note;

DELETE FROM class_type_instructors assignment
USING class_types source
WHERE assignment.class_type_id = source.id AND source.slug = 'barre-strength';

UPDATE class_types SET active = false, updated_at = now() WHERE slug = 'barre-strength';

INSERT INTO application_audit (actor_type, actor_id, action, entity_type, entity_id, request_id, metadata)
SELECT 'system', 'migration:0019', 'session.updated', 'class_session', move.id::text, 'CD-050',
  jsonb_build_object(
    'oldClassType', 'barre-strength', 'classType', 'barre',
    'oldStartAt', move.old_start, 'startAt', session.start_at,
    'oldEndAt', move.old_end, 'endAt', session.end_at,
    'instructor', 'Kača Adamovská', 'timezone', 'Europe/Prague'
  )
FROM unified_barre_moves move JOIN class_sessions session ON session.id = move.id;

INSERT INTO application_audit (actor_type, actor_id, action, entity_type, entity_id, request_id, metadata)
SELECT 'system', 'migration:0019', 'class_type.merged', 'class_type', source.id::text, 'CD-050',
  jsonb_build_object('sourceSlug', source.slug, 'targetId', target.id, 'targetSlug', target.slug)
FROM class_types source, class_types target
WHERE source.slug = 'barre-strength' AND target.slug = 'barre'
  AND NOT EXISTS (
    SELECT 1 FROM application_audit audit
    WHERE audit.request_id = 'CD-050' AND audit.action = 'class_type.merged'
  );
