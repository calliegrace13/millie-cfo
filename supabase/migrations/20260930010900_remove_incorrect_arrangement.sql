BEGIN;
CREATE FUNCTION public.finance_remove_arrangement(_id uuid,_expected jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r finance_allocations;a uuid;BEGIN
 SELECT account_id INTO a FROM finance_allocations WHERE id=_id AND owner_id=auth.uid();
 IF a IS NULL THEN RAISE EXCEPTION 'Change unavailable or not owned by you. Reload the timeline.';END IF;
 PERFORM 1 FROM accounts WHERE id=a AND user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Only your own account changes can be removed';END IF;
 SELECT * INTO r FROM finance_allocations WHERE id=_id AND owner_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Change already removed. Reload the timeline.';END IF;
 IF r.effective_from='0001-01-01' THEN RAISE EXCEPTION 'The starting default cannot be removed';END IF;
 IF _expected IS NULL OR _expected='{}'::jsonb OR NOT (to_jsonb(r) @> _expected) THEN RAISE EXCEPTION 'This change was edited. Reload and review it again.';END IF;
 DELETE FROM finance_allocations WHERE id=_id;
END $$;
REVOKE ALL ON FUNCTION public.finance_remove_arrangement(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finance_remove_arrangement(uuid,jsonb) TO authenticated;
COMMIT;
