-- ============================================================================
-- One-time setup for the order reminder scheduler. Run this ONCE in the
-- Supabase Dashboard SQL editor (or psql) for your HOSTED project.
-- It is intentionally NOT a migration because it embeds project-specific
-- values (project ref) and a secret reference.
-- ============================================================================

-- 1) Extensions (pg_cron scheduler + pg_net HTTP client)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2) Store the service-role key in Vault so it is never hardcoded in cron SQL.
--    Get the key from Dashboard -> Settings -> API -> service_role (secret!).
select vault.create_secret(
  '<PASTE-YOUR-SERVICE-ROLE-KEY-HERE>',
  'service_role_key'
);

-- 3) Schedule the Edge Function invocation every minute.
--    Replace YOUR_PROJECT_REF with your Supabase project ref.
select cron.schedule(
  'send-order-reminders',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://qjganjzwazqmpfjdztom.supabase.co/functions/v1/send-order-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'service_role_key'
      )
    ),
    body := jsonb_build_object('action', 'cron'),
    timeout_milliseconds := 30000
  );
  $$
);

-- ----------------------------------------------------------------------------
-- Useful commands:
--   select * from cron.job;                          -- list scheduled jobs
--   select * from cron.job_run_details order by start_time desc limit 20;
--   select cron.unschedule('send-order-reminders');  -- remove the job
--
-- If you need to replace the stored secret:
--   select vault.update_secret(<secret_uuid>, '<new-key>') where ...
--   (or delete from vault.secret where name = 'service_role_key' and re-create)
-- ----------------------------------------------------------------------------
