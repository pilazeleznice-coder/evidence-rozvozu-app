-- Runtime schema was applied as push_runtime. Safe to replay on this project.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create or replace function public.pz_push_runtime_config() returns jsonb
language sql security definer set search_path='' as $$
 select jsonb_object_agg(name,decrypted_secret) from vault.decrypted_secrets
 where name in ('pz_push_cron_secret','pz_push_vapid_public','pz_push_vapid_private','pz_push_vapid_subject','pz_push_app_url');
$$;
revoke all on function public.pz_push_runtime_config() from public,anon,authenticated;
grant execute on function public.pz_push_runtime_config() to service_role;
