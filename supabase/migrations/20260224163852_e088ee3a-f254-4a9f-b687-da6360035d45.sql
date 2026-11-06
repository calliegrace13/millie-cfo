
-- Add billing cycle fields to credit_cards
ALTER TABLE public.credit_cards
  ADD COLUMN statement_close_day integer,
  ADD COLUMN payment_due_day integer;

-- Validate day-of-month range via trigger
CREATE OR REPLACE FUNCTION public.validate_credit_card_days()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.statement_close_day IS NOT NULL AND (NEW.statement_close_day < 1 OR NEW.statement_close_day > 31) THEN
    RAISE EXCEPTION 'statement_close_day must be between 1 and 31';
  END IF;
  IF NEW.payment_due_day IS NOT NULL AND (NEW.payment_due_day < 1 OR NEW.payment_due_day > 31) THEN
    RAISE EXCEPTION 'payment_due_day must be between 1 and 31';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_credit_card_days_trigger
  BEFORE INSERT OR UPDATE ON public.credit_cards
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_credit_card_days();
