-- Separate from the notification tables. Client clocks are never used for ordering.
create table public.pz_sync_clock (
 user_id uuid primary key references auth.users(id) on delete cascade,
 revision bigint not null default 0 check (revision >= 0)
);
create table public.pz_sync_entries (
 user_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check (kind in ('ride','draft','break','setting','run','file')),
 id text not null check (length(id) between 1 and 240),
 payload jsonb,
 deleted boolean not null default false,
 revision bigint not null check (revision > 0),
 mutation_id uuid not null,
 changed_at timestamptz not null default now(),
 primary key(user_id,kind,id),
 check (deleted or payload is not null)
);
create index pz_sync_entries_cursor on public.pz_sync_entries(user_id,revision);
create table public.pz_sync_history (
 user_id uuid not null references auth.users(id) on delete cascade,
 kind text not null,
 id text not null,
 revision bigint not null,
 payload jsonb,
 deleted boolean not null,
 changed_at timestamptz not null,
 primary key(user_id,revision)
);
alter table public.pz_sync_clock enable row level security;
alter table public.pz_sync_entries enable row level security;
alter table public.pz_sync_history enable row level security;
create policy sync_clock_owner on public.pz_sync_clock to authenticated
 using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy sync_entries_owner on public.pz_sync_entries to authenticated
 using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy sync_history_owner on public.pz_sync_history to authenticated
 using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
revoke all on public.pz_sync_clock,public.pz_sync_entries,public.pz_sync_history from anon;
grant select,insert,update on public.pz_sync_clock,public.pz_sync_entries to authenticated;
grant select,insert on public.pz_sync_history to authenticated;

create function public.pz_sync_apply(changes jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
 owner_id uuid := auth.uid(); change jsonb; old_row public.pz_sync_entries%rowtype;
 new_row public.pz_sync_entries%rowtype; result jsonb := '[]'; next_revision bigint;
 expected bigint; mutation uuid; k text; item_id text; is_deleted boolean;
begin
 if owner_id is null then raise exception 'Authentication required' using errcode='28000'; end if;
 if jsonb_typeof(changes) is distinct from 'array' or jsonb_array_length(changes)>100
 then raise exception 'Expected at most 100 changes'; end if;
 insert into public.pz_sync_clock(user_id) values(owner_id) on conflict do nothing;
 -- A per-account transaction lock makes cursor order also commit order.
 perform 1 from public.pz_sync_clock where user_id=owner_id for update;
 for change in select value from jsonb_array_elements(changes) loop
  k:=change->>'kind'; item_id:=change->>'id'; expected:=(change->>'expected_revision')::bigint;
  mutation:=(change->>'mutation_id')::uuid; is_deleted:=coalesce((change->>'deleted')::boolean,false);
  if k is null or k not in ('ride','draft','break','setting','run','file') or item_id is null
   or length(item_id) not between 1 and 240 or expected is null or expected<0 or mutation is null
   or (not is_deleted and (change->'payload' is null or change->'payload'='null'::jsonb))
   or pg_column_size(change)>1048576 then raise exception 'Invalid sync change'; end if;
  select * into old_row from public.pz_sync_entries where user_id=owner_id and kind=k and id=item_id;
  if old_row.mutation_id=mutation or
   (old_row.revision is not null and old_row.deleted=is_deleted and
     (is_deleted or old_row.payload=change->'payload')) then
   result:=result||jsonb_build_array(jsonb_build_object('ok',true,'row',to_jsonb(old_row)));
   continue;
  end if;
  if coalesce(old_row.revision,0)<>expected then
   result:=result||jsonb_build_array(jsonb_build_object('ok',false,'row',to_jsonb(old_row), 'kind',k,'id',item_id));
   continue;
  end if;
  if old_row.revision is not null then
   insert into public.pz_sync_history(user_id,kind,id,revision,payload,deleted,changed_at)
    values(owner_id,k,item_id,old_row.revision,old_row.payload,old_row.deleted,old_row.changed_at)
    on conflict do nothing;
  end if;
  update public.pz_sync_clock set revision=revision+1 where user_id=owner_id returning revision into next_revision;
  insert into public.pz_sync_entries(user_id,kind,id,payload,deleted,revision,mutation_id,changed_at)
   values(owner_id,k,item_id,case when is_deleted then null else change->'payload' end,is_deleted,next_revision,mutation,clock_timestamp())
   on conflict(user_id,kind,id) do update set payload=excluded.payload,deleted=excluded.deleted,
    revision=excluded.revision,mutation_id=excluded.mutation_id,changed_at=excluded.changed_at returning * into new_row;
  result:=result||jsonb_build_array(jsonb_build_object('ok',true,'row',to_jsonb(new_row)));
 end loop;
 return result;
end $$;
revoke all on function public.pz_sync_apply(jsonb) from public,anon;
grant execute on function public.pz_sync_apply(jsonb) to authenticated;

-- Immutable, content-addressed attachments; never make customer documents public.
insert into storage.buckets(id,name,public,file_size_limit)
 values('evidence-documents','evidence-documents',false,52428800);
create policy evidence_files_read on storage.objects for select to authenticated
 using(bucket_id='evidence-documents' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy evidence_files_insert on storage.objects for insert to authenticated
 with check(bucket_id='evidence-documents' and (storage.foldername(name))[1]=(select auth.uid())::text);
-- No UPDATE/DELETE policy: immutable blobs also retain documents for revision history.
alter publication supabase_realtime add table public.pz_sync_entries;
