
-- Enable scheduler + http extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Unschedule any prior version (idempotent)
DO $$
BEGIN
  PERFORM cron.unschedule('kora-chronos-tick');
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

-- Tick the Chronos daemon every minute on the stable preview URL.
SELECT cron.schedule(
  'kora-chronos-tick',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--213552f7-0eca-4d56-a4b0-22a8e20d46a4.lovable.app/api/public/cron/chronos',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF6bXdwdW13eWVxeGt6Znl6dmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNzcwMDUsImV4cCI6MjA5NDk1MzAwNX0.L2IPw1nyquF_3fiUlCUp-Aqu4q-M1uTJ54qDPb0lVaY'
    ),
    body := jsonb_build_object('source','pg_cron','t', now())
  );
  $$
);
