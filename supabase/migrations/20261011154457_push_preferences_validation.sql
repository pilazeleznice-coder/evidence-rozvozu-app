create or replace function public.pz_set_push_preferences(settings jsonb, expected_revision bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); current_revision bigint; k text; v integer; clean jsonb:=public.pz_push_defaults();
begin
 if uid is null then raise exception 'Authentication required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
 select revision into current_revision from public.pz_push_preferences where user_id=uid;
 if coalesce(current_revision,0)<>expected_revision then raise exception 'Settings changed on another device' using errcode='40001'; end if;
 if jsonb_typeof(settings)<>'object' then raise exception 'Invalid settings'; end if;
 foreach k in array array['enabled','detail','address','price','payment'] loop
  if jsonb_typeof(settings->k)<>'boolean' then raise exception 'Invalid flag'; end if;
  clean:=jsonb_set(clean,array[k],settings->k);
 end loop;
 if settings->>'noTime'<>'skip' then raise exception 'Rides without time must be skipped'; end if;
 foreach k in array array['day_before','morning','hour_before','late_5','late_10','late_15'] loop
  if jsonb_typeof(settings->k->'enabled')<>'boolean' then raise exception 'Invalid reminder'; end if;
  clean:=jsonb_set(clean,array[k,'enabled'],settings->k->'enabled');
  if k='morning' then
   if coalesce(settings#>>'{morning,time}','')!~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Invalid morning time'; end if;
   clean:=jsonb_set(clean,array[k,'time'],settings#>'{morning,time}');
  else
   if coalesce(settings->k->>'minutes','')!~ '^[0-9]{1,5}$' then raise exception 'Invalid minutes'; end if;
   v:=(settings->k->>'minutes')::integer;
   if v<1 or v>(case when k='day_before' then 10080 when k='hour_before' then 1440 else 1440 end) then raise exception 'Minutes out of range'; end if;
   clean:=jsonb_set(clean,array[k,'minutes'],to_jsonb(v));
  end if;
 end loop;
 insert into public.pz_push_preferences(user_id,settings) values(uid,clean)
 on conflict(user_id) do update set settings=excluded.settings,revision=pz_push_preferences.revision+1,updated_at=now();
 perform public.pz_replan_push(uid);
 return (select jsonb_build_object('settings',p.settings,'revision',p.revision,'updated_at',p.updated_at) from public.pz_push_preferences p where user_id=uid);
end;
$$;
revoke all on function public.pz_set_push_preferences(jsonb,bigint) from public,anon;
grant execute on function public.pz_set_push_preferences(jsonb,bigint) to authenticated;
