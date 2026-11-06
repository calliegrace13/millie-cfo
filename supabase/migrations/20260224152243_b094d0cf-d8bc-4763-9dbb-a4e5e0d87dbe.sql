
-- Table to link offset transactions (refunds/reimbursements) to original charges
CREATE TABLE public.transaction_offsets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  parent_transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  offset_transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(offset_transaction_id) -- each offset can only be linked to one parent
);

-- Enable RLS
ALTER TABLE public.transaction_offsets ENABLE ROW LEVEL SECURITY;

-- RLS policies via join to transactions table
CREATE POLICY "Users can view own offsets"
  ON public.transaction_offsets FOR SELECT
  USING (parent_transaction_id IN (SELECT id FROM public.transactions WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert own offsets"
  ON public.transaction_offsets FOR INSERT
  WITH CHECK (parent_transaction_id IN (SELECT id FROM public.transactions WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete own offsets"
  ON public.transaction_offsets FOR DELETE
  USING (parent_transaction_id IN (SELECT id FROM public.transactions WHERE user_id = auth.uid()));
