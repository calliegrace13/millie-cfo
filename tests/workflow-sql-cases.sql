do $$declare u uuid:=gen_random_uuid();other uuid:=gen_random_uuid();blocked boolean;n int;begin
 perform set_config('request.jwt.claim.sub',u::text,true);
 insert into finance_module_preferences values(u,array['analyst']);
 insert into finance_ai_policies values(u,'transactions','manual',array['categories'],array['categories'],false,false,1,now());
 insert into finance_ai_policies values(u,'investments','manual',array['review'],'{}',false,false,1,now());
 insert into finance_autopilot_work values(u,'failed');
 perform finance_start_ai_workflow(0);
 if not exists(select 1 from finance_autopilot_settings where owner_id=u and enabled and background_enabled and workflow_scope='all_enabled' and revision=1) then raise exception 'Expanded opt-in not saved';end if;
 if not exists(select 1 from finance_ai_policies where owner_id=u and module='analyst' and mode='ai' and tasks=array['review'] and auto_tasks='{}') then raise exception 'Visible review not enabled as proposal only';end if;
 if not exists(select 1 from finance_ai_policies where owner_id=u and module='transactions' and auto_tasks=array['categories'] and not use_web and not use_receipts) then raise exception 'Existing permission was expanded';end if;
 if not exists(select 1 from finance_ai_policies where owner_id=u and module='investments' and mode='manual') then raise exception 'Hidden module changed';end if;
 if not exists(select 1 from finance_autopilot_work where owner_id=u and status='failed') then raise exception 'Failed call silently retried';end if;
 blocked:=false;begin perform finance_start_ai_workflow(0);exception when raise_exception then blocked:=true;end;if not blocked then raise exception 'Stale settings accepted';end if;
 -- A repeated user start must not bump unchanged policy revisions and cause paid replay.
 n:=(select revision from finance_ai_policies where owner_id=u and module='analyst');
 perform finance_start_ai_workflow(1);
 if (select revision from finance_ai_policies where owner_id=u and module='analyst')<>n then raise exception 'Repeated start changed evidence permissions';end if;
 perform set_config('fixture.daily','0',true);blocked:=false;begin perform finance_start_ai_workflow(2);exception when raise_exception then blocked:=true;end;if not blocked then raise exception 'Zero dollar limit accepted';end if;
 perform set_config('fixture.daily','1000000',true);perform set_config('fixture.pricing','false',true);blocked:=false;begin perform finance_start_ai_workflow(2);exception when raise_exception then blocked:=true;end;if not blocked then raise exception 'Unpriced model accepted';end if;perform set_config('fixture.pricing','true',true);
 insert into finance_autopilot_settings(owner_id,enabled,background_enabled,next_run_at,failure_count,status,revision) values(other,true,true,now(),0,'error',1);
 insert into finance_autopilot_work values(other,'failed');
 n:=finance_dispatch_autopilot();
 if n<>1 or not exists(select 1 from net.requests where body->>'workerOwner'=u::text) or exists(select 1 from net.requests where body->>'workerOwner'=other::text) then raise exception 'Scheduler expanded a legacy user or blocked opted-in independent work';end if;
 if not exists(select 1 from finance_autopilot_settings where owner_id=other and workflow_scope='core') then raise exception 'Legacy default changed';end if;
end;$$;
rollback;
