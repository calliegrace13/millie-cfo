begin;
-- Read a logical account's latest active connection without rewriting its history.
create function finance_planning_cash_account(_id uuid,_owner uuid) returns accounts language plpgsql security definer set search_path=public as $$
declare a accounts;s accounts;begin
 select * into a from accounts where id=_id and user_id=_owner for update;
 if not found then raise exception 'Choose your cash account';end if;
 select source.* into s from finance_account_continuity c join accounts source on source.id=c.source_id and source.user_id=_owner where c.original_id=a.id and c.owner_id=_owner and c.starts_on<=current_date order by c.starts_on desc limit 1 for update of source;
 if found then a.current_balance:=s.current_balance;a.available_balance:=s.available_balance;a.is_zero_balance:=s.is_zero_balance;a.is_deleted:=s.is_deleted;end if;
 if coalesce(a.is_deleted,false) or a.type not in('checking','savings','depository') then raise exception 'Choose an active cash account';end if;return a;
end;$$;
revoke all on function finance_planning_cash_account(uuid,uuid) from public,anon,authenticated;
create or replace function finance_cash_plan_guard() returns trigger language plpgsql security definer set search_path=public as $$
declare a accounts;begin
 if tg_op='UPDATE' and (new.owner_id<>old.owner_id or new.id<>old.id) then raise exception 'Plan identity cannot change';end if;
 if new.status='active' then a:=finance_planning_cash_account(new.account_id,new.owner_id);
 else select * into a from accounts where id=new.account_id and user_id=new.owner_id;
 if not found then raise exception 'Choose your cash account';end if;end if;
 if exists(select 1 from finance_account_sharing where account_id=a.id and duplicate_of is not null) or exists(select 1 from finance_account_continuity where source_id=a.id) then raise exception 'Choose the original primary cash account';end if;
 if new.recurring_id is not null and not exists(select 1 from recurring_transactions where id=new.recurring_id and user_id=new.owner_id) then raise exception 'Recurring record unavailable';end if;
 if new.project_id is not null and not exists(select 1 from finance_documents where id=new.project_id and owner_id=new.owner_id and kind='project' and payload->>'currency'=coalesce(a.currency,'USD')) then raise exception 'Choose your project in the same currency';end if;
 if tg_op='UPDATE' then new.revision:=old.revision+1;else new.revision:=1;end if;return new;
end;$$;
create or replace function finance_save_goal(_id uuid,_account uuid,_name text,_reserved numeric,_target numeric,_deadline date,_expected timestamptz default null,_archive boolean default false) returns uuid language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid();a accounts;g finance_documents;pct numeric;used numeric;result uuid;begin
 if u is null then raise exception 'Sign in first';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text||':goals',0));
 if _id is not null then select * into g from finance_documents where id=_id and owner_id=u and kind='goal' for update;
  if not found or _expected is null or g.updated_at<>_expected then raise exception 'This goal changed. Reload before saving';end if;
 end if;
 if _archive then
  if _id is null then raise exception 'Choose an existing goal';end if;
  update finance_documents set payload=jsonb_set(jsonb_set(payload,'{status}','"archived"'),'{reserved}','0'),updated_at=clock_timestamp() where id=_id;return _id;
 end if;
 a:=finance_planning_cash_account(_account,u);
 if _reserved is null or _target is null or _reserved<0 or _target<=0 or _reserved>_target or greatest(abs(_reserved),abs(_target))>=1000000000 or length(trim(coalesce(_name,''))) not between 1 and 150 or (_deadline is not null and (not isfinite(_deadline) or _deadline<'1900-01-01')) then raise exception 'Choose your cash account, name and valid goal amounts';end if;
 if exists(select 1 from finance_account_sharing where account_id=a.id and duplicate_of is not null) or exists(select 1 from finance_account_continuity where source_id=a.id) then raise exception 'Use the original primary cash account';end if;
 select coalesce(balance_pct,owner_pct) into pct from finance_allocations where account_id=a.id and effective_from<=current_date order by effective_from desc limit 1;
 select coalesce(sum((payload->>'reserved')::numeric),0) into used from finance_documents where owner_id=u and kind='goal' and payload->>'accountId'=a.id::text and payload->>'status' is distinct from 'archived' and (_id is null or id<>_id);
 if used+_reserved>greatest(0,case when a.is_zero_balance then 0 else coalesce(a.current_balance,0) end)*coalesce(pct,100)/100 then raise exception 'Reservations exceed your current balance share';end if;
 if _id is null then insert into finance_documents(owner_id,kind,name,payload) values(u,'goal',trim(_name),jsonb_build_object('accountId',a.id,'currency',coalesce(a.currency,'USD'),'reserved',_reserved,'target',_target,'deadline',_deadline,'status','active')) returning id into result;
 else update finance_documents set name=trim(_name),payload=g.payload||jsonb_build_object('accountId',a.id,'currency',coalesce(a.currency,'USD'),'reserved',_reserved,'target',_target,'deadline',_deadline,'status','active'),updated_at=clock_timestamp() where id=_id returning id into result;end if;return result;
end;$$;
commit;
