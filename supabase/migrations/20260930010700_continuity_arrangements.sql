BEGIN;
-- Reconnected sources keep the original logical account's dated arrangements.
DO $$ DECLARE r record;definition text;BEGIN
 FOR r IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('finance_account_transition','finance_transaction_history','finance_apply_lifecycle','finance_end_arrangements') LOOP
 definition:=pg_get_functiondef(r.oid);
 IF position('AND NOT coalesce(is_deleted,false)' IN definition)=0 THEN RAISE EXCEPTION 'Expected account guard missing';END IF;
 definition:=replace(definition,'AND NOT coalesce(is_deleted,false)','AND (NOT coalesce(is_deleted,false) OR id IN (SELECT original_id FROM finance_account_continuity))');
 EXECUTE definition;
 END LOOP;
END $$;
COMMIT;
