-- Private per-account reminder data; no customer data is published with the app.
create table public.pz_push_rides (
 user_id uuid not null references auth.users(id) on delete cascade,
 ride_id text not null, name text not null, vehicle text not null, address text not null,
 net numeric not null, delivery_at timestamptz, enabled boolean not null default false,
 updated_at timestamptz not null default now(), primary key(user_id,ride_id)
);
create table public.pz_push_subscriptions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 device_id uuid not null, subscription jsonb not null, updated_at timestamptz not null default now(),
 unique(user_id,device_id)
);
create table public.pz_push_jobs (
 id bigint generated always as identity primary key,
 user_id uuid not null, ride_id text not null,
 subscription_id uuid not null references public.pz_push_subscriptions(id) on delete cascade,
 kind text not null, due_at timestamptz not null,
 state text not null default 'pending' check(state in ('pending','sending','sent','expired','failed')),
 attempts integer not null default 0, lease_until timestamptz, sent_at timestamptz, last_error text,
 foreign key(user_id,ride_id) references public.pz_push_rides(user_id,ride_id) on delete cascade,
 unique(subscription_id,ride_id,kind,due_at)
);
create index pz_push_ride_jobs_idx on public.pz_push_jobs(user_id,ride_id);
create index pz_push_due_idx on public.pz_push_jobs(due_at) where state in ('pending','sending');
alter table public.pz_push_rides enable row level security;
alter table public.pz_push_subscriptions enable row level security;
alter table public.pz_push_jobs enable row level security;
create policy pz_read_rides on public.pz_push_rides for select to authenticated using(user_id=(select auth.uid()));
create policy pz_own_subscriptions on public.pz_push_subscriptions for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy pz_read_jobs on public.pz_push_jobs for select to authenticated using(user_id=(select auth.uid()));
revoke all on public.pz_push_rides, public.pz_push_subscriptions, public.pz_push_jobs from anon, authenticated;
grant select on public.pz_push_rides, public.pz_push_jobs to authenticated;
grant select,insert,update,delete on public.pz_push_subscriptions to authenticated;
grant all on public.pz_push_rides, public.pz_push_subscriptions, public.pz_push_jobs to service_role;
grant usage,select on sequence public.pz_push_jobs_id_seq to service_role;

-- All times are computed in the database in Europe/Prague, independent of device timezone.
create function public.pz_push_schedule(delivery timestamptz)
returns table(kind text,due_at timestamptz) language sql stable set search_path='' as $$
 select kind,due_at from (values
 ('day_before',delivery-interval '24 hours'),
 ('morning',(((delivery at time zone 'Europe/Prague')::date+time '07:00') at time zone 'Europe/Prague')),
 ('hour_before',delivery-interval '1 hour'),
 ('late_5',delivery+interval '5 minutes'),
 ('late_10',delivery+interval '10 minutes'),
 ('late_15',delivery+interval '15 minutes')
 ) s(kind,due_at) where kind<>'morning' or due_at<=delivery;
$$;

create function public.pz_sync_push(changes jsonb, removed text[] default '{}')
returns integer language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); item jsonb; dt timestamptz; n integer;
begin
 if uid is null then raise exception 'Authentication required'; end if;
 -- Serialize writes from multiple devices of the same account.
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
 if jsonb_typeof(changes)<>'array' or jsonb_array_length(changes)>5000 or cardinality(removed)>5000 then raise exception 'Invalid changes'; end if;
 delete from public.pz_push_rides where user_id=uid and ride_id=any(removed);
 for item in select value from jsonb_array_elements(changes) loop
  if coalesce(length(item->>'id'),0) not between 1 and 100 then raise exception 'Invalid ride ID'; end if;
  dt:=null;
  if coalesce((item->>'enabled')::boolean,false) then
   if (item->>'date') !~ '^\d{4}-\d{2}-\d{2}$' or (item->>'time') !~ '^([01]\d|2[0-3]):[0-5]\d$' then raise exception 'Invalid date/time'; end if;
   dt:=((item->>'date')::date+(item->>'time')::time) at time zone 'Europe/Prague';
  end if;
  insert into public.pz_push_rides(user_id,ride_id,name,vehicle,address,net,delivery_at,enabled)
  values(uid,item->>'id',left(coalesce(item->>'name',''),200),left(coalesce(item->>'vehicle',''),20),left(coalesce(item->>'address',''),500),coalesce((item->>'net')::numeric,0),dt,coalesce((item->>'enabled')::boolean,false))
  on conflict(user_id,ride_id) do update set name=excluded.name,vehicle=excluded.vehicle,address=excluded.address,net=excluded.net,delivery_at=excluded.delivery_at,enabled=excluded.enabled,updated_at=now();
 end loop;
 -- Remove obsolete schedules immediately; keep sent jobs to prevent duplicates.
 delete from public.pz_push_jobs j using public.pz_push_rides r
 where j.user_id=uid and r.user_id=j.user_id and r.ride_id=j.ride_id and j.state in ('pending','sending')
 and (not r.enabled or not exists(select 1 from public.pz_push_schedule(r.delivery_at) s where s.kind=j.kind and s.due_at=j.due_at));
 insert into public.pz_push_jobs(user_id,ride_id,subscription_id,kind,due_at)
 select uid,r.ride_id,sub.id,s.kind,s.due_at from public.pz_push_rides r
 join public.pz_push_subscriptions sub on sub.user_id=r.user_id
 cross join lateral public.pz_push_schedule(r.delivery_at) s
 where r.user_id=uid and r.enabled and s.due_at>now()
 on conflict(subscription_id,ride_id,kind,due_at) do nothing;
 select count(*) into n from public.pz_push_rides where user_id=uid and enabled and delivery_at>now()-interval '15 minutes';
 return n;
end;
$$;
revoke all on function public.pz_sync_push(jsonb,text[]) from public;
grant execute on function public.pz_sync_push(jsonb,text[]) to authenticated;

create function public.pz_claim_push()
returns table(job_id bigint,subscription_id uuid,subscription jsonb,kind text,due_at timestamptz,ride_id text,name text,vehicle text,address text,net numeric,delivery_at timestamptz)
language plpgsql security definer set search_path='' as $$
begin
 update public.pz_push_jobs j set state='expired' where j.state in ('pending','sending') and j.due_at<now()-interval '5 minutes';
 return query with picked as (
  select j.id from public.pz_push_jobs j join public.pz_push_rides r on r.user_id=j.user_id and r.ride_id=j.ride_id
  where r.enabled and j.due_at<=now() and j.due_at>=now()-interval '5 minutes' and j.attempts<3
  and (j.state='pending' or (j.state='sending' and j.lease_until<now()))
  order by j.due_at limit 50 for update of j skip locked
 ), leased as (
  update public.pz_push_jobs j set state='sending',attempts=j.attempts+1,lease_until=now()+interval '2 minutes'
  from picked where j.id=picked.id returning j.*
 ) select j.id,j.subscription_id,s.subscription,j.kind,j.due_at,j.ride_id,r.name,r.vehicle,r.address,r.net,r.delivery_at
 from leased j join public.pz_push_rides r on r.user_id=j.user_id and r.ride_id=j.ride_id
 join public.pz_push_subscriptions s on s.id=j.subscription_id;
end;
$$;
revoke all on function public.pz_claim_push() from public;
grant execute on function public.pz_claim_push() to service_role;
