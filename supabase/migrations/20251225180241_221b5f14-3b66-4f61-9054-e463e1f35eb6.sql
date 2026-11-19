-- Create table for balance sheet snapshots
CREATE TABLE public.balance_sheet_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  snapshot_date DATE NOT NULL,
  total_assets NUMERIC NOT NULL DEFAULT 0,
  current_assets NUMERIC NOT NULL DEFAULT 0,
  fixed_assets NUMERIC NOT NULL DEFAULT 0,
  total_liabilities NUMERIC NOT NULL DEFAULT 0,
  current_liabilities NUMERIC NOT NULL DEFAULT 0,
  long_term_liabilities NUMERIC NOT NULL DEFAULT 0,
  total_equity NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, snapshot_date)
);

-- Enable Row Level Security
ALTER TABLE public.balance_sheet_snapshots ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view own snapshots" 
ON public.balance_sheet_snapshots 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own snapshots" 
ON public.balance_sheet_snapshots 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own snapshots" 
ON public.balance_sheet_snapshots 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own snapshots" 
ON public.balance_sheet_snapshots 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_balance_sheet_snapshots_updated_at
BEFORE UPDATE ON public.balance_sheet_snapshots
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
