begin;
alter table public.finance_module_preferences drop constraint finance_modules_known;
update public.finance_module_preferences set enabled_modules=enabled_modules||array['income','investments','debt','longterm'] where enabled_modules @> array['everyday','runway','goals','analyst','household','close','assets','rewards'];
alter table public.finance_module_preferences alter column enabled_modules set default array['everyday','runway','goals','analyst','household','close','assets','rewards','income','investments','debt','longterm'];
alter table public.finance_module_preferences add constraint finance_modules_known check(enabled_modules <@ array['everyday','runway','goals','analyst','household','close','assets','rewards','income','investments','debt','longterm']::text[] and array_position(enabled_modules,null) is null and cardinality(enabled_modules)<=12);

create table public.finance_module_records(
 id uuid primary key default gen_random_uuid(),owner_id uuid not null,domain text not null check(domain in('income','investments','debt','long_term')),
 kind text not null,name text not null check(length(trim(name)) between 1 and 150),payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=60000),
 revision integer not null default 1,status text not null default 'active' check(status in('active','archived')),created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index module_records_owner_domain on public.finance_module_records(owner_id,domain,status);
create table public.finance_module_record_history(id uuid primary key default gen_random_uuid(),owner_id uuid not null,record_id uuid not null references public.finance_module_records(id) on delete restrict,revision integer not null,operation text not null,before_value jsonb,after_value jsonb not null,recorded_at timestamptz not null default clock_timestamp(),unique(record_id,revision));
create index module_history_owner_record on public.finance_module_record_history(owner_id,record_id);
create table public.finance_module_requests(owner_id uuid not null,request_id uuid not null,fingerprint jsonb not null,result jsonb not null,created_at timestamptz not null default now(),primary key(owner_id,request_id));
alter table public.finance_module_records enable row level security;
alter table public.finance_module_record_history enable row level security;
alter table public.finance_module_requests enable row level security;
create policy module_records_own on public.finance_module_records for select to authenticated using(owner_id=auth.uid());
create policy module_history_own on public.finance_module_record_history for select to authenticated using(owner_id=auth.uid());
revoke all on public.finance_module_records,public.finance_module_record_history,public.finance_module_requests from public,anon,authenticated;
grant select on public.finance_module_records,public.finance_module_record_history to authenticated;
grant all on public.finance_module_records,public.finance_module_record_history,public.finance_module_requests to service_role;

create function public.finance_save_module_record(_domain text,_kind text,_name text,_payload jsonb,_id uuid,_expected integer,_status text,_request uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid();old public.finance_module_records;r public.finance_module_records;f jsonb;cached public.finance_module_requests;aid uuid;tid uuid;t public.transactions;a public.accounts;spec jsonb;k text;v jsonb;lo numeric;hi numeric;num numeric;datevalue date;
begin
 if u is null then raise exception 'Sign in first';end if;
 if _request is null or _domain not in('income','investments','debt','long_term') or _status not in('active','archived') or _status is null or length(trim(coalesce(_name,''))) not between 1 and 150 or jsonb_typeof(_payload) is distinct from 'object' or octet_length(_payload::text)>60000 then raise exception 'Invalid planning request';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text||':module-plans',0));
 f:=jsonb_build_object('domain',_domain,'kind',_kind,'name',_name,'payload',_payload,'id',_id,'expected',_expected,'status',_status);
 select * into cached from public.finance_module_requests where owner_id=u and request_id=_request;
 if found then if cached.fingerprint<>f then raise exception 'Request identifier already used';end if;return cached.result;end if;
 if _id is not null then
  select * into old from public.finance_module_records where id=_id and owner_id=u and domain=_domain for update;
  if not found or _expected is null or old.revision<>_expected then raise exception 'This record changed. Reload before saving';end if;
  if old.kind<>_kind then raise exception 'Record type cannot change';end if;
 elsif _status='archived' then raise exception 'Choose an existing record';end if;
 if (_domain,_kind) not in (('income','paycheck'),('investments','holding'),('investments','valuation'),('investments','flow'),('debt','terms'),('long_term','scenario')) then raise exception 'Unknown record type';end if;
 if coalesce(_payload->>'currency','')!~'^[A-Z]{3}$' then raise exception 'Choose a currency';end if;
 -- Database validation protects the RPC even when it is called without an Edge service.
 spec:=case _kind
 when 'paycheck' then '{"salary":[0,1000000000],"bonus":[0,1000000000],"otherCash":[0,1000000000],"taxes":[0,1000000000],"retirement":[0,1000000000],"benefits":[0,1000000000],"deductions":[0,1000000000],"reimbursements":[0,1000000000],"employerRetirement":[0,1000000000],"equity":[0,1000000000]}'::jsonb
 when 'holding' then '{"units":[0,1000000000],"price":[0,1000000000],"costBasis":[0,1000000000,true],"feeBps":[0,10000,true]}'::jsonb
 when 'valuation' then '{"value":[0,1000000000]}'::jsonb when 'flow' then '{"amount":[-1000000000,1000000000]}'::jsonb
 when 'terms' then '{"apr":[0,100],"minimum":[0,10000000],"minimumPct":[0,100],"promoApr":[0,100,true]}'::jsonb
 else '{"startingAssets":[0,1000000000],"monthlySaving":[-10000000,10000000],"savingGrowth":[-50,50],"years":[1,80],"inflation":[0,30],"downside":[-90,100],"base":[-90,100],"upside":[-90,100],"retireYear":[0,80,true],"annualSpending":[0,100000000]}'::jsonb end;
 for k,v in select * from jsonb_each(spec) loop
  if coalesce((v->>2)::boolean,false) and (_payload->k is null or _payload->k='null'::jsonb) then continue;end if;
  if jsonb_typeof(_payload->k) is distinct from 'number' then raise exception 'Missing or invalid numeric field: %',k;end if;
  num:=(_payload->>k)::numeric;lo:=(v->>0)::numeric;hi:=(v->>1)::numeric;if num<lo or num>hi then raise exception 'Numeric field out of range: %',k;end if;
 end loop;
 for k in select unnest(case when _kind='paycheck' then array['date','periodStart','periodEnd'] when _kind='terms' and _payload->>'promoEnd' is not null then array['date','promoEnd'] else array['date'] end) loop
  if coalesce(_payload->>k,'')!~'^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid date';end if;datevalue:=(_payload->>k)::date;if datevalue<'1900-01-01' or datevalue>'2200-12-31' then raise exception 'Date out of range';end if;
 end loop;
 if _kind='paycheck' and ((_payload->>'periodStart')>(_payload->>'periodEnd') or (_payload->>'date')<(_payload->>'periodStart') or (_payload->>'salary')::numeric+(_payload->>'bonus')::numeric+(_payload->>'otherCash')::numeric+(_payload->>'reimbursements')::numeric<(_payload->>'taxes')::numeric+(_payload->>'retirement')::numeric+(_payload->>'benefits')::numeric+(_payload->>'deductions')::numeric) then raise exception 'Check paycheck dates and deductions';end if;
 if _kind='terms' and ((_payload->>'promoApr' is null)<>(_payload->>'promoEnd' is null)) then raise exception 'Enter promotion rate and end date together';end if;
 if _kind='scenario' then
  if (_payload->>'years')::numeric<>trunc((_payload->>'years')::numeric) or ((_payload->>'retireYear') is not null and ((_payload->>'retireYear')::numeric<>trunc((_payload->>'retireYear')::numeric) or (_payload->>'retireYear')::numeric>(_payload->>'years')::numeric)) or (_payload->>'downside')::numeric>(_payload->>'base')::numeric or (_payload->>'base')::numeric>(_payload->>'upside')::numeric then raise exception 'Check scenario years and ordered returns';end if;
  if jsonb_typeof(_payload->'events') is distinct from 'array' or jsonb_array_length(_payload->'events')>100 then raise exception 'Invalid scenario events';end if;
  for v in select * from jsonb_array_elements(_payload->'events') loop
   if length(trim(coalesce(v->>'name',''))) not between 1 and 150 or jsonb_typeof(v->'amount') is distinct from 'number' or abs((v->>'amount')::numeric)>1000000000 or coalesce(v->>'date','')!~'^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid scenario event';end if;
   datevalue:=(v->>'date')::date;if datevalue<=(_payload->>'date')::date or datevalue>'2200-12-31' then raise exception 'Scenario events must be after snapshot';end if;
  end loop;
 end if;
 if _kind in('holding','valuation','flow','terms') then
  aid:=(_payload->>'accountId')::uuid;select * into a from public.accounts where id=aid and user_id=u;
  if not found or coalesce(a.currency,'USD')<>_payload->>'currency' then raise exception 'Choose your account in the same currency';end if;
  if _kind='terms' and a.type not in('credit','loan') then raise exception 'Choose a debt account';end if;
  if _kind<>'terms' and a.type<>'investment' and coalesce(a.subtype,'') not in('brokerage','401k','403b','ira','roth','pension','retirement','529') then raise exception 'Choose an investment account';end if;
  if _status='active' and _kind='terms' and exists(select 1 from public.finance_module_records where owner_id=u and kind='terms' and status='active' and payload->>'accountId'=aid::text and id is distinct from _id) then raise exception 'Edit the existing terms for this debt';end if;
  if _status='active' and _kind='valuation' and exists(select 1 from public.finance_module_records where owner_id=u and kind='valuation' and status='active' and payload->>'accountId'=aid::text and payload->>'date'=_payload->>'date' and id is distinct from _id) then raise exception 'Edit the existing valuation for this date';end if;
  if _status='active' and _kind='holding' and exists(select 1 from public.finance_module_records where owner_id=u and kind='holding' and status='active' and payload->>'accountId'=aid::text and lower(trim(payload->>'symbol'))=lower(trim(_payload->>'symbol')) and id is distinct from _id) then raise exception 'Edit the existing holding to update its price or quantity';end if;
 end if;
 if _payload ? 'transactionIds' then
  if _kind not in('paycheck','flow') or jsonb_typeof(_payload->'transactionIds') is distinct from 'array' or jsonb_array_length(_payload->'transactionIds')>20 then raise exception 'Invalid source transactions';end if;
  if (select count(*)<>count(distinct x) from jsonb_array_elements_text(_payload->'transactionIds') x) then raise exception 'Duplicate source transactions';end if;
  for tid in select x::uuid from jsonb_array_elements_text(_payload->'transactionIds') x loop
   select * into t from public.transactions where id=tid and user_id=u and not pending;
   if not found then raise exception 'Source transaction unavailable';end if;
   select * into a from public.accounts where id=t.account_id and user_id=u;
   if not found or coalesce(a.currency,'USD')<>_payload->>'currency' then raise exception 'Source currency does not match';end if;
   if _kind='paycheck' and (t.amount>=0 or a.type not in('checking','savings','depository') or t.linked_transfer_id is not null or coalesce(t.classification_kind,'') in('transfer','card_payment')) then raise exception 'Choose a posted payroll deposit';end if;
   if _kind='flow' and (t.account_id is distinct from aid or t.date<>(_payload->>'date')::date or -t.amount<>(_payload->>'amount')::numeric) then raise exception 'Choose the matching investment transaction amount and date';end if;
   if _status='active' and exists(select 1 from public.finance_module_records r where r.owner_id=u and r.domain=_domain and r.status='active' and r.id is distinct from _id and ((r.payload->'transactionIds') ? tid::text or (t.linked_transfer_id is not null and (r.payload->'transactionIds') ? t.linked_transfer_id::text))) then raise exception 'This source transaction is already linked to a plan';end if;
  end loop;
 end if;
 if _id is null then insert into public.finance_module_records(owner_id,domain,kind,name,payload) values(u,_domain,_kind,trim(_name),_payload) returning * into r;
 else update public.finance_module_records set name=trim(_name),payload=_payload,status=_status,revision=revision+1,updated_at=clock_timestamp() where id=old.id returning * into r;end if;
 insert into public.finance_module_record_history(owner_id,record_id,revision,operation,before_value,after_value) values(u,r.id,r.revision,case when _id is null then 'created' when old.status<>r.status then r.status else 'revised' end,case when _id is not null then to_jsonb(old) end,to_jsonb(r));
 insert into public.finance_module_requests(owner_id,request_id,fingerprint,result) values(u,_request,f,to_jsonb(r));return to_jsonb(r);
end;$$;
revoke all on function public.finance_save_module_record(text,text,text,jsonb,uuid,integer,text,uuid) from public,anon;
grant execute on function public.finance_save_module_record(text,text,text,jsonb,uuid,integer,text,uuid) to authenticated;
comment on table public.finance_module_records is 'Private versioned domain planning. No financial ledger side effects; module visibility never affects retention. Only authenticated RPC may mutate.';
commit;
