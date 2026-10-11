create function public.pz_push_defaults() returns jsonb language sql immutable set search_path='' as $$ select '{"enabled":true,"detail":false,"address":false,"price":false,"payment":false,"noTime":"skip","day_before":{"enabled":true,"minutes":1440},"morning":{"enabled":true,"time":"07:00"},"hour_before":{"enabled":true,"minutes":60},"late_5":{"enabled":true,"minutes":5},"late_10":{"enabled":true,"minutes":10},"late_15":{"enabled":true,"minutes":15}}'::jsonb $$;
create table public.pz_push_preferences(user_id uuid primary key references auth.users(id) on delete cascade, settings jsonb not null default public.pz_push_defaults(), revision bigint not null default 1, updated_at timestamptz not null default now());
alter table public.pz_push_preferences enable row level security;
create policy pz_own_preferences on public.pz_push_preferences for select to authenticated using(user_id=(select auth.uid()));
revoke all on public.pz_push_preferences from anon,authenticated;
grant select on public.pz_push_preferences to authenticated;
grant all on public.pz_push_preferences to service_role;
alter table public.pz_push_rides add column payment text not null default '', add column order_no text not null default '';
alter table public.pz_push_subscriptions add column device_name text not null default 'Zařízení';
create function public.pz_push_schedule(delivery timestamptz, prefs jsonb)
returns table(kind text,due_at timestamptz) language sql stable set search_path='' as $$
 select kind,due_at from (values
 ('day_before',delivery-make_interval(mins=>(prefs#>>'{day_before,minutes}')::integer)),
 ('morning',(((delivery at time zone 'Europe/Prague')::date+(prefs#>>'{morning,time}')::time) at time zone 'Europe/Prague')),
 ('hour_before',delivery-make_interval(mins=>(prefs#>>'{hour_before,minutes}')::integer)),
 ('late_5',delivery+make_interval(mins=>(prefs#>>'{late_5,minutes}')::integer)),
 ('late_10',delivery+make_interval(mins=>(prefs#>>'{late_10,minutes}')::integer)),
 ('late_15',delivery+make_interval(mins=>(prefs#>>'{late_15,minutes}')::integer))
 ) s(kind,due_at) where delivery is not null and (prefs->>'enabled')::boolean and (prefs->kind->>'enabled')::boolean and (kind<>'morning' or due_at<=delivery);
$$;
create function public.pz_replan_push(uid uuid) returns void language plpgsql set search_path='' as $$
declare prefs jsonb;
begin
 select settings into prefs from public.pz_push_preferences where user_id=uid;
 prefs:=coalesce(prefs,public.pz_push_defaults());
 delete from public.pz_push_jobs j using public.pz_push_rides r
 where j.user_id=uid and r.user_id=j.user_id and r.ride_id=j.ride_id and j.kind<>'test' and j.state in ('pending','sending')
 and (not r.enabled or not exists(select 1 from public.pz_push_schedule(r.delivery_at,prefs) s where s.kind=j.kind and s.due_at=j.due_at));
 insert into public.pz_push_jobs(user_id,ride_id,subscription_id,kind,due_at)
 select uid,r.ride_id,sub.id,s.kind,s.due_at from public.pz_push_rides r
 join public.pz_push_subscriptions sub on sub.user_id=r.user_id
 cross join lateral public.pz_push_schedule(r.delivery_at,prefs) s
 where r.user_id=uid and r.enabled and s.due_at>now()
 on conflict(subscription_id,ride_id,kind,due_at) do nothing;
end;
$$;
revoke all on function public.pz_replan_push(uuid) from public,anon,authenticated;
create function public.pz_set_push_preferences(settings jsonb, expected_revision bigint) returns jsonb
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
   if coalesce(settings->k->>'minutes','')!~ '^[0-9](1, 5)$' then raise exception 'Invalid minutes'; end if;
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
create or replace function public.pz_sync_push(changes jsonb, removed text[] default '{}')
returns integer language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); item jsonb; dt timestamptz; n integer;
begin
 if uid is null then raise exception 'Authentication required'; end if;
 -- Serialize writes from multiple devices of the same account.
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
 if jsonb_typeof(changes)<>'array' or jsonb_array_length(changes)>5000 or cardinality(removed)>5000 then raise exception 'Invalid changes'; end if;
 update public.pz_push_rides set enabled=false,updated_at=now() where user_id=uid and ride_id=any(removed);
 for item in select value from jsonb_array_elements(changes) loop
  if coalesce(length(item->>'id'),0) not between 1 and 100 then raise exception 'Invalid ride ID'; end if;
  dt:=null;
  if coalesce((item->>'enabled')::boolean,false) then
   if (item->>'date') !~ '^\d{4}-\d{2}-\d{2}$' or (item->>'time') !~ '^([01]\d|2[0-3]):[0-5]\d$' then raise exception 'Invalid date/time'; end if;
   dt:=((item->>'date')::date+(item->>'time')::time) at time zone 'Europe/Prague';
  end if;
  insert into public.pz_push_rides(user_id,ride_id,name,vehicle,address,net,delivery_at,enabled,payment,order_no)
  values(uid,item->>'id',left(coalesce(item->>'name',''),200),left(coalesce(item->>'vehicle',''),20),left(coalesce(item->>'address',''),500),coalesce((item->>'net')::numeric,0),dt,coalesce((item->>'enabled')::boolean,false),left(coalesce(item->>'payment',''),100),left(coalesce(item->>'orderNo',''),100))
  on conflict(user_id,ride_id) do update set name=excluded.name,vehicle=excluded.vehicle,address=excluded.address,net=excluded.net,delivery_at=excluded.delivery_at,enabled=excluded.enabled,payment=excluded.payment,order_no=excluded.order_no,updated_at=now();
 end loop;
 perform public.pz_replan_push(uid);
 select count(*) into n from public.pz_push_rides where user_id=uid and enabled and delivery_at>now()-interval '15 minutes';
 return n;
end;
$$;
revoke all on function public.pz_sync_push(jsonb,text[]) from public, anon;
grant execute on function public.pz_sync_push(jsonb,text[]) to authenticated;

drop function public.pz_claim_push();
create function public.pz_claim_push()
returns table(job_id bigint,subscription_id uuid,subscription jsonb,kind text,due_at timestamptz,ride_id text,name text,vehicle text,address text,net numeric,delivery_at timestamptz,payment text,order_no text,preferences jsonb)
language plpgsql security definer set search_path='' as $$
begin
 update public.pz_push_jobs j set state='expired' where j.state in ('pending','sending') and j.due_at<now()-interval '5 minutes';
 return query with picked as (
  select j.id from public.pz_push_jobs j join public.pz_push_rides r on r.user_id=j.user_id and r.ride_id=j.ride_id
  where (j.kind='test' or (r.enabled and coalesce((select (p.settings->>'enabled')::boolean from public.pz_push_preferences p where p.user_id=j.user_id),true))) and j.due_at<=now() and j.due_at>=now()-interval '5 minutes' and j.attempts<3
  and (j.state='pending' or (j.state='sending' and j.lease_until<now()))
  order by j.due_at limit 50 for update of j skip locked
 ), leased as (
  update public.pz_push_jobs j set state='sending',attempts=j.attempts+1,lease_until=now()+interval '2 minutes'
  from picked where j.id=picked.id returning j.*
 ) select j.id,j.subscription_id,s.subscription,j.kind,j.due_at,j.ride_id,r.name,r.vehicle,r.address,r.net,r.delivery_at,r.payment,r.order_no,coalesce((select p.settings from public.pz_push_preferences p where p.user_id=j.user_id),public.pz_push_defaults())
 from leased j join public.pz_push_rides r on r.user_id=j.user_id and r.ride_id=j.ride_id
 join public.pz_push_subscriptions s on s.id=j.subscription_id;
end;
$$;
revoke all on function public.pz_claim_push() from public, anon, authenticated;
grant execute on function public.pz_claim_push() to service_role;

create function public.pz_test_push(device uuid) returns bigint language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); sid uuid; jid bigint;
begin
 if uid is null then raise exception 'Authentication required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
 select id into sid from public.pz_push_subscriptions where user_id=uid and device_id=device;
 if sid is null then raise exception 'Device not registered'; end if;
 if exists(select 1 from public.pz_push_jobs where user_id=uid and kind='test' and due_at>now()-interval '1 minute') then raise exception 'Wait one minute before next test'; end if;
 insert into public.pz_push_rides(user_id,ride_id,name,vehicle,address,net,enabled) values(uid,'__push_test__','','','',0,false) on conflict do nothing;
 insert into public.pz_push_jobs(user_id,ride_id,subscription_id,kind,due_at) values(uid,'__push_test__',sid,'test',now()) returning id into jid;
 return jid;
end;
$$;
revoke all on function public.pz_test_push(uuid) from public,anon;
grant execute on function public.pz_test_push(uuid) to authenticated;
