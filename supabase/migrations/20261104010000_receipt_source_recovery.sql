begin;
alter table finance_ai_receipt_runs add column receipt_source_keys text[];
create index finance_paid_receipt_sources on finance_ai_receipt_runs using gin(receipt_source_keys) where receipt_source_keys is not null;
alter table finance_email_receipts add column source_key text;
create index finance_email_source_key on finance_email_receipts(owner_id,source_key);
create table finance_receipt_exceptions(
 owner_id uuid not null references auth.users(id) on delete cascade,source_key text not null,
 name text not null,reason text not null,created_at timestamptz not null default now(),resolved_at timestamptz,
 primary key(owner_id,source_key)
);
alter table finance_receipt_exceptions enable row level security;
revoke all on finance_receipt_exceptions from public,anon,authenticated;
grant all on finance_receipt_exceptions to service_role;
grant select on finance_receipt_exceptions to authenticated;
create policy own_receipt_exceptions on finance_receipt_exceptions for select to authenticated using(owner_id=auth.uid());

create function finance_receipt_source_history(_owner uuid,_keys text[])
returns table(source_key text,state text,receipts jsonb,issues jsonb,email_id uuid)
language sql stable security definer set search_path=public,pg_temp as $$
 with known as (
  select k.key,r.status,r.result,k.pos-1 as idx,null::uuid mail,r.started_at
  from finance_ai_receipt_runs r cross join lateral unnest(r.receipt_source_keys) with ordinality k(key,pos)
  where r.owner_id=_owner and r.receipt_source_keys && _keys and k.key=any(_keys)
  union all
  select e.source_key,case when w.status='done' then 'succeeded' else r.status end,
   case when w.status='done' then w.result else r.result end,k.pos-1,e.id,w.created_at
  from finance_email_receipts e join finance_autopilot_work w on w.owner_id=e.owner_id and w.kind='receipts' and w.payload->'receiptIds' ? e.id::text
  cross join lateral jsonb_array_elements_text(w.payload->'receiptIds') with ordinality k(id,pos)
  left join finance_ai_receipt_runs r on r.owner_id=w.owner_id and r.request_id=w.request_id
  where e.owner_id=_owner and e.source_key=any(_keys) and k.id=e.id::text
    and (w.status='done' or (r.status in ('succeeded','failed') and r.receipt_source_keys is null))
 ), best as (
  select distinct on(key) * from known order by key,(status='succeeded') desc,started_at desc
 )
 select b.key,b.status,
 coalesce((select jsonb_agg(v) from jsonb_array_elements(b.result->'receipts') v where v->>'source'=b.idx::text),'[]'),
 coalesce((select jsonb_agg(v) from jsonb_array_elements(b.result->'issues') v where v->>'source'=b.idx::text),'[]'),b.mail
 from best b;
$$;

create function finance_reserve_receipt_sources(_owner uuid,_request uuid,_hash text,_cache text,_bytes integer,_output integer,_research boolean,_provider text,_model text,_keys text[]) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare reserved jsonb;
begin
 if _research or cardinality(_keys) not between 1 and 10 or _keys is null or exists(select 1 from unnest(_keys) k where k is null or k !~ '^[A-Za-z0-9_-]{43}$') then raise exception 'Invalid receipt fingerprints';end if;
 perform pg_advisory_xact_lock(hashtextextended('ai:'||_owner::text,0));
 if exists(select 1 from finance_receipt_source_history(_owner,_keys)) then raise exception 'Receipt history changed. Check the saved results before continuing.';end if;
 reserved:=finance_ai_reserve(_owner,_request,_hash,_cache,_bytes,_output,false,_provider,_model);
 if reserved->>'status'='new' then update finance_ai_receipt_runs set receipt_source_keys=_keys where id=(reserved->>'id')::uuid and owner_id=_owner;end if;
 return reserved;
end;$$;

create function finance_record_receipt_exceptions(_owner uuid,_items jsonb) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if jsonb_typeof(_items) is distinct from 'array' or jsonb_array_length(_items)>10 then raise exception 'Invalid receipt review';end if;
 insert into finance_receipt_exceptions(owner_id,source_key,name,reason)
 select _owner,coalesce((select 'email:'||e.id::text from finance_email_receipts e where e.owner_id=_owner and e.source_key=x->>'key' order by e.created_at desc limit 1),x->>'key'),left(x->>'name',150),left(x->>'reason',350) from jsonb_array_elements(_items) x
 on conflict(owner_id,source_key) do nothing;
end;$$;
create function finance_receipt_review_queue() returns table(source_key text,name text,reason text,email_id uuid)
language sql stable security definer set search_path=public,pg_temp as $$
 select x.source_key,x.name,x.reason,(select e.id from finance_email_receipts e where e.owner_id=x.owner_id and (e.source_key=x.source_key or 'email:'||e.id::text=x.source_key) and not e.dismissed and e.expires_at>now() order by e.created_at desc limit 1)
 from finance_receipt_exceptions x where x.owner_id=auth.uid() and x.resolved_at is null order by x.created_at,x.source_key limit 100;
$$;
create function finance_finish_receipt_review(_key text) returns void language sql security definer set search_path=public,pg_temp as $$
 update finance_receipt_exceptions set resolved_at=coalesce(resolved_at,now()) where owner_id=auth.uid() and source_key=_key;
$$;
revoke all on function finance_receipt_source_history(uuid,text[]),finance_reserve_receipt_sources(uuid,uuid,text,text,integer,integer,boolean,text,text,text[]),finance_record_receipt_exceptions(uuid,jsonb),finance_receipt_review_queue(),finance_finish_receipt_review(text) from public,anon,authenticated;
grant execute on function finance_receipt_source_history(uuid,text[]),finance_reserve_receipt_sources(uuid,uuid,text,text,integer,integer,boolean,text,text,text[]),finance_record_receipt_exceptions(uuid,jsonb) to service_role;
grant execute on function finance_receipt_review_queue(),finance_finish_receipt_review(text) to authenticated;
commit;
