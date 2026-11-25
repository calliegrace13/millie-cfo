begin;
create table finance_answer_memory_settings(owner_id uuid primary key references auth.users(id),enabled boolean not null default false);
create table finance_answer_memories(id uuid primary key references finance_assistant_items(id) on delete cascade,owner_id uuid not null references auth.users(id),enabled boolean not null default true,revision integer not null default 1,updated_at timestamptz not null default now());
alter table finance_answer_memory_settings enable row level security;
alter table finance_answer_memories enable row level security;
revoke all on finance_answer_memory_settings,finance_answer_memories from public,anon,authenticated;
grant select on finance_answer_memory_settings,finance_answer_memories to authenticated;
grant all on finance_answer_memory_settings,finance_answer_memories to service_role;
create policy own_answer_memory_settings on finance_answer_memory_settings for select to authenticated using(owner_id=auth.uid());
create policy own_answer_memories on finance_answer_memories for select to authenticated using(owner_id=auth.uid());
create view finance_answer_memory_evidence with(security_invoker=true) as
 select m.id,m.owner_id,m.enabled,m.revision,m.updated_at,i.module,i.task,i.answer,i.payload->>'question' as question,
 t.id as transaction_id,t.date as purchase_date,coalesce(nullif(t.merchant_name,''),t.name) as merchant,
 trim(regexp_replace(lower(coalesce(nullif(t.merchant_name,''),t.name,'')),'[^a-z0-9]+',' ','g')) as merchant_key,t.account_id,a.currency,t.amount
 from finance_answer_memories m join finance_assistant_items i on i.id=m.id and i.owner_id=m.owner_id
 left join transactions t on t.id::text=i.payload->>'transaction_id' and t.user_id=m.owner_id
 left join accounts a on a.id=t.account_id and a.user_id=m.owner_id where i.answer<>'' and i.status<>'dismissed';
revoke all on finance_answer_memory_evidence from public,anon;
grant select on finance_answer_memory_evidence to authenticated,service_role;
create function finance_capture_answer_memory() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$begin
 if tg_op='UPDATE' and new.answer is not distinct from old.answer then return new;end if;
 if new.answer<>'' then
  insert into finance_answer_memories(id,owner_id) values(new.id,new.owner_id) on conflict(id) do update set revision=finance_answer_memories.revision+1,updated_at=now();
 end if;
 insert into finance_learning_state(owner_id,revision) values(new.owner_id,1) on conflict(owner_id) do update set revision=finance_learning_state.revision+1;
 return new;
end;$$;
create trigger remember_answer_after_save after insert or update of answer on finance_assistant_items for each row when(new.answer<>'') execute function finance_capture_answer_memory();
-- Index existing owner answers without rewriting them or inventing preferences.
insert into finance_answer_memories(id,owner_id) select id,owner_id from finance_assistant_items where answer<>'' and status<>'dismissed' on conflict do nothing;
create function finance_set_automatic_answer_memory(_enabled boolean) returns void language plpgsql security definer set search_path=public,pg_temp as $$declare u uuid:=auth.uid();begin
 if u is null or _enabled is null then raise exception 'Sign in and choose an answer memory preference';end if;
 perform pg_advisory_xact_lock(hashtextextended('learning:'||u::text,0));
 insert into finance_answer_memory_settings values(u,_enabled) on conflict(owner_id) do update set enabled=excluded.enabled;
 insert into finance_learning_state(owner_id,revision) values(u,1) on conflict(owner_id) do update set revision=finance_learning_state.revision+1;
end;$$;
create function finance_set_answer_memory(_id uuid,_expected integer,_enabled boolean) returns void language plpgsql security definer set search_path=public,pg_temp as $$declare u uuid:=auth.uid();begin
 if u is null or _enabled is null then raise exception 'Sign in and choose a memory preference';end if;
 perform pg_advisory_xact_lock(hashtextextended('learning:'||u::text,0));
 update finance_answer_memories set enabled=_enabled,revision=revision+1,updated_at=now() where id=_id and owner_id=u and revision=_expected;
 if not found then raise exception 'This saved answer changed. Refresh first';end if;
 insert into finance_learning_state(owner_id,revision) values(u,1) on conflict(owner_id) do update set revision=finance_learning_state.revision+1;
end;$$;
revoke all on function finance_capture_answer_memory(),finance_set_automatic_answer_memory(boolean),finance_set_answer_memory(uuid,integer,boolean) from public,anon;
grant execute on function finance_set_automatic_answer_memory(boolean),finance_set_answer_memory(uuid,integer,boolean) to authenticated;
commit;
