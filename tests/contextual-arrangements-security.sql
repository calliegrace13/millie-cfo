BEGIN;
CREATE TEMP TABLE context_fixture AS SELECT user_id owner_id,partner_user_id partner_id,gen_random_uuid() a,gen_random_uuid() b,gen_random_uuid() c FROM partner_links WHERE status='active' LIMIT 1;
GRANT SELECT ON context_fixture TO authenticated;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM context_fixture) THEN RAISE EXCEPTION 'Active pair required';END IF;END $$;
INSERT INTO accounts(id,user_id,name,type,currency) SELECT a,owner_id,'Context A','checking','USD' FROM context_fixture UNION ALL SELECT b,owner_id,'Context B','credit','USD' FROM context_fixture UNION ALL SELECT c,owner_id,'Context rollback','checking','USD' FROM context_fixture;
INSERT INTO finance_allocations(account_id,owner_id,partner_id,effective_from,owner_pct,balance_pct,included,note) SELECT c,owner_id,owner_id,'0001-01-01',100,25,false,'Prior balance ownership' FROM context_fixture ON CONFLICT(account_id,effective_from) DO UPDATE SET balance_pct=25,partner_id=excluded.partner_id;
CREATE FUNCTION pg_temp.context_entry(a uuid,d date,pct numeric,before_pct numeric DEFAULT NULL,cats jsonb DEFAULT '[]') RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('account_id',a,'expense_pct',pct,'balance_pct',null,'expected_id',r.id,'expected_expense',r.owner_pct,'expected_balance',coalesce(r.balance_pct,r.owner_pct),'before_pct',before_pct,'category_overrides',cats,
 'expected_history',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'effective_from',effective_from,'owner_pct',owner_pct,'balance_pct',balance_pct,'included',included,'partner_id',partner_id,'note',note) ORDER BY id),'[]') FROM finance_allocations WHERE account_id=a AND effective_from<=d),
 'expected_categories',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'category',category,'effective_from',effective_from,'owner_pct',owner_pct,'partner_id',partner_id) ORDER BY id),'[]') FROM finance_category_splits WHERE account_id=a))
 FROM (SELECT 1) seed LEFT JOIN LATERAL(SELECT * FROM finance_allocations WHERE account_id=a AND effective_from<=d ORDER BY effective_from DESC LIMIT 1) r ON true
$$;
SET LOCAL ROLE authenticated;
DO $$ DECLARE f record;e jsonb;blocked boolean;n integer;BEGIN
 SELECT * INTO f FROM context_fixture;PERFORM set_config('request.jwt.claim.sub',f.owner_id::text,true);
 PERFORM finance_schedule(ARRAY[f.a,f.b],current_date+30,80,true,'Later event');
 PERFORM finance_save_arrangement_details('1900-01-01',jsonb_build_array(pg_temp.context_entry(f.a,'1900-01-01',50,100,'[{"category":"Food","pct":30}]'),pg_temp.context_entry(f.b,'1900-01-01',60,0)),'sharing');
 IF (SELECT owner_pct FROM finance_allocations WHERE account_id=f.a AND effective_from='0001-01-01')<>100 OR (SELECT owner_pct FROM finance_allocations WHERE account_id=f.b AND effective_from='0001-01-01')<>0 THEN RAISE EXCEPTION 'Earlier ownership not saved';END IF;
 IF (SELECT count(*) FROM finance_allocations WHERE account_id IN(f.a,f.b) AND effective_from=current_date+30 AND owner_pct=80)<>2 THEN RAISE EXCEPTION 'Later rules changed';END IF;
 IF (SELECT balance_pct FROM finance_allocations WHERE account_id=f.b AND effective_from='0001-01-01')<>100 THEN RAISE EXCEPTION 'Earlier balance ownership changed';END IF;
 IF (SELECT owner_pct FROM finance_category_splits WHERE account_id=f.a AND category='Food')<>30 THEN RAISE EXCEPTION 'Category not saved with event';END IF;
 SELECT count(*) INTO n FROM finance_lifecycle_events WHERE owner_id=f.owner_id;
 PERFORM finance_save_arrangement_details('1900-01-01',jsonb_build_array(pg_temp.context_entry(f.a,'1900-01-01',70,null,'[{"category":"food","pct":40}]')));
 IF (SELECT count(*) FROM finance_category_splits WHERE account_id=f.a AND lower(category)='food')<>1 OR (SELECT owner_pct FROM finance_category_splits WHERE account_id=f.a AND category='Food')<>40 THEN RAISE EXCEPTION 'Category edit duplicated case or failed';END IF;
 IF (SELECT count(*) FROM finance_lifecycle_events WHERE owner_id=f.owner_id)<>n THEN RAISE EXCEPTION 'Timeline edit created unrelated lifecycle transition';END IF;
 IF (SELECT owner_pct FROM finance_allocations WHERE account_id=f.a AND effective_from='1900-01-01')<>70 THEN RAISE EXCEPTION 'Timeline split not updated';END IF;
 e:=jsonb_build_array(pg_temp.context_entry(f.a,'1900-01-01',90));
 PERFORM finance_category_split(f.a,'Food','1900-01-01',45);
 blocked:=false;BEGIN PERFORM finance_save_arrangement_details('1900-01-01',e);EXCEPTION WHEN raise_exception THEN blocked:=true;END;
 IF NOT blocked OR (SELECT owner_pct FROM finance_allocations WHERE account_id=f.a AND effective_from='1900-01-01')<>70 THEN RAISE EXCEPTION 'Stale category preview accepted';END IF;
 e:=jsonb_build_array(pg_temp.context_entry(f.a,'1900-01-01',90));
 PERFORM set_config('request.jwt.claim.sub',f.partner_id::text,true);
 blocked:=false;BEGIN PERFORM finance_save_arrangement_details('1900-01-01',e);EXCEPTION WHEN raise_exception THEN blocked:=true;END;IF NOT blocked THEN RAISE EXCEPTION 'Other owner edited event';END IF;
 PERFORM set_config('request.jwt.claim.sub',f.owner_id::text,true);
 blocked:=false;BEGIN PERFORM finance_save_arrangement_details('1899-01-01',jsonb_build_array(pg_temp.context_entry(f.a,'1899-01-01',50),pg_temp.context_entry(f.c,'1899-01-01',50)),'sharing');EXCEPTION WHEN raise_exception THEN blocked:=true;END;
 IF NOT blocked OR EXISTS(SELECT 1 FROM finance_allocations WHERE account_id IN(f.a,f.c) AND effective_from='1899-01-01') THEN RAISE EXCEPTION 'Failed multi-account save partially committed';END IF;
 IF EXISTS(SELECT 1 FROM finance_account_sharing WHERE account_id IN(f.a,f.b,f.c) AND enabled) THEN RAISE EXCEPTION 'Save granted sharing access';END IF;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'PASS: atomic creation and timeline edits, earlier ownership, category consistency, later rules/balances preserved, stale preview rejection, owner isolation, rollback and no sharing changes. Fixtures rolled back.' AS result;
