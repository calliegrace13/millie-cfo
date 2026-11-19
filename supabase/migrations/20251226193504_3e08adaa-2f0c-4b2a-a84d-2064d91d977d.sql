-- Create transaction_rules table
CREATE TABLE public.transaction_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  match_text TEXT NOT NULL,
  match_type TEXT NOT NULL DEFAULT 'contains', -- 'contains', 'starts_with', 'exact'
  category TEXT,
  cash_flow_type TEXT, -- 'operating', 'investing', 'financing', 'other'
  is_one_time_expense BOOLEAN DEFAULT false,
  amortize_months INTEGER, -- if set, auto-amortize over this many months
  amortize_type TEXT, -- 'prepaid_expense', 'capital_expenditure', 'intangible_asset'
  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 0, -- higher priority rules apply first
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.transaction_rules ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view own rules" 
ON public.transaction_rules FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own rules" 
ON public.transaction_rules FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own rules" 
ON public.transaction_rules FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own rules" 
ON public.transaction_rules FOR DELETE 
USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_transaction_rules_updated_at
BEFORE UPDATE ON public.transaction_rules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
