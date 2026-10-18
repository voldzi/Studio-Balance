-- Durable replay receipts are separate from client booking idempotency.
CREATE TABLE admin_booking_cancellation_receipts (
  actor_id text NOT NULL,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  response_body jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_id,idempotency_key)
);
