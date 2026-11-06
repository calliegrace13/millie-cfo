-- Create table for credit cards (to associate benefits with specific cards)
CREATE TABLE public.credit_cards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  card_name TEXT NOT NULL,
  card_issuer TEXT,
  annual_fee NUMERIC DEFAULT 0,
  annual_fee_due_date DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for credit card benefits
CREATE TABLE public.credit_card_benefits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  credit_card_id UUID NOT NULL REFERENCES public.credit_cards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  benefit_name TEXT NOT NULL,
  benefit_type TEXT NOT NULL, -- 'credit', 'cashback', 'points_multiplier', 'discount', 'perk'
  benefit_value NUMERIC NOT NULL DEFAULT 0, -- dollar amount for credits, percentage for cashback
  benefit_period TEXT NOT NULL DEFAULT 'yearly', -- 'monthly', 'yearly', 'one_time'
  merchant_keywords TEXT[], -- keywords to match transactions
  category_match TEXT, -- category to match from transactions
  reset_date DATE, -- when the benefit resets
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table to track benefit usage
CREATE TABLE public.benefit_usage (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  benefit_id UUID NOT NULL REFERENCES public.credit_card_benefits(id) ON DELETE CASCADE,
  transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  amount_used NUMERIC NOT NULL DEFAULT 0,
  usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.credit_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_card_benefits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.benefit_usage ENABLE ROW LEVEL SECURITY;

-- RLS policies for credit_cards
CREATE POLICY "Users can view own credit cards" ON public.credit_cards FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own credit cards" ON public.credit_cards FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own credit cards" ON public.credit_cards FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own credit cards" ON public.credit_cards FOR DELETE USING (auth.uid() = user_id);

-- RLS policies for credit_card_benefits
CREATE POLICY "Users can view own benefits" ON public.credit_card_benefits FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own benefits" ON public.credit_card_benefits FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own benefits" ON public.credit_card_benefits FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own benefits" ON public.credit_card_benefits FOR DELETE USING (auth.uid() = user_id);

-- RLS policies for benefit_usage
CREATE POLICY "Users can view own usage" ON public.benefit_usage FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own usage" ON public.benefit_usage FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own usage" ON public.benefit_usage FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own usage" ON public.benefit_usage FOR DELETE USING (auth.uid() = user_id);

-- Triggers for updated_at
CREATE TRIGGER update_credit_cards_updated_at BEFORE UPDATE ON public.credit_cards FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_credit_card_benefits_updated_at BEFORE UPDATE ON public.credit_card_benefits FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();