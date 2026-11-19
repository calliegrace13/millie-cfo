-- Review coverage is separate from economic ownership/report weights.
create or replace function public.finance_closed_for_review(_owner uuid,_id uuid,_account uuid,_date date)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from finance_documents d where d.owner_id=_owner and d.kind='close' and (
  (d.payload->'reviewScope'->>'version'='1' and d.payload->'reviewScope'->>'ownerId'=_owner::text
   and _date::text between d.payload->'reviewScope'->>'start' and d.payload->'reviewScope'->>'end'
   and d.payload->'reviewScope'->'accountIds' ? _account::text)
  or (d.payload->'reviewScope' is null and coalesce(d.payload->'options'->>'basis','')<>'proforma'
   and exists(select 1 from jsonb_array_elements(coalesce(d.payload->'lines','[]')) l where l->>'id'=_id::text))
  ));
$$;
revoke all on function public.finance_closed_for_review(uuid,uuid,uuid,date) from public,anon,authenticated;
create or replace function public.finance_close_review_quarter(_payload jsonb,_expected jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid(); s date; e date; result uuid; actual jsonb; scope jsonb:=_payload->'reviewScope';
begin
 if u is null then raise exception 'Authentication required'; end if;
 s:=(scope->>'start')::date;e:=(scope->>'end')::date;
 if s is null or e is null or s<>date_trunc('quarter',s)::date or e<>(s+interval '3 months - 1 day')::date or e>=current_date
 or scope->>'ownerId' is distinct from u::text or scope->>'version' is distinct from '1'
 or jsonb_typeof(scope->'accountIds') is distinct from 'array' then raise exception 'Invalid completed quarter';end if;
 -- Serialize closes and lock existing records against concurrent edits.
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 perform 1 from transactions where user_id=u and date between s and e and not coalesce(pending,false) order by id for update;
 if exists(select 1 from transactions t where t.user_id=u and t.date between s and e and not coalesce(t.pending,false)
 and t.needs_review and not finance_closed_for_review(u,t.id,t.account_id,t.date)) then raise exception 'Review this quarter first';end if;
 if exists(select 1 from jsonb_array_elements_text(scope->'accountIds') x where not exists(select 1 from accounts a where a.id::text=x and a.user_id=u))
 or exists(select 1 from transactions t where t.user_id=u and t.date between s and e and not coalesce(t.pending,false) and not (scope->'accountIds' ? t.account_id::text)) then raise exception 'Account coverage changed';end if;
 select jsonb_agg(jsonb_build_object('id',id,'updated_at',updated_at) order by id) into actual from transactions where user_id=u and date between s and e and not coalesce(pending,false);
 if actual is null or actual is distinct from (select jsonb_agg(x order by x->>'id') from jsonb_array_elements(_expected) x) then raise exception 'Source history changed; refresh';end if;
 if not exists(select 1 from transactions t where t.user_id=u and t.date between s and e and not coalesce(t.pending,false) and not finance_closed_for_review(u,t.id,t.account_id,t.date)) then raise exception 'Already closed';end if;
 insert into finance_documents(owner_id,kind,name,payload) values(u,'close','Quarter review: '||s||' to '||e,_payload) returning id into result;
 return result;
end;$$;
revoke all on function public.finance_close_review_quarter(jsonb,jsonb) from public,anon;
grant execute on function public.finance_close_review_quarter(jsonb,jsonb) to authenticated;

-- A preview cannot apply to a period closed in another tab after preview.
alter function public.finance_apply_classifications(uuid,jsonb,boolean) rename to finance_apply_classifications_before_quarters;
revoke all on function public.finance_apply_classifications_before_quarters(uuid,jsonb,boolean) from public,anon,authenticated,service_role;
create function public.finance_apply_classifications(_owner uuid,_changes jsonb,_automatic boolean default true)
returns integer language plpgsql security definer set search_path=public as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(_owner::text,0));
 if exists(select 1 from transactions t join jsonb_array_elements(_changes) c on c->>'id'=t.id::text where t.user_id=_owner and finance_closed_for_review(_owner,t.id,t.account_id,t.date)) then raise exception 'Period closed; inspect restatement instead';end if;
 return finance_apply_classifications_before_quarters(_owner,_changes,_automatic);
end;$$;
revoke all on function public.finance_apply_classifications(uuid,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.finance_apply_classifications(uuid,jsonb,boolean) to service_role;
