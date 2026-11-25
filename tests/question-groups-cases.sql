do $$declare u uuid:=gen_random_uuid();v uuid:=gen_random_uuid();a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();foreign_id uuid:=gen_random_uuid();r jsonb;blocked boolean;begin
 insert into auth.users values(u),(v);
 insert into finance_assistant_items(id,owner_id,module,task,kind,payload,status) values(a,u,'transactions','categories','question','{"question":"First purchase?"}','needs_input'),(b,u,'transactions','categories','question','{"question":"Second purchase?"}','needs_input'),(foreign_id,v,'transactions','categories','question','{"question":"Other owner?"}','needs_input');
 perform set_config('request.jwt.claim.sub',u::text,true);
 blocked:=false;begin perform finance_answer_question_group(jsonb_build_array(jsonb_build_object('id',a,'revision',1),jsonb_build_object('id',foreign_id,'revision',1)),'Books');exception when raise_exception then blocked:=true;end;if not blocked or exists(select 1 from finance_assistant_items where answer<>'') then raise exception 'Mixed-owner selection was not atomic';end if;
 blocked:=false;begin perform finance_answer_question_group(jsonb_build_array(jsonb_build_object('id',a,'revision',1),jsonb_build_object('id',b,'revision',2)),'Books');exception when raise_exception then blocked:=true;end;if not blocked or exists(select 1 from finance_assistant_items where answer<>'') then raise exception 'Stale revision partially saved';end if;
 r:=finance_answer_question_group(jsonb_build_array(jsonb_build_object('id',a,'revision',1),jsonb_build_object('id',b,'revision',1)),' Books, except the gift noted separately. ');
 if (r->>'answered')::int<>2 or (select count(*) from finance_assistant_items where owner_id=u and answer='Books, except the gift noted separately.' and revision=2 and status='needs_input')<>2 then raise exception 'Shared answer lost scope, revision or content';end if;
 if (select count(distinct group_id) from finance_question_answer_groups where owner_id=u)<>1 or (select count(*) from finance_assistant_history where owner_id=u and action='answer')<>2 then raise exception 'Answer membership or audit missing';end if;
 blocked:=false;begin perform finance_answer_question_group(jsonb_build_array(jsonb_build_object('id',a,'revision',2)),'Overwrite');exception when raise_exception then blocked:=true;end;if not blocked then raise exception 'Existing answer overwritten';end if;
 perform finance_assistant_update(a,2,'answer','{"answer":"Corrected only this purchase"}');
 if (select revision from finance_assistant_items where id=a)=(select answer_revision from finance_question_answer_groups where id=a) then raise exception 'Individual revision was not distinguishable from original shared answer';end if;
 if (select answer from finance_assistant_items where id=b)<>'Books, except the gift noted separately.' then raise exception 'Individual edit changed sibling answer';end if;
 if has_table_privilege('authenticated','finance_question_answer_groups','INSERT') or has_function_privilege('anon','finance_answer_question_group(jsonb,text)','EXECUTE') then raise exception 'Unsafe answer access';end if;
 perform set_config('request.jwt.claim.sub','',true);blocked:=false;begin perform finance_answer_question_group('[]','No');exception when raise_exception then blocked:=true;end;if not blocked then raise exception 'Anonymous answer accepted';end if;
end;$$;
rollback;
