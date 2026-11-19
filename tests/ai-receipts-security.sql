begin;
create temp table ai_fixture as select id u,(select id from auth.users where id<>a.id limit 1) p,gen_random_uuid() req from auth.users a limit 1;
grant select on ai_fixture to authenticated,service_role;
set local role service_role;
do $$declare f record;j jsonb;blocked boolean;begin
 select * into strict f from ai_fixture;
 perform finance_ai_connect(f.u,'openai','fixture-model',repeat('x',80),'test',1,null);
 blocked:=false;begin perform finance_ai_connect(f.u,'openai','fixture-model',repeat('y',80),'test',1,null);exception when raise_exception then blocked:=true;end;if not blocked then raise exception 'Stale connection accepted';end if;
 j:=finance_ai_reserve(f.u,f.req,repeat('a',64));if j->>'status'<>'new' then raise exception 'Reserve failed';end if;
 if finance_ai_reserve(f.u,f.req,repeat('a',64))->>'status'<>'running' then raise exception 'Replay did not reuse job';end if;
 blocked:=false;begin perform finance_ai_reserve(f.u,f.req,repeat('b',64));exception when raise_exception then blocked:=true;end;if not blocked then raise exception 'Replay payload mismatch accepted';end if;
 update finance_ai_receipt_runs set status='failed' where owner_id=f.u and request_id=f.req;
 blocked:=false;begin perform finance_ai_reserve(f.u,gen_random_uuid(),repeat('c',64));exception when raise_exception then blocked:=true;end;if not blocked then raise exception 'Failed requests bypassed cap';end if;
end;$$;
reset role;set local role authenticated;
do $$declare f record;j jsonb;blocked boolean;begin
 select * into strict f from ai_fixture;perform set_config('request.jwt.claim.sub',f.u::text,true);j:=finance_ai_status();if j->>'active'<>'openai' or j::text like '%credential%' then raise exception 'Unsafe or missing metadata';end if;
 blocked:=false;begin perform credential from finance_ai_connections;exception when insufficient_privilege then blocked:=true;end;if not blocked then raise exception 'Browser could read API credentials';end if;
 blocked:=false;begin perform finance_ai_choose(f.u,'openai',true);exception when insufficient_privilege then blocked:=true;end;if not blocked then raise exception 'Browser bypassed authenticated service';end if;
 if f.p is not null then perform set_config('request.jwt.claim.sub',f.p::text,true);if finance_ai_status()->>'active'='openai' then raise exception 'Partner inherited private provider';end if;end if;
end;$$;
reset role;set local role service_role;
do $$declare f record;begin select * into strict f from ai_fixture;perform finance_ai_choose(f.u,'openai',true);if exists(select 1 from finance_ai_connections where owner_id=f.u) or exists(select 1 from finance_ai_settings where owner_id=f.u and active_provider is not null) then raise exception 'Disconnect kept credential or fallback';end if;end;$$;
reset role;rollback;
