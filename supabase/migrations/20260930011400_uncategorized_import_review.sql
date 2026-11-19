BEGIN;
-- Blank/default categories on manual and statement imports are not user corrections.
CREATE OR REPLACE FUNCTION finance_protect_classification() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 IF auth.role()='authenticated' THEN
  IF TG_OP='INSERT' THEN IF nullif(trim(NEW.category),'') IS NOT NULL AND NEW.category NOT IN('Other','Uncategorized') THEN NEW.classification_locked:=true;NEW.classification_source:='user';END IF;
  ELSIF NEW.category IS DISTINCT FROM OLD.category OR NEW.cash_flow_type IS DISTINCT FROM OLD.cash_flow_type OR NEW.linked_transfer_id IS DISTINCT FROM OLD.linked_transfer_id OR (OLD.needs_review AND NOT NEW.needs_review) THEN NEW.classification_locked:=true;NEW.classification_source:='user';NEW.classification_reason:='Your correction or review is protected from automatic categorization.';END IF;
 END IF;RETURN NEW;END $$;
COMMIT;
