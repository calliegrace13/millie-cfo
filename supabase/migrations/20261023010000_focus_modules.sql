begin;
alter table finance_module_preferences drop constraint finance_modules_known;
alter table finance_module_preferences add constraint finance_modules_known check(enabled_modules <@ array['everyday','runway','goals','analyst','household','close','assets','rewards','income','investments','debt','longterm','watchlists','recoveries']::text[] and array_position(enabled_modules,null) is null and cardinality(enabled_modules)<=14);
create table finance_focus_records(id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id),domain text not null check(domain in('watchlists','recoveries')),name text not null,payload jsonb not null,revision integer not null default 1,status text not null default 'active' check(status in('active','archived')),updated_at timestamptz not null default now());
create index finance_focus_owner on finance_focus_records(owner_id,domain,status);
create table finance_focus_history(id uuid primary key default gen_random_uuid(),owner_id uuid not null,record_id uuid not null references finance_focus_records(id),revision integer not null,after_value jsonb not null,recorded_at timestamptz not null default now(),unique(record_id,revision));
create table finance_focus_requests(owner_id uuid not null,request_id uuid not null,fingerprint jsonb not null,result jsonb not null,primary key(owner_id,request_id));
alter table finance_focus_records enable row level security;alter table finance_focus_history enable row level security;alter table finance_focus_requests enable row level security;
create policy focus_own on finance_focus_records for select to authenticated using(owner_id=auth.uid());
create policy focus_history_own on finance_focus_history for select to authenticated using(owner_id=auth.uid());
revoke all on finance_focus_records,finance_focus_history,finance_focus_requests from public,anon,authenticated;
grant select on finance_focus_records,finance_focus_history to authenticated;grant all on finance_focus_records,finance_focus_history,finance_focus_requests to service_role;
create function finance_save_focus(_domain text,_name text,_payload jsonb,_id uuid,_expected integer,_status text,_request uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid();r finance_focus_records;old finance_focus_records;f jsonb;prior finance_focus_requests;t transactions;a accounts;tid uuid;sources jsonb:='[]';expense jsonb;
begin
 if u is null or _domain is null or _domain not in('watchlists','recoveries') or _status is null or _status not in('active','archived') or _request is null or length(trim(coalesce(_name,''))) not between 1 and 100 or jsonb_typeof(_payload) is distinct from 'object' or octet_length(_payload::text)>20000 or coalesce(_payload->>'currency','')!~'^[A-Z]{3}$' then raise exception 'Invalid workspace request';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text||':focus',0));
 f:=jsonb_build_object('domain',_domain,'name',_name,'payload',_payload,'id',_id,'expected',_expected,'status',_status);
 select * into prior from finance_focus_requests where owner_id=u and request_id=_request;
 if found then if prior.fingerprint<>f then raise exception 'Request already used';end if;return prior.result;end if;
 if _id is not null then select * into old from finance_focus_records where id=_id and owner_id=u and domain=_domain for update;if not found or old.revision is distinct from _expected then raise exception 'Record changed. Reload before saving';end if;elsif _status='archived' then raise exception 'Choose an existing record';end if;
 if _domain='watchlists' then
  if coalesce(_payload->>'field','') not in('merchant','category') or length(trim(coalesce(_payload->>'value',''))) not between 1 and 100 or jsonb_typeof(_payload->'target') is distinct from 'number' or (_payload->>'target')::numeric<0 or (_payload->>'target')::numeric>1000000000 then raise exception 'Choose a category or merchant and a valid monthly target';end if;
  _payload:=jsonb_build_object('currency',_payload->>'currency','field',_payload->>'field','value',trim(_payload->>'value'),'target',(_payload->>'target')::numeric);
 else
  tid:=(_payload->>'expenseId')::uuid;
  select tx.* into t from transactions tx join accounts ac on ac.id=tx.account_id and ac.user_id=u where tx.id=tid and tx.user_id=u and not tx.pending and tx.amount>0 and coalesce(ac.currency,'USD')=_payload->>'currency' and tx.linked_transfer_id is null and coalesce(tx.classification_kind,'') not in('transfer','card_payment') and coalesce(tx.category,'') not in('Transfer','Credit Card Payment','Debt Payment');
  if found then expense:=jsonb_build_object('id',t.id,'amount',t.amount,'date',t.date,'name',t.name);
  elsif old.id is not null and old.payload->>'expenseId'=_payload->>'expenseId' then expense:=old.payload->'expenseSnapshot';else raise exception 'Choose your posted expense in this currency';end if;
  if old.id is not null and old.payload->>'expenseId' is distinct from _payload->>'expenseId' then raise exception 'Create a separate claim for a different expense';end if;
  if jsonb_typeof(_payload->'expected') is distinct from 'number' or (_payload->>'expected')::numeric<=0 or (_payload->>'expected')::numeric>(expense->>'amount')::numeric then raise exception 'Expected recovery must be positive and no larger than the expense';end if;
  if _payload->>'due' is not null then perform (_payload->>'due')::date;end if;
  if jsonb_typeof(_payload->'receivedIds') is distinct from 'array' or jsonb_array_length(_payload->'receivedIds')>30 or (select count(*)<>count(distinct x) from jsonb_array_elements_text(_payload->'receivedIds') x) then raise exception 'Choose distinct repayment deposits';end if;
  if _status='active' and exists(select 1 from finance_focus_records where owner_id=u and domain='recoveries' and status='active' and payload->>'expenseId'=tid::text and id is distinct from _id) then raise exception 'This expense already has an active recovery';end if;
  for tid in select x::uuid from jsonb_array_elements_text(_payload->'receivedIds') x loop
   select tx.* into t from transactions tx join accounts ac on ac.id=tx.account_id and ac.user_id=u where tx.id=tid and tx.user_id=u and not tx.pending and tx.amount<0 and tx.date>=(expense->>'date')::date and coalesce(ac.currency,'USD')=_payload->>'currency' and tx.linked_transfer_id is null and coalesce(tx.classification_kind,'') not in('transfer','card_payment','income') and coalesce(tx.category,'') not in('Income','Salary','Transfer','Credit Card Payment');
   if found then sources:=sources||jsonb_build_array(jsonb_build_object('id',t.id,'amount',t.amount,'date',t.date,'name',t.name));
   elsif old.id is not null and old.payload->'receivedIds' ? tid::text and exists(select 1 from jsonb_array_elements(old.payload->'receivedSnapshots') s where s->>'id'=tid::text) then sources:=sources||(select jsonb_agg(s) from jsonb_array_elements(old.payload->'receivedSnapshots') s where s->>'id'=tid::text);
   else raise exception 'Choose your posted refund or repayment, not salary or a transfer';end if;
   if _status='active' and exists(select 1 from finance_focus_records where owner_id=u and domain='recoveries' and status='active' and id is distinct from _id and payload->'receivedIds' ? tid::text) then raise exception 'Repayment already linked to another recovery';end if;
  end loop;
  _payload:=jsonb_build_object('currency',_payload->>'currency','expenseId',_payload->>'expenseId','expected',(_payload->>'expected')::numeric,'due',_payload->>'due','receivedIds',_payload->'receivedIds','expenseSnapshot',expense,'receivedSnapshots',sources);
 end if;
 if _id is null then insert into finance_focus_records(owner_id,domain,name,payload) values(u,_domain,trim(_name),_payload) returning * into r;
 else update finance_focus_records set name=trim(_name),payload=_payload,status=_status,revision=revision+1,updated_at=now() where id=_id returning * into r;end if;
 insert into finance_focus_history(owner_id,record_id,revision,after_value) values(u,r.id,r.revision,to_jsonb(r));
 insert into finance_focus_requests values(u,_request,f,to_jsonb(r));return to_jsonb(r);
end;$$;
revoke all on function finance_save_focus(text,text,jsonb,uuid,integer,text,uuid) from public,anon;
grant execute on function finance_save_focus(text,text,jsonb,uuid,integer,text,uuid) to authenticated;
commit;