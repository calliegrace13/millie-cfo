-- Existing connections are mapped lazily from Plaid's exact account IDs.
ALTER TABLE public.accounts ADD COLUMN plaid_item_id uuid
  REFERENCES public.plaid_items(id) ON DELETE SET NULL;
ALTER TABLE public.accounts ADD COLUMN archived_by_plaid_disconnect boolean NOT NULL DEFAULT false;
ALTER TABLE public.plaid_items ADD COLUMN disconnecting boolean NOT NULL DEFAULT false;
CREATE INDEX accounts_plaid_item_idx ON public.accounts (plaid_item_id);
CREATE INDEX transactions_plaid_lookup_idx ON public.transactions (user_id, plaid_transaction_id)
  WHERE plaid_transaction_id IS NOT NULL;

CREATE FUNCTION public.attach_plaid_accounts(p_item uuid, p_user uuid, p_accounts jsonb)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE a jsonb;
BEGIN
  PERFORM 1 FROM public.plaid_items WHERE id = p_item AND user_id = p_user AND NOT disconnecting FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bank connection unavailable'; END IF;
  FOR a IN SELECT value FROM jsonb_array_elements(p_accounts) LOOP
    IF nullif(a->>'account_id', '') IS NULL OR nullif(a->>'name', '') IS NULL OR nullif(a->>'type', '') IS NULL THEN
      RAISE EXCEPTION 'Invalid provider account';
    END IF;
    IF EXISTS (SELECT 1 FROM public.accounts WHERE user_id = p_user AND plaid_account_id = a->>'account_id'
      AND plaid_item_id IS NOT NULL AND plaid_item_id <> p_item) THEN
      RAISE EXCEPTION 'Provider account belongs to another connection';
    END IF;
    UPDATE public.accounts SET plaid_item_id = p_item,
      is_deleted = CASE WHEN archived_by_plaid_disconnect THEN false ELSE is_deleted END,
      deleted_at = CASE WHEN archived_by_plaid_disconnect THEN NULL ELSE deleted_at END,
      archived_by_plaid_disconnect = false,
      current_balance = (a->'balances'->>'current')::numeric,
      available_balance = (a->'balances'->>'available')::numeric
    WHERE user_id = p_user AND plaid_account_id = a->>'account_id'
      AND (plaid_item_id IS NULL OR plaid_item_id = p_item);
    IF NOT FOUND THEN
      INSERT INTO public.accounts (user_id, plaid_item_id, plaid_account_id, name, official_name, type,
        subtype, mask, current_balance, available_balance, currency, is_manual)
      VALUES (p_user, p_item, a->>'account_id', a->>'name', a->>'official_name', a->>'type', a->>'subtype',
        a->>'mask', (a->'balances'->>'current')::numeric, (a->'balances'->>'available')::numeric,
        coalesce(a->'balances'->>'iso_currency_code', 'USD'), false);
    END IF;
  END LOOP;
END;
$$;

CREATE FUNCTION public.stage_plaid_disconnect(p_item uuid, p_user uuid, p_accounts jsonb)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE staged boolean;
BEGIN
  SELECT disconnecting INTO STRICT staged FROM public.plaid_items WHERE id = p_item AND user_id = p_user FOR UPDATE;
  IF staged THEN RETURN; END IF;
  -- Legacy accounts can be claimed only by IDs returned by the selected Item.
  UPDATE public.accounts SET plaid_item_id = p_item
  WHERE user_id = p_user AND plaid_item_id IS NULL
    AND plaid_account_id IN (SELECT value->>'account_id' FROM jsonb_array_elements(p_accounts));
  UPDATE public.plaid_items SET disconnecting = true WHERE id = p_item AND user_id = p_user;
END;
$$;

CREATE FUNCTION public.finish_plaid_disconnect(p_item uuid, p_user uuid)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  PERFORM 1 FROM public.plaid_items WHERE id = p_item AND user_id = p_user AND disconnecting FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bank disconnection has not been staged'; END IF;
  UPDATE public.accounts SET is_deleted = true, deleted_at = now(), archived_by_plaid_disconnect = true
  WHERE user_id = p_user AND plaid_item_id = p_item AND is_deleted IS DISTINCT FROM true;
  DELETE FROM public.plaid_items WHERE id = p_item AND user_id = p_user;
END;
$$;

CREATE FUNCTION public.apply_plaid_sync(
  p_item uuid, p_user uuid, p_expected_cursor text, p_next_cursor text,
  p_accounts jsonb, p_added jsonb, p_modified jsonb, p_removed jsonb
) RETURNS integer LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  stored_cursor text;
  tx jsonb;
  modified boolean;
  account_row public.accounts%ROWTYPE;
  existing_id uuid;
  inserted_count integer := 0;
BEGIN
  SELECT cursor INTO STRICT stored_cursor FROM public.plaid_items
  WHERE id = p_item AND user_id = p_user AND NOT disconnecting FOR UPDATE;
  IF stored_cursor IS DISTINCT FROM p_expected_cursor THEN
    RAISE EXCEPTION 'Bank cursor changed; retry sync';
  END IF;

  PERFORM public.attach_plaid_accounts(p_item, p_user, p_accounts);

  FOR tx, modified IN
    SELECT value, is_modified FROM (
      SELECT value, false AS is_modified FROM jsonb_array_elements(p_added)
      UNION ALL
      SELECT value, true FROM jsonb_array_elements(p_modified)
    ) changes ORDER BY is_modified, (value->>'pending')::boolean DESC
  LOOP
    -- STRICT rejects unknown or ambiguous provider account IDs; never drop the row and advance.
    SELECT * INTO STRICT account_row FROM public.accounts
    WHERE user_id = p_user AND plaid_item_id = p_item AND plaid_account_id = tx->>'account_id';
    SELECT id INTO existing_id FROM public.transactions
    WHERE user_id = p_user AND account_id = account_row.id AND plaid_transaction_id = tx->>'transaction_id';

    IF existing_id IS NULL THEN
      -- Older imports sometimes left an exact provider transaction unattached.
      UPDATE public.transactions SET account_id = account_row.id, account_name = account_row.name
      WHERE user_id = p_user AND account_id IS NULL AND plaid_transaction_id = tx->>'transaction_id'
      RETURNING id INTO existing_id;
    END IF;

    IF existing_id IS NULL AND NOT (tx->>'pending')::boolean AND tx->>'pending_transaction_id' IS NOT NULL THEN
      UPDATE public.transactions SET plaid_transaction_id = tx->>'transaction_id',
        pending = false, name = tx->>'name', merchant_name = tx->>'merchant_name',
        amount = (tx->>'amount')::numeric, date = (tx->>'date')::date, subcategory = tx->>'subcategory'
      WHERE user_id = p_user AND account_id = account_row.id AND pending
        AND plaid_transaction_id = tx->>'pending_transaction_id'
      RETURNING id INTO existing_id;
    END IF;

    IF existing_id IS NULL THEN
      INSERT INTO public.transactions (user_id, account_id, account_name, plaid_transaction_id, name,
        merchant_name, amount, date, category, subcategory, pending, cash_flow_type, is_one_time_expense, income_type)
      VALUES (p_user, account_row.id, account_row.name, tx->>'transaction_id', tx->>'name',
        tx->>'merchant_name', (tx->>'amount')::numeric, (tx->>'date')::date, tx->>'category', tx->>'subcategory',
        (tx->>'pending')::boolean, coalesce(tx->>'cash_flow_type', 'operating')::public.cash_flow_category,
        coalesce((tx->>'is_one_time_expense')::boolean, false), CASE WHEN tx->>'category' = 'Income' THEN 'other' END);
      inserted_count := inserted_count + 1;
    ELSIF modified THEN
      -- Preserve user classification, review, notes and ownership.
      UPDATE public.transactions SET name = tx->>'name', merchant_name = tx->>'merchant_name',
        amount = (tx->>'amount')::numeric, date = (tx->>'date')::date,
        pending = (tx->>'pending')::boolean, subcategory = tx->>'subcategory'
      WHERE id = existing_id;
    END IF;
  END LOOP;

  DELETE FROM public.transactions t USING public.accounts a
  WHERE t.user_id = p_user AND a.user_id = p_user AND t.account_id = a.id AND a.plaid_item_id = p_item
    AND t.plaid_transaction_id IN (SELECT jsonb_array_elements_text(p_removed));

  IF p_next_cursor IS NOT NULL THEN
    UPDATE public.plaid_items SET cursor = p_next_cursor, last_synced_at = now()
    WHERE id = p_item AND user_id = p_user;
  END IF;
  RETURN inserted_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.attach_plaid_accounts(uuid,uuid,jsonb),
  public.stage_plaid_disconnect(uuid,uuid,jsonb), public.finish_plaid_disconnect(uuid,uuid),
  public.apply_plaid_sync(uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attach_plaid_accounts(uuid,uuid,jsonb),
  public.stage_plaid_disconnect(uuid,uuid,jsonb), public.finish_plaid_disconnect(uuid,uuid),
  public.apply_plaid_sync(uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb) TO service_role;
