CREATE TABLE notification_deliveries (
 notification_id uuid NOT NULL REFERENCES notifications ON DELETE CASCADE,
 channel text NOT NULL CHECK(channel IN ('email','sms')),
 attempts smallint NOT NULL DEFAULT 0,
 retry_at timestamptz NOT NULL DEFAULT now(),
 sent_at timestamptz,
 PRIMARY KEY(notification_id,channel)
);
CREATE INDEX notification_delivery_queue ON notification_deliveries(retry_at) WHERE sent_at IS NULL AND attempts<6;
