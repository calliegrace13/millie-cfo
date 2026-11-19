begin;
create temp table apf as select s.owner_id u,(select id from auth.users where id<>s.owner_id limit 1) partner from finance_ai_settings s where s.active_provider is not null limit 1;
grant select on apf to authenticated;
create temp table ap_ledger as select count(*) n,sum(amount) amount from transactions;
set local role authenticated;
do $$declare f record;blocked boolean;r integer;begin
 select * into strict f from apf;perform set_config('request.jwt.claim.sub',f.u::text,true);
 perform finance_configure_autopilot(true,0);
 if not exists(select 1 from finance_autopilot_settings where enabled and provider is not null and model is not null) then raise exception 'Missing pinned consent';end if;
 if not exists(select 1 from finance_ai_policies where owner_id=f.u and module='transactions' and mode='ai' and array['categories','receipts']<@tasks and array['categories','receipts']<@auto_tasks) then raise exception 'Core task setup missing';end if;
 select revision into r from finance_autopilot_settings;
 blocked:=false;begin perform finance_configure_autopilot(false,0);exception when raise_exception then blocked:=true;end;if not blocked then raise exception 'Stale settings accepted';end if;
 blocked:=false;begin perform finance_configure_autopilot(false,null);exception when raise_exception then blocked:=true;end;if not blocked then raise exception 'Null revision accepted';end if;
 blocked:=false;begin update finance_autopilot_settings set enabled=false;exception when insufficient_privilege then blocked:=true;end;if not blocked then raise exception 'Direct setting writes accepted';end if;
 blocked:=false;begin perform lease from finance_autopilot_settings;exception when insufficient_privilege then blocked:=true;end;if not blocked then raise exception 'Lease exposed';end if;
 blocked:=false;begin perform finance_autopilot_begin(f.u);exception when insufficient_privilege then blocked:=true;end;if not blocked then raise exception 'Client could claim another owner';end if;
 perform set_config('request.jwt.claim.sub',f.partner::text,true);if exists(select 1 from finance_autopilot_settings where owner_id=f.u) then raise exception 'Partner saw private consent';end if;
end;$$;
reset role;
do $$declare f record;a jsonb;b jsonb;begin
 select * into f from apf;a:=finance_autopilot_begin(f.u);b:=finance_autopilot_begin(f.u);
 if a->>'lease' is null or b->>'busy'<>'true' then raise exception 'Concurrent worker not excluded';end if;
 perform finance_autopilot_end(f.u,gen_random_uuid(),'idle','Wrong lease','[]');if not exists(select 1 from finance_autopilot_settings where owner_id=f.u and lease=(a->>'lease')::uuid) then raise exception 'Wrong worker released lease';end if;
 perform finance_autopilot_end(f.u,(a->>'lease')::uuid,'idle','Synthetic check','[]');
 insert into finance_autopilot_work(owner_id,fingerprint,kind,payload) values(f.u,'autopilot-fixture','receipts','{"receiptIds":["synthetic"]}');
end;$$;
set local role authenticated;
do $$declare f record;rev integer;blocked boolean;begin
 select * into f from apf;perform set_config('request.jwt.claim.sub',f.partner::text,true);if exists(select 1 from finance_autopilot_work where fingerprint='autopilot-fixture') then raise exception 'Partner saw saved work';end if;
 perform set_config('request.jwt.claim.sub',f.u::text,true);if not exists(select 1 from finance_autopilot_work where fingerprint='autopilot-fixture') then raise exception 'Owner lost saved work';end if;
 blocked:=false;begin update finance_autopilot_work set status='done';exception when insufficient_privilege then blocked:=true;end;if not blocked then raise exception 'Client bypassed task service';end if;
 select revision into rev from finance_autopilot_settings;perform finance_configure_autopilot(false,rev);if exists(select 1 from finance_autopilot_settings where enabled) then raise exception 'Pause failed';end if;
end;$$;
reset role;
do $$begin if exists(select 1 from ap_ledger old where old.n<>(select count(*) from transactions) or old.amount is distinct from (select sum(amount) from transactions)) then raise exception 'Setup changed ledger';end if;end;$$;
rollback;
