BEGIN;
CREATE TEMP TABLE finance_invite_test AS SELECT (array_agg(id ORDER BY id))[1] a,(array_agg(id ORDER BY id))[2] b FROM auth.users WHERE id NOT IN(SELECT user_id FROM partner_links WHERE status='active' UNION SELECT partner_user_id FROM partner_links WHERE status='active');
GRANT SELECT ON finance_invite_test TO authenticated;
SET LOCAL ROLE authenticated;
DO $$ DECLARE t record; invitation json; answer json; test_account uuid; blocked boolean; BEGIN
 SELECT * INTO t FROM finance_invite_test;
 IF t.a IS NULL OR t.b IS NULL THEN RAISE EXCEPTION 'Need unlinked fixture users'; END IF;
 PERFORM set_config('request.jwt.claim.sub',t.a::text,true);
 invitation:=finance_invite();
 IF length(invitation->>'pairing_code')<>32 OR (invitation->>'expires_at')::timestamptz<=now() OR (invitation->>'expires_at')::timestamptz>now()+interval '16 minutes' THEN RAISE EXCEPTION 'Invitation entropy or expiry failed'; END IF;
 PERFORM set_config('request.jwt.claim.sub',t.b::text,true);
 answer:=redeem_partner_code(invitation->>'pairing_code'); IF NOT coalesce((answer->>'success')::boolean,false) THEN RAISE EXCEPTION 'Valid invitation failed'; END IF;
 answer:=redeem_partner_code(invitation->>'pairing_code'); IF answer->>'error' IS NULL THEN RAISE EXCEPTION 'Invitation replay accepted'; END IF;
 PERFORM set_config('request.jwt.claim.sub',t.a::text,true);
 blocked:=false;BEGIN PERFORM finance_invite(); EXCEPTION WHEN raise_exception THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'Active member generated another invitation';END IF;
 INSERT INTO accounts(user_id,name,type,current_balance,currency) VALUES(t.a,'Initial setup rollback test','checking',0,'USD') RETURNING id INTO test_account;
 PERFORM finance_initialize(ARRAY[test_account],current_date-30,60,true,'Explicit initial setup');
 blocked:=false;BEGIN PERFORM finance_initialize(ARRAY[test_account],current_date-60,50,true,'Repeat initial setup');EXCEPTION WHEN raise_exception THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'Initial setup repeated';END IF;
 PERFORM finance_schedule(ARRAY[test_account],current_date+10,50,true,'Future');
 PERFORM finance_cancel_schedule((SELECT id FROM finance_allocations WHERE finance_allocations.account_id=test_account AND effective_from=current_date+10));
 IF NOT EXISTS(SELECT 1 FROM finance_allocation_audit WHERE finance_allocation_audit.account_id=test_account AND operation='DELETE') THEN RAISE EXCEPTION 'Cancellation audit missing';END IF;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'PASS: cryptographic invitation length, expiry, redemption, replay protection, one pair, one-time initial history, future cancellation audit. All test records rolled back.' AS result;

