-- Run AFTER deployment. Replace placeholders only in the private Supabase SQL editor.
-- Secrets stay in private Vault; they must never be committed to GitHub.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
select vault.create_secret('https://PROJECT_REF.supabase.co', 'pz_push_project_url');
select vault.create_secret('REPLACE_WITH_RANDOM_CRON_SECRET', 'pz_push_cron_secret');
select vault.create_secret('REPLACE_WITH_PUBLIC_VAPID_KEY', 'pz_push_vapid_public');
select vault.create_secret('REPLACE_WITH_PRIVATE_VAPID_KEY', 'pz_push_vapid_private');
select vault.create_secret('mailto:YOUR_CONTACT_EMAIL', 'pz_push_vapid_subject');
select vault.create_secret('https://YOUR_APP_URL/', 'pz_push_app_url');

create or replace function public.pz_push_runtime_config() returns jsonb
language sql security definer set search_path='' as $$
 select jsonb_object_agg(name,decrypted_secret) from vault.decrypted_secrets
 where name in ('pz_push_cron_secret','pz_push_vapid_public','pz_push_vapid_private','pz_push_vapid_subject','pz_push_app_url');
$$;
revoke all on function public.pz_push_runtime_config() from public;
grant execute on function public.pz_push_runtime_config() to service_role;

select cron.schedule('pz-push-every-minute', '* * * * *', $job$
 select net.http_post(
  url := (select decrypted_secret from vault.decrypted_secrets where name='pz_push_project_url') || '/functions/v1/push-dispatch',
  headers := jsonb_build_object('Content-Type','application/json','x-pz-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='pz_push_cron_secret')),
  body := '{}'::jsonb,
  timeout_milliseconds := 60000
 );
$job$);
-- Sent history is retained. No automatic deletion of rides or sent reminders.
