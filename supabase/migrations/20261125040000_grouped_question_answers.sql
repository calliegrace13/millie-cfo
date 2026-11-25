begin;
create table finance_question_answer_groups(
 id uuid primary key references finance_assistant_items(id) on delete cascade,
 owner_id uuid not null references auth.users(id),group_id uuid not null,answer_revision integer not null,created_at timestamptz not null default now()
);
alter table finance_question_answer_groups enable row level security;
revoke all on finance_question_answer_groups from public,anon,authenticated;
grant select on finance_question_answer_groups to authenticated;
grant all on finance_question_answer_groups to service_role;
create policy own_question_answer_groups on finance_question_answer_groups for select to authenticated using(owner_id=auth.uid());
create function finance_answer_question_group(_items jsonb,_answer text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=auth.uid();g uuid:=gen_random_uuid();entry jsonb;w finance_assistant_items;n integer:=0;begin
 if u is null then raise exception 'Sign in first';end if;
 if jsonb_typeof(_items) is distinct from 'array' or jsonb_array_length(_items) not between 1 and 200 or length(trim(coalesce(_answer,''))) not between 1 and 4000 then raise exception 'Choose up to 200 questions and enter an answer';end if;
 if (select count(distinct value->>'id') from jsonb_array_elements(_items))<>jsonb_array_length(_items) then raise exception 'Each question may be selected only once';end if;
 -- Validate and lock the complete selection before saving any answer. An old
 -- browser view cannot overwrite a response or half-save a group.
 for entry in select value from jsonb_array_elements(_items) order by value->>'id' loop
  select * into w from finance_assistant_items where id=(entry->>'id')::uuid and owner_id=u for update;
  if not found or w.revision<>(entry->>'revision')::integer or entry->>'revision' is null or w.kind<>'question' or w.status<>'needs_input' or w.answer<>'' then raise exception 'A selected question changed. Refresh before saving; no answers were changed';end if;
 end loop;
 for entry in select value from jsonb_array_elements(_items) order by value->>'id' loop
  perform finance_assistant_update((entry->>'id')::uuid,(entry->>'revision')::integer,'answer',jsonb_build_object('answer',trim(_answer)));
  insert into finance_question_answer_groups(id,owner_id,group_id,answer_revision) values((entry->>'id')::uuid,u,g,(entry->>'revision')::integer+1)
  on conflict(id) do update set group_id=excluded.group_id,answer_revision=excluded.answer_revision,created_at=now();n:=n+1;
 end loop;
 return jsonb_build_object('groupId',g,'answered',n);
end;$$;
revoke all on function finance_answer_question_group(jsonb,text) from public,anon;
grant execute on function finance_answer_question_group(jsonb,text) to authenticated;
commit;
