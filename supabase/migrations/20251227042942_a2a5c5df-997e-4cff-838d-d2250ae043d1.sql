-- Add columns to track linked transfers and exceptions
ALTER TABLE public.transactions 
ADD COLUMN linked_transfer_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
ADD COLUMN is_transfer_exception boolean DEFAULT false;

-- Add index for efficient lookups
CREATE INDEX idx_transactions_linked_transfer ON public.transactions(linked_transfer_id) WHERE linked_transfer_id IS NOT NULL;
CREATE INDEX idx_transactions_transfer_category ON public.transactions(category, date) WHERE category = 'Transfer';

-- Add comment explaining the columns
COMMENT ON COLUMN public.transactions.linked_transfer_id IS 'Links to the opposite-side transfer transaction (e.g., -$500 checking links to +$500 savings)';
COMMENT ON COLUMN public.transactions.is_transfer_exception IS 'If true, this transfer does not require a matching opposite-side transfer';