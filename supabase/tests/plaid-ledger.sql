-- Run after applying migrations to a disposable Supabase database:
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/plaid-ledger.sql
BEGIN;
DO $test$
DECLARE
  u uuid := gen_random_uuid();
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  acct_a jsonb := '[{"account_id":"account-a","name":"Checking","type":"depository","balances":{"current":100}}]';
  acct_b jsonb := '[{"account_id":"account-b","name":"Checking","type":"depository","balances":{"current":200}}]';
  purchase jsonb := '{"account_id":"account-a","transaction_id":"a-1","amount":10,"date":"2026-11-01","name":"Cafe","pending":false,"category":"Food"}';
  pending_purchase jsonb := purchase || '{"transaction_id":"pending-a","pending":true}';
  posted_purchase jsonb := purchase || '{"transaction_id":"posted-a","pending_transaction_id":"pending-a","amount":12,"date":"2026-11-03"}';
  original_id uuid;
  expected_error boolean := false;
BEGIN
  INSERT INTO auth.users (id) VALUES (u);
  INSERT INTO public.plaid_items (id, user_id, item_id, access_token)
    VALUES (a, u, 'test-a-' || a, 'test-token'), (b, u, 'test-b-' || b, 'test-token');
  INSERT INTO public.accounts (user_id, plaid_account_id, name, type, is_deleted)
    VALUES (u, 'account-a', 'Legacy A', 'depository', false);
  PERFORM public.attach_plaid_accounts(b, u, acct_b);

  PERFORM public.apply_plaid_sync(a, u, NULL, 'cursor-1', acct_a,
    jsonb_build_array(purchase, purchase || '{"transaction_id":"a-2"}', pending_purchase), '[]', '[]');
  PERFORM public.apply_plaid_sync(b, u, NULL, 'cursor-b', acct_b,
    jsonb_build_array(purchase || '{"transaction_id":"b-1","account_id":"account-b"}'), '[]', '[]');
  IF (SELECT count(*) FROM public.transactions WHERE user_id = u) <> 4 THEN
    RAISE EXCEPTION 'Distinct equal purchases must survive within and across accounts';
  END IF;
  SELECT id INTO STRICT original_id FROM public.transactions WHERE user_id = u AND plaid_transaction_id = 'pending-a';
  UPDATE public.transactions SET category = 'My correction' WHERE id = original_id;
  PERFORM public.apply_plaid_sync(a, u, 'cursor-1', 'cursor-2', acct_a,
    jsonb_build_array(posted_purchase, purchase), '[]', '["pending-a"]');
  IF NOT EXISTS (SELECT 1 FROM public.transactions WHERE id = original_id AND plaid_transaction_id = 'posted-a'
    AND amount = 12 AND date = '2026-11-03' AND category = 'My correction' AND NOT pending)
    OR (SELECT count(*) FROM public.transactions WHERE user_id = u) <> 4 THEN
    RAISE EXCEPTION 'Pending posting or replay did not preserve ledger identity';
  END IF;

  BEGIN
    PERFORM public.apply_plaid_sync(a, u, 'cursor-2', 'bad-cursor', acct_a,
      jsonb_build_array(purchase || '{"transaction_id":"rollback-a","pending":true}',
        purchase || '{"transaction_id":"bad-a","account_id":"unknown"}'), '[]', '[]');
  EXCEPTION WHEN no_data_found THEN expected_error := true;
  END;
  IF NOT expected_error OR (SELECT cursor FROM public.plaid_items WHERE id = a) IS DISTINCT FROM 'cursor-2'
    OR EXISTS (SELECT 1 FROM public.transactions WHERE user_id = u AND plaid_transaction_id = 'rollback-a') THEN
    RAISE EXCEPTION 'Failed write did not roll back transactions and cursor';
  END IF;

  UPDATE public.accounts SET plaid_item_id = NULL WHERE user_id = u AND plaid_account_id = 'account-a';
  PERFORM public.stage_plaid_disconnect(a, u, acct_a);
  PERFORM public.finish_plaid_disconnect(a, u);
  IF EXISTS (SELECT 1 FROM public.plaid_items WHERE id = a)
    OR NOT EXISTS (SELECT 1 FROM public.plaid_items WHERE id = b)
    OR NOT EXISTS (SELECT 1 FROM public.accounts WHERE user_id = u AND plaid_account_id = 'account-a' AND is_deleted)
    OR NOT EXISTS (SELECT 1 FROM public.accounts WHERE user_id = u AND plaid_account_id = 'account-b' AND is_deleted IS DISTINCT FROM true)
    OR (SELECT count(*) FROM public.transactions WHERE user_id = u) <> 4 THEN
    RAISE EXCEPTION 'Disconnection must affect only its bank and preserve transaction history';
  END IF;

  INSERT INTO public.plaid_items (id, user_id, item_id, access_token)
    VALUES (a, u, 'relinked-a-' || a, 'test-token');
  PERFORM public.attach_plaid_accounts(a, u, acct_a);
  IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE user_id = u AND plaid_account_id = 'account-a'
    AND plaid_item_id = a AND NOT is_deleted) THEN
    RAISE EXCEPTION 'Exact account relink did not restore the existing account';
  END IF;
END;
$test$;
ROLLBACK;
