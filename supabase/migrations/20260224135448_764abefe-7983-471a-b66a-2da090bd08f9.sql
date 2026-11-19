
-- Table to store which categories should be auto-amortized over 12 months
CREATE TABLE public.auto_amortize_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  category_name TEXT NOT NULL,
  amortize_months INTEGER NOT NULL DEFAULT 12,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.auto_amortize_categories ADD CONSTRAINT auto_amortize_user_category_unique UNIQUE (user_id, category_name);

ALTER TABLE public.auto_amortize_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own auto amortize categories" ON public.auto_amortize_categories FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own auto amortize categories" ON public.auto_amortize_categories FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own auto amortize categories" ON public.auto_amortize_categories FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own auto amortize categories" ON public.auto_amortize_categories FOR DELETE USING (auth.uid() = user_id);

