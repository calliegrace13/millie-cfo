BEGIN;
CREATE FUNCTION public.finance_remove_timeline_event(_date date,_expected jsonb) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r finance_allocations;e jsonb;n integer:=0;BEGIN
 IF auth.uid() IS NULL OR _date IS NULL OR _date<='0001-01-01' OR NOT isfinite(_date) OR jsonb_typeof(_expected) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Review a dated event first';END IF;
 IF jsonb_array_length(_expected) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Review between 1 and 100 account changes';END IF;
 PERFORM 1 FROM accounts WHERE user_id=auth.uid() ORDER BY id FOR UPDATE;
 IF (SELECT count(*) FROM finance_allocations WHERE owner_id=auth.uid() AND effective_from=_date)<>jsonb_array_length(_expected) THEN RAISE EXCEPTION 'This event changed. Reload and review it again.';END IF;
 IF (SELECT count(DISTINCT x->>'id') FROM jsonb_array_elements(_expected) x)<>jsonb_array_length(_expected) THEN RAISE EXCEPTION 'Each change must be reviewed once';END IF;
 FOR e IN SELECT value FROM jsonb_array_elements(_expected) LOOP
 SELECT * INTO r FROM finance_allocations WHERE id=(e->>'id')::uuid AND owner_id=auth.uid() AND effective_from=_date FOR UPDATE;
 IF NOT FOUND OR NOT(to_jsonb(r) @> e) THEN RAISE EXCEPTION 'This event changed or contains another person’s rule. Reload and review it again.';END IF;
 PERFORM finance_remove_arrangement(r.id,e);n:=n+1;
 END LOOP;RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.finance_remove_timeline_event(date,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finance_remove_timeline_event(date,jsonb) TO authenticated;
COMMIT;
