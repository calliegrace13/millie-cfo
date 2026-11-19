BEGIN;
CREATE OR REPLACE FUNCTION public.finance_reserve_goal(_account uuid,_name text,_reserved numeric,_target numeric,_deadline date DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a accounts; pct numeric; used numeric; result uuid; BEGIN
 SELECT * INTO a FROM accounts WHERE id=_account AND user_id=auth.uid() AND NOT coalesce(is_deleted,false) FOR UPDATE;
 IF NOT FOUND OR a.type NOT IN ('checking','savings','depository') OR _reserved IS NULL OR _target IS NULL OR _reserved<0 OR _reserved::text IN ('NaN','Infinity','-Infinity') OR _target::text IN ('NaN','Infinity','-Infinity') OR _target<=0 OR _reserved>_target OR length(trim(_name)) NOT BETWEEN 1 AND 150 THEN RAISE EXCEPTION 'Choose your cash account, a name, and valid funding amounts'; END IF;
 IF EXISTS(SELECT 1 FROM finance_account_sharing WHERE account_id=a.id AND duplicate_of IS NOT NULL) THEN RAISE EXCEPTION 'Use the primary account for goal funding, not its duplicate'; END IF;
 SELECT coalesce(balance_pct,owner_pct) INTO pct FROM finance_allocations WHERE account_id=a.id AND effective_from<=current_date ORDER BY effective_from DESC LIMIT 1;
 SELECT coalesce(sum((payload->>'reserved')::numeric),0) INTO used FROM finance_documents WHERE owner_id=auth.uid() AND kind='goal' AND payload->>'accountId'=_account::text;
 IF used+_reserved>greatest(0,CASE WHEN a.is_zero_balance THEN 0 ELSE coalesce(a.current_balance,0) END)*coalesce(pct,100)/100 THEN RAISE EXCEPTION 'Reservations exceed your current share of this account'; END IF;
 INSERT INTO finance_documents(owner_id,kind,name,payload) VALUES(auth.uid(),'goal',trim(_name),jsonb_build_object('accountId',_account,'currency',coalesce(a.currency,'USD'),'reserved',_reserved,'target',_target,'deadline',_deadline)) RETURNING id INTO result;RETURN result;
END $$;
COMMIT;
