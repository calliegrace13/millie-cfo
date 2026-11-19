begin;
create table finance_ai_connections (
 owner_id uuid not null references auth.users(id) on delete cascade,
 provider text not null check(provider in('openai','anthropic')),model text not null check(length(model) between 1 and 120),
 credential text not null,key_suffix text not null check(length(key_suffix)<=4),
 request_limit integer not null default 3 check(request_limit between 1 and 20),
 revision integer not null default 1,updated_at timestamptz not null default now(),primary key(owner_id,provider)
);
create table finance_ai_settings(owner_id uuid primary key references auth.users(id) on delete cascade,active_provider text check(active_provider in('openai','anthropic')),updated_at timestamptz not null default now());
create table finance_ai_receipt_runs (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null,input_hash text not null,provider text not null,model text not null,
 status text not null default 'running' check(status in('running','succeeded','failed')),
 started_at timestamptz not null default now(),finished_at timestamptz,result jsonb,
 unique(owner_id,request_id)
);
create index finance_ai_run_limits on finance_ai_receipt_runs(owner_id,provider,started_at);
alter table finance_ai_connections enable row level security;alter table finance_ai_settings enable row level security;alter table finance_ai_receipt_runs enable row level security;
revoke all on finance_ai_connections,finance_ai_settings,finance_ai_receipt_runs from public,anon,authenticated;
grant all on finance_ai_connections,finance_ai_settings,finance_ai_receipt_runs to service_role;
-- Credentials never have a browser-readable policy. Only safe metadata leaves this RPC.
create function finance_ai_status() returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('active',(select active_provider from finance_ai_settings where owner_id=auth.uid()),'connections',coalesce((select jsonb_agg(jsonb_build_object('provider',c.provider,'model',c.model,'suffix',c.key_suffix,'requestLimit',c.request_limit,'revision',c.revision,'updatedAt',c.updated_at,'used',(select count(*) from finance_ai_receipt_runs r where r.owner_id=c.owner_id and r.provider=c.provider and r.started_at>now()-interval '24 hours'))) from finance_ai_connections c where c.owner_id=auth.uid()),'[]'::jsonb));
$$;
revoke all on function finance_ai_status() from public,anon;grant execute on function finance_ai_status() to authenticated;
create function finance_ai_connect(_owner uuid,_provider text,_model text,_credential text,_suffix text,_limit integer,_expected integer) returns void language plpgsql security definer set search_path=public as $$
declare actual integer;
begin
 if _owner is null or _provider not in('openai','anthropic') or _model is null or length(_model) not between 1 and 120 or _credential is null or length(_credential)<40 or length(_credential)>3000 or _suffix is null or length(_suffix)>4 or _limit is null or _limit not between 1 and 20 then raise exception 'Invalid connection';end if;
 perform pg_advisory_xact_lock(hashtextextended('ai:'||_owner::text,0));
 select revision into actual from finance_ai_connections where owner_id=_owner and provider=_provider for update;
 if actual is distinct from _expected then raise exception 'Connection changed; refresh settings';end if;
 insert into finance_ai_connections(owner_id,provider,model,credential,key_suffix,request_limit) values(_owner,_provider,_model,_credential,_suffix,_limit)
 on conflict(owner_id,provider) do update set model=excluded.model,credential=excluded.credential,key_suffix=excluded.key_suffix,request_limit=excluded.request_limit,revision=finance_ai_connections.revision+1,updated_at=now();
 insert into finance_ai_settings(owner_id,active_provider) values(_owner,_provider) on conflict(owner_id) do update set active_provider=excluded.active_provider,updated_at=now();
end;$$;
create function finance_ai_choose(_owner uuid,_provider text,_disconnect boolean default false) returns void language plpgsql security definer set search_path=public as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('ai:'||_owner::text,0));
 if _provider not in('openai','anthropic') or _owner is null then raise exception 'Invalid provider';end if;
 if _disconnect then
  delete from finance_ai_connections where owner_id=_owner and provider=_provider;
  update finance_ai_settings set active_provider=null,updated_at=now() where owner_id=_owner and active_provider=_provider;
 else
  if not exists(select 1 from finance_ai_connections where owner_id=_owner and provider=_provider) then raise exception 'Connect this provider first';end if;
  insert into finance_ai_settings(owner_id,active_provider) values(_owner,_provider) on conflict(owner_id) do update set active_provider=excluded.active_provider,updated_at=now();
 end if;
end;$$;
create function finance_ai_reserve(_owner uuid,_request uuid,_hash text) returns jsonb language plpgsql security definer set search_path=public as $$
declare prior finance_ai_receipt_runs;c finance_ai_connections;n integer;run uuid;
begin
 if _owner is null or _request is null or _hash is null or _hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid analysis request';end if;
 perform pg_advisory_xact_lock(hashtextextended('ai:'||_owner::text,0));
 select * into prior from finance_ai_receipt_runs where owner_id=_owner and request_id=_request;
 if found then
  if prior.input_hash is distinct from _hash then raise exception 'Request ID already used';end if;
  return jsonb_build_object('id',prior.id,'status',prior.status,'result',prior.result);
 end if;
 -- Identical source input is reusable without another provider charge. Matching
 -- is always recalculated against the current open purchase list in the UI.
 select * into prior from finance_ai_receipt_runs where owner_id=_owner and input_hash=_hash and status='succeeded' and started_at>now()-interval '30 days' order by started_at desc limit 1;
 if found then return jsonb_build_object('id',prior.id,'status',prior.status,'result',prior.result);end if;
 select fc.* into c from finance_ai_connections fc join finance_ai_settings s on s.owner_id=fc.owner_id and s.active_provider=fc.provider where fc.owner_id=_owner;
 if not found then raise exception 'Connect and select an AI provider in Customize Millie';end if;
 select count(*) into n from finance_ai_receipt_runs where owner_id=_owner and provider=c.provider and started_at>now()-interval '24 hours';
 if n>=c.request_limit then raise exception 'Your request limit for the last 24 hours has been reached';end if;
 if exists(select 1 from finance_ai_receipt_runs where owner_id=_owner and status='running' and started_at>now()-interval '2 minutes') then raise exception 'An analysis is already running. Wait before starting another';end if;
 insert into finance_ai_receipt_runs(owner_id,request_id,input_hash,provider,model) values(_owner,_request,_hash,c.provider,c.model) returning id into run;
 return jsonb_build_object('id',run,'status','new','provider',c.provider,'model',c.model,'credential',c.credential);
end;$$;
revoke all on function finance_ai_connect(uuid,text,text,text,text,integer,integer),finance_ai_choose(uuid,text,boolean),finance_ai_reserve(uuid,uuid,text) from public,anon,authenticated;
grant execute on function finance_ai_connect(uuid,text,text,text,text,integer,integer),finance_ai_choose(uuid,text,boolean),finance_ai_reserve(uuid,uuid,text) to service_role;
commit;
