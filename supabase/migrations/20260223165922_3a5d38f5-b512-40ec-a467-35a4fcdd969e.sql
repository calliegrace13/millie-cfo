
-- Create partner profile table (one partner per user for now)
CREATE TABLE public.partner_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  partner_name TEXT NOT NULL,
  default_ownership_pct NUMERIC NOT NULL DEFAULT 50 CHECK (default_ownership_pct > 0 AND default_ownership_pct <= 100),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.partner_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own partner" ON public.partner_profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own partner" ON public.partner_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own partner" ON public.partner_profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own partner" ON public.partner_profiles FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_partner_profiles_updated_at
  BEFORE UPDATE ON public.partner_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add joint account fields to accounts table
ALTER TABLE public.accounts
  ADD COLUMN is_joint BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN ownership_pct NUMERIC DEFAULT NULL;
-- ownership_pct: NULL means use partner default, otherwise override per account

