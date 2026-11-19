begin;
create table public.finance_analyst_workpapers (
 id uuid primary key, owner_id uuid not null references auth.users(id),
 kind text not null check(kind in ('adjustment','scenario','review')),
 name text not null check(length(trim(name)) between 1 and 150),
 scope jsonb not null check(jsonb_typeof(scope)='object'), payload jsonb not null check(jsonb_typeof(payload)='object'),
 revision integer not null default 1, archived boolean not null default false,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index analyst_workpapers_owner on finance_analyst_workpapers(owner_id,updated_at);
create table public.finance_analyst_history (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null,record_id uuid not null,
 revision integer not null,before_value jsonb,after_value jsonb not null,recorded_at timestamptz not null default now(),unique(record_id,revision)
);
alter table finance_analyst_workpapers enable row level security;
alter table finance_analyst_history enable row level security;
revoke all on finance_analyst_workpapers,finance_analyst_history from public,anon,authenticated;
grant select on finance_analyst_workpapers,finance_analyst_history to authenticated;
grant all on finance_analyst_workpapers,finance_analyst_history to service_role;
create policy analyst_workpapers_own on finance_analyst_workpapers for select to authenticated using(owner_id=auth.uid());
create policy analyst_history_own on finance_analyst_history for select to authenticated using(owner_id=auth.uid());
create function finance_analyst_audit() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$begin
 insert into finance_analyst_history(owner_id,record_id,revision,before_value,after_value) values(new.owner_id,new.id,new.revision,case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));return new;
end;$$;
create trigger analyst_audit after insert or update on finance_analyst_workpapers for each row execute function finance_analyst_audit();
create function finance_save_analyst_workpaper(_id uuid,_expected integer,_kind text,_name text,_scope jsonb,_payload jsonb,_archived boolean default false)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=auth.uid(); old finance_analyst_workpapers; k text; v numeric; item jsonb;begin
 if u is null then raise exception 'Sign in first';end if;
 if _id is null or _expected is null or _expected<0 or _kind is null or _name is null or _archived is null or jsonb_typeof(_scope) is distinct from 'object' or jsonb_typeof(_payload) is distinct from 'object' or octet_length(_payload::text)>1500000 or octet_length(_scope::text)>10000 then raise exception 'Check the analysis fields';end if;
 if coalesce(_scope->>'view','') not in ('mine','partner','household') or coalesce(_scope->>'basis','') not in ('recorded','comparable') or coalesce(_scope->>'currency','') !~ '^[A-Z]{3}$' or coalesce(_scope->>'start','') !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$' or coalesce(_scope->>'end','') !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$' or (_scope->>'start')::date>(_scope->>'end')::date then raise exception 'Choose valid analysis dates and scope';end if;
 perform pg_advisory_xact_lock(hashtextextended('analyst:'||u::text,0));
 select * into old from finance_analyst_workpapers where id=_id for update;
 if found and old.owner_id<>u then raise exception 'Analysis unavailable';end if;
 if old.id is null and _expected<>0 then raise exception 'Reload before saving';end if;
 if old.id is not null and old.kind<>_kind then raise exception 'Keep the saved analysis type';end if;
 if _kind='adjustment' then
  if coalesce(length(trim(_payload->>'reason')),0) not between 1 and 2000 or jsonb_typeof(_payload->'sourceIds') is distinct from 'array' or jsonb_array_length(_payload->'sourceIds')>50 then raise exception 'Add a rationale and up to 50 source IDs';end if;
  foreach k in array array['income','expense'] loop
   if jsonb_typeof(_payload->k) is distinct from 'number' or abs((_payload->>k)::numeric)>100000000 then raise exception 'Invalid adjustment amount';end if;
  end loop;
  if (_payload->>'income')::numeric=0 and (_payload->>'expense')::numeric=0 then raise exception 'Enter an adjustment amount';end if;
  for item in select value from jsonb_array_elements(_payload->'sourceIds') loop
   if not exists(select 1 from transactions where id=(item#>>'{}')::uuid and user_id=u) and not (coalesce(old.payload->'sourceIds','[]') @> jsonb_build_array(item)) then raise exception 'Choose your own source transactions';end if;
  end loop;
 end if;
 if _kind='scenario' and (jsonb_typeof(_payload->'assumptions') is distinct from 'object' or jsonb_typeof(_payload->'results') is distinct from 'array') then raise exception 'Save assumptions and the calculated forecast together';end if;
 if _kind='review' and (jsonb_typeof(_payload->'summary') is distinct from 'object' or coalesce(_payload->>'version','')='') then raise exception 'Save a complete review snapshot';end if;
 if old.id is not null and (old.name,old.scope,old.payload,old.archived) is not distinct from (trim(_name),_scope,_payload,_archived) then return old.id;end if;
 if old.id is not null and old.revision<>_expected then raise exception 'This analysis changed. Refresh before saving';end if;
 if old.kind='review' and (old.name,old.scope,old.payload) is distinct from (trim(_name),_scope,_payload) then raise exception 'Saved reviews are held. Save a new edition';end if;
 if old.id is null then insert into finance_analyst_workpapers(id,owner_id,kind,name,scope,payload,archived) values(_id,u,_kind,trim(_name),_scope,_payload,_archived);
 else update finance_analyst_workpapers set name=trim(_name),scope=_scope,payload=_payload,archived=_archived,revision=revision+1,updated_at=clock_timestamp() where id=_id;end if;
 return _id;
end;$$;
revoke all on function finance_analyst_audit(),finance_save_analyst_workpaper(uuid,integer,text,text,jsonb,jsonb,boolean) from public,anon,authenticated;
grant execute on function finance_save_analyst_workpaper(uuid,integer,text,text,jsonb,jsonb,boolean) to authenticated;
comment on table finance_analyst_workpapers is 'Private analyst overlays, scenario snapshots and held reviews; never ledger posts or accounting closes. Revisions survive module switches and archive. Existing public-table backups include these tables.';
commit;
