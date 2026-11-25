begin;
create function finance_answer_and_remember(_items jsonb,_answer text,_memory jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=auth.uid();answered jsonb;policy jsonb;source_id uuid;begin
 if u is null then raise exception 'Sign in first';end if;
 if jsonb_typeof(_memory) is distinct from 'object' or _memory->>'effect' is distinct from 'guidance' or (_memory->>'enabled')::boolean is distinct from true then raise exception 'Choose a reusable preference to remember';end if;
 -- Same owner/learning locks and order used by financial approvals. The answer
 -- and preference are one transaction, including stale-view and owner checks.
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 perform pg_advisory_xact_lock(hashtextextended('learning:'||u::text,0));
 answered:=finance_answer_question_group(_items,_answer);
 source_id:=(_items->0->>'id')::uuid;
 policy:=finance_save_learning_policy(null,0,_memory||jsonb_build_object('source_item_id',source_id));
 return answered||jsonb_build_object('policyId',policy->>'id','item',(select to_jsonb(i) from finance_assistant_items i where id=source_id and owner_id=u));
end;$$;
revoke all on function finance_answer_and_remember(jsonb,text,jsonb) from public,anon;
grant execute on function finance_answer_and_remember(jsonb,text,jsonb) to authenticated;
commit;
