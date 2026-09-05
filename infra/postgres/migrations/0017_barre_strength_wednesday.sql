-- CD-044, effective 2026-09-09 at 08:30 Europe/Prague.
-- The migration runner wraps this in a transaction. Serialize against booking,
-- cancellation and schedule writes; abort rather than merge conflicting slots.
LOCK TABLE class_sessions, bookings, notification_outbox IN EXCLUSIVE MODE;

CREATE TEMP TABLE barre_moves ON COMMIT DROP AS
SELECT s.*, ((s.start_at AT TIME ZONE 'Europe/Prague') - interval '1 day')
  AT TIME ZONE 'Europe/Prague' AS new_start
FROM class_sessions s JOIN class_types ct ON ct.id=s.class_type_id
WHERE ct.slug='barre-strength' AND s.status='scheduled'
  AND s.instructor_id='10000000-0000-4000-8000-000000000005'::uuid
  AND s.change_notice IS NULL
  AND s.end_at=s.start_at + interval '60 minutes'
  AND extract(isodow FROM s.start_at AT TIME ZONE 'Europe/Prague')=4
  AND (s.start_at AT TIME ZONE 'Europe/Prague')::time='08:30'::time
  AND s.start_at >= '2026-09-10 08:30 Europe/Prague'::timestamptz
  AND ((s.start_at AT TIME ZONE 'Europe/Prague') - interval '1 day') AT TIME ZONE 'Europe/Prague' > now();

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM barre_moves m JOIN class_sessions other ON other.id<>m.id
    AND other.status='scheduled' AND other.start_at < m.new_start + interval '60 minutes'
    AND other.end_at > m.new_start
    AND (other.instructor_id=m.instructor_id OR
      (other.location_name=m.location_name AND other.location_address=m.location_address))) THEN
    RAISE EXCEPTION 'Barre Wednesday conflicts with an existing session; review the schedule before applying CD-044';
  END IF;
  IF EXISTS (SELECT 1 FROM notification_outbox n JOIN bookings b ON b.id=n.booking_id
    JOIN barre_moves m ON m.id=b.session_id WHERE n.status='processing') THEN
    RAISE EXCEPTION 'A notification for a moved Barre session is processing; finish delivery before retrying';
  END IF;
END $$;

UPDATE class_sessions s SET start_at=m.new_start, end_at=m.new_start + interval '60 minutes',
  booking_opens_at=m.new_start - (m.start_at-m.booking_opens_at),
  booking_closes_at=m.new_start - (m.start_at-m.booking_closes_at),
  free_cancellation_until=CASE WHEN EXISTS (SELECT 1 FROM bookings b WHERE b.session_id=s.id AND b.status='reserved')
    THEN least(m.new_start, greatest(m.free_cancellation_until,
      (SELECT max(b.cancellation_cutoff_at) FROM bookings b WHERE b.session_id=s.id AND b.status='reserved'),
      m.new_start - interval '24 hours')) ELSE m.free_cancellation_until END,
  change_notice='Barre Strength se od 9. 9. 2026 přesouvá ze čtvrtka na středu, čas 8:30–9:30 zůstává.',
  updated_at=now()
FROM barre_moves m WHERE s.id=m.id;

INSERT INTO application_audit (actor_type,actor_id,action,entity_type,entity_id,request_id,metadata)
SELECT 'system','migration:0017','session.rescheduled','class_session',m.id::text,'CD-044',
  jsonb_build_object('oldStartAt',m.start_at,'newStartAt',s.start_at,'oldEndAt',m.end_at,
    'newEndAt',s.end_at,'oldFreeCancellationUntil',m.free_cancellation_until,
    'freeCancellationUntil',s.free_cancellation_until,'timezone','Europe/Prague')
FROM barre_moves m JOIN class_sessions s ON s.id=m.id;

UPDATE bookings b SET cancellation_cutoff_at=m.new_start - interval '24 hours',updated_at=now()
FROM barre_moves m WHERE b.session_id=m.id AND b.status='reserved';

INSERT INTO account_notifications (user_id,booking_id,kind,title,body)
SELECT b.user_id,b.id,'session_changed','Barre Strength se přesouvá na středu',
  'Původní termín ' || to_char(m.start_at AT TIME ZONE 'Europe/Prague','DD. MM. YYYY HH24:MI') ||
  ' se mění na ' || to_char(m.new_start AT TIME ZONE 'Europe/Prague','DD. MM. YYYY HH24:MI') ||
  '. Rezervace zůstává platná. Bezplatné storno je možné do ' ||
  to_char(s.free_cancellation_until AT TIME ZONE 'Europe/Prague','DD. MM. YYYY HH24:MI') || '.'
FROM bookings b JOIN barre_moves m ON m.id=b.session_id JOIN class_sessions s ON s.id=m.id
WHERE b.status='reserved';

UPDATE notification_outbox n SET status='cancelled',updated_at=now()
FROM bookings b,barre_moves m WHERE n.booking_id=b.id AND b.session_id=m.id
  AND n.kind='lesson_reminder' AND n.status IN ('pending','failed');

UPDATE notification_outbox n SET payload=jsonb_set(n.payload,'{startAt}',to_jsonb(m.new_start)),updated_at=now()
FROM bookings b,barre_moves m WHERE n.booking_id=b.id AND b.session_id=m.id
  AND b.status='reserved' AND n.kind='booking_confirmation' AND n.status IN ('pending','failed');

INSERT INTO notification_outbox (user_id,booking_id,kind,channel,scheduled_at,payload)
SELECT b.user_id,b.id,'session_changed','email',now(),jsonb_build_object(
  'className','Barre Strength','subject','Barre Strength se přesouvá na středu',
  'oldStartAt',m.start_at,'startAt',s.start_at,'arrivalAt',s.start_at-make_interval(mins=>s.arrival_lead_minutes),
  'freeCancellationUntil',s.free_cancellation_until,'timezone','Europe/Prague')
FROM bookings b JOIN barre_moves m ON m.id=b.session_id JOIN class_sessions s ON s.id=m.id
WHERE b.status='reserved'
ON CONFLICT (booking_id,kind,scheduled_at) DO NOTHING;

INSERT INTO notification_outbox (user_id,booking_id,kind,channel,scheduled_at,payload)
SELECT b.user_id,b.id,'lesson_reminder','email',m.new_start-reminder.lead_time,
  jsonb_build_object('className','Barre Strength','startAt',m.new_start,'subject',reminder.subject,'timezone','Europe/Prague')
FROM bookings b JOIN barre_moves m ON m.id=b.session_id
CROSS JOIN (VALUES (interval '24 hours','Zítra vás čeká lekce'),
  (interval '2 hours','Dnes vás čeká lekce'),(interval '30 minutes','Za chvíli začínáme')) reminder(lead_time,subject)
WHERE b.status='reserved' AND m.new_start-reminder.lead_time > now()
ON CONFLICT (booking_id,kind,scheduled_at) DO UPDATE SET payload=excluded.payload,status='pending',updated_at=now()
WHERE notification_outbox.status IN ('pending','failed','cancelled');

-- Replayed booking requests must not redisplay the superseded Thursday time.
UPDATE booking_idempotency replay SET response_body = replay.response_body || jsonb_build_object(
  'cancellationCutoffAt',b.cancellation_cutoff_at,
  'session',(replay.response_body->'session') || jsonb_build_object('startAt',s.start_at,'endAt',s.end_at,
    'arrivalAt',s.start_at-make_interval(mins=>s.arrival_lead_minutes),'changeNotice',s.change_notice))
FROM bookings b,class_sessions s,barre_moves m
WHERE replay.booking_id=b.id AND b.session_id=s.id AND s.id=m.id AND b.status='reserved';

-- Publish only the confirmed Barre slot inside the existing 30-day horizon.
-- Preserve cancelled Wednesdays and any individually changed Thursday in that
-- week. This is a bounded publication, not a new recurrence engine.
CREATE TEMP TABLE barre_new_slots ON COMMIT DROP AS
SELECT ct.*, ((day_value::date + time '08:30') AT TIME ZONE 'Europe/Prague') AS new_start
FROM class_types ct CROSS JOIN generate_series(
  greatest(date '2026-09-09',(now() AT TIME ZONE 'Europe/Prague')::date),
  (now() AT TIME ZONE 'Europe/Prague')::date + 30,interval '1 day') day_value
WHERE ct.slug='barre-strength' AND ct.active=true AND extract(isodow FROM day_value)=3
  AND ((day_value::date + time '08:30') AT TIME ZONE 'Europe/Prague') > now()
  AND NOT EXISTS (SELECT 1 FROM class_sessions s WHERE s.class_type_id=ct.id AND
    ((s.start_at AT TIME ZONE 'Europe/Prague')::date=day_value::date OR
     (s.start_at AT TIME ZONE 'Europe/Prague')::date=day_value::date+1));

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM barre_new_slots slot JOIN class_sessions s ON s.status='scheduled'
    AND s.start_at<slot.new_start+interval '60 minutes' AND s.end_at>slot.new_start
    AND (s.instructor_id='10000000-0000-4000-8000-000000000005'::uuid OR
      (s.location_name='Studio Balance' AND s.location_address='Ruská 10, 792 01 Bruntál'))) THEN
    RAISE EXCEPTION 'New Barre Wednesday conflicts with an existing session; review CD-044 before retrying';
  END IF;
END $$;

WITH created AS (
  INSERT INTO class_sessions (class_type_id,instructor_id,start_at,end_at,arrival_lead_minutes,
    location_name,location_address,price_cents,capacity,booking_opens_at,booking_closes_at,equipment,suitability)
  SELECT id,'10000000-0000-4000-8000-000000000005'::uuid,new_start,new_start+interval '60 minutes',arrival_lead_minutes,
    'Studio Balance','Ruská 10, 792 01 Bruntál',25000,10,new_start-interval '30 days',new_start-interval '30 minutes',
    default_equipment,concat_ws(' ',audience,practical_notice) FROM barre_new_slots RETURNING id,start_at
)
INSERT INTO application_audit (actor_type,actor_id,action,entity_type,entity_id,request_id,metadata)
SELECT 'system','migration:0017','session.created','class_session',id::text,'CD-044',
  jsonb_build_object('startAt',start_at,'timezone','Europe/Prague') FROM created;
