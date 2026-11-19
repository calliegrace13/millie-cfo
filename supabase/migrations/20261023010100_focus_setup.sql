create or replace function public.finance_update_setup(_action text,_key text,_value boolean,_expected integer) returns jsonb language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid();r public.finance_setup_progress;known jsonb:='{"foundation":["accounts","transactions","scope"],"household":["timeline","shares","access"],"everyday":["budget","bills","variance"],"income":["paystub","deposits","mix"],"assets":["inventory","recognition","bridge"],"analyst":["basis","statements","drivers"],"goals":["target","funding","actuals"],"runway":["patterns","coverage","liquidity"],"debt":["terms","payment","compare"],"investments":["holdings","reconcile","returns"],"longterm":["snapshot","assumptions","sensitivity"],"close":["quarter","exceptions","hold"],"rewards":["cards","benefits","usage"],"watchlists":["create","review"],"recoveries":["create","review"]}';module_id text;step_id text;enabled text[];keys text[];sig text;recognized text[];
begin
 if u is null then raise exception 'Sign in first';end if;
 select * into r from public.finance_setup_progress where owner_id=u for update;
 if not found or _expected is null or r.revision<>_expected then raise exception 'Setup changed on another device. Reload your saved progress before continuing';end if;
 if _action='start' then r.status:='active';
 elsif _action='pause' then r.status:='paused';
 elsif _action='choose' then
  if not exists(select 1 from public.finance_module_preferences where owner_id=u) then raise exception 'Save your module choices first';end if;
  r.choice_confirmed:=true;r.status:='active';
 elsif _action='check' then
  sig:=split_part(_key,'@',2);_key:=split_part(_key,'@',1);if sig<>'' and sig!~'^[0-9a-f]{16}$' then raise exception 'Invalid setup evidence signature';end if; module_id:=split_part(_key,'.',1);step_id:=split_part(_key,'.',2);
  if _key is null or _key<>module_id||'.'||step_id or not coalesce(known->module_id ? step_id,false) or _value is null then raise exception 'Unknown setup step';end if;
  if not r.choice_confirmed then raise exception 'Choose your modules first';end if;
  if _value then if not(_key=any(r.checks)) then r.checks:=array_append(r.checks,_key);end if;r.deferred:=array_remove(r.deferred,module_id); if sig<>'' then r.evidence_signatures:=jsonb_set(r.evidence_signatures,array[_key],to_jsonb(sig));else r.evidence_signatures:=r.evidence_signatures-_key;end if;
  else r.checks:=array_remove(r.checks,_key);r.evidence_signatures:=r.evidence_signatures-_key;end if;r.status:='active';
 elsif _action in('defer','resume') then
  if _key is null or not(known ? _key) then raise exception 'Unknown setup module';end if;
  if _action='defer' then if not(_key=any(r.deferred)) then r.deferred:=array_append(r.deferred,_key);end if;
  else r.deferred:=array_remove(r.deferred,_key);end if;r.status:='active';
 elsif _action='finish' then recognized:='{}';if _key is not null then if length(_key)>6000 or jsonb_typeof(_key::jsonb)<>'array' then raise exception 'Invalid recognized setup keys';end if;select array_agg(value) into recognized from jsonb_array_elements_text(_key::jsonb);recognized:=coalesce(recognized,'{}');if cardinality(recognized)>39 then raise exception 'Too many recognized steps';end if;foreach step_id in array recognized loop if not coalesce(known->split_part(step_id,'.',1) ? split_part(step_id,'.',2),false) or step_id<>split_part(step_id,'.',1)||'.'||split_part(step_id,'.',2) then raise exception 'Unknown recognized setup step';end if;end loop;end if;r.recognized_keys:=recognized;
  if not r.choice_confirmed then raise exception 'Choose your modules first';end if;
  select enabled_modules into enabled from public.finance_module_preferences where owner_id=u;
  if not found then raise exception 'Save your module choices first';end if;
  for module_id in select k from jsonb_object_keys(known) k where k='foundation' or k=any(enabled) loop
   select array_agg(module_id||'.'||value) into keys from jsonb_array_elements_text(known->module_id);
   if not(module_id=any(r.deferred)) and not(keys<@(r.checks||recognized)) then raise exception 'Review or defer the remaining setup modules first';end if;
  end loop;r.status:='finished';
 else raise exception 'Unknown setup action';end if;
 update public.finance_setup_progress set status=r.status,choice_confirmed=r.choice_confirmed,checks=r.checks,deferred=r.deferred,evidence_signatures=r.evidence_signatures,recognized_keys=r.recognized_keys,revision=revision+1,updated_at=clock_timestamp() where owner_id=u returning * into r;
 insert into public.finance_setup_history(owner_id,revision,action,step_key,after_value) values(u,r.revision,_action,_key,to_jsonb(r));return to_jsonb(r);
end;$$;

commit;