-- The sync preference record is the single source for native and Web Push reminders.
create function public.pz_sync_reminder_preferences() returns trigger
language plpgsql security invoker set search_path='' as $$
declare expected bigint;
begin
 if new.user_id is distinct from auth.uid() then raise exception 'Owner mismatch'; end if;
 if new.kind='setting' and new.id='reminders' and not new.deleted then
  select revision into expected from public.pz_push_preferences where user_id=new.user_id;
  perform public.pz_set_push_preferences(new.payload,coalesce(expected,0));
 end if;
 return new;
end $$;
revoke all on function public.pz_sync_reminder_preferences() from public,anon;
create trigger pz_sync_reminder_preferences after insert or update on public.pz_sync_entries
 for each row when (new.kind='setting' and new.id='reminders' and not new.deleted)
 execute function public.pz_sync_reminder_preferences();
