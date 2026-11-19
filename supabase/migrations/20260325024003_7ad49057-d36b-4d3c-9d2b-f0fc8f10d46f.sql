
-- CTO tables
CREATE TABLE public.digital_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  cost numeric NOT NULL DEFAULT 0,
  billing_cycle text NOT NULL DEFAULT 'monthly',
  category text NOT NULL DEFAULT 'other',
  url text,
  next_billing_date date,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.digital_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own subscriptions" ON public.digital_subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own subscriptions" ON public.digital_subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own subscriptions" ON public.digital_subscriptions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own subscriptions" ON public.digital_subscriptions FOR DELETE USING (auth.uid() = user_id);
CREATE TRIGGER update_digital_subscriptions_updated_at BEFORE UPDATE ON public.digital_subscriptions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE public.device_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'other',
  brand text,
  model text,
  purchase_date date,
  warranty_end date,
  serial_number text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.device_inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own devices" ON public.device_inventory FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own devices" ON public.device_inventory FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own devices" ON public.device_inventory FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own devices" ON public.device_inventory FOR DELETE USING (auth.uid() = user_id);
CREATE TRIGGER update_device_inventory_updated_at BEFORE UPDATE ON public.device_inventory FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE public.credential_vault (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  username text,
  url text,
  category text NOT NULL DEFAULT 'other',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.credential_vault ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own credentials" ON public.credential_vault FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own credentials" ON public.credential_vault FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own credentials" ON public.credential_vault FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own credentials" ON public.credential_vault FOR DELETE USING (auth.uid() = user_id);
CREATE TRIGGER update_credential_vault_updated_at BEFORE UPDATE ON public.credential_vault FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- CIO tables
CREATE TABLE public.investment_holdings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  ticker text,
  asset_class text NOT NULL DEFAULT 'other',
  quantity numeric NOT NULL DEFAULT 0,
  cost_basis numeric NOT NULL DEFAULT 0,
  current_value numeric NOT NULL DEFAULT 0,
  account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.investment_holdings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own holdings" ON public.investment_holdings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own holdings" ON public.investment_holdings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own holdings" ON public.investment_holdings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own holdings" ON public.investment_holdings FOR DELETE USING (auth.uid() = user_id);
CREATE TRIGGER update_investment_holdings_updated_at BEFORE UPDATE ON public.investment_holdings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE public.watchlist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  ticker text NOT NULL,
  name text NOT NULL,
  target_price numeric,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.watchlist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own watchlist" ON public.watchlist_items FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own watchlist" ON public.watchlist_items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own watchlist" ON public.watchlist_items FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own watchlist" ON public.watchlist_items FOR DELETE USING (auth.uid() = user_id);
CREATE TRIGGER update_watchlist_items_updated_at BEFORE UPDATE ON public.watchlist_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- CMO tables
CREATE TABLE public.social_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  platform text NOT NULL,
  handle text,
  url text,
  follower_count integer NOT NULL DEFAULT 0,
  last_updated timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.social_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own social accounts" ON public.social_accounts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own social accounts" ON public.social_accounts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own social accounts" ON public.social_accounts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own social accounts" ON public.social_accounts FOR DELETE USING (auth.uid() = user_id);
CREATE TRIGGER update_social_accounts_updated_at BEFORE UPDATE ON public.social_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE public.content_calendar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  platform text,
  scheduled_date date,
  status text NOT NULL DEFAULT 'draft',
  content_type text NOT NULL DEFAULT 'post',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.content_calendar ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own content" ON public.content_calendar FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own content" ON public.content_calendar FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own content" ON public.content_calendar FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own content" ON public.content_calendar FOR DELETE USING (auth.uid() = user_id);
CREATE TRIGGER update_content_calendar_updated_at BEFORE UPDATE ON public.content_calendar FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE public.networking_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  contact_name text NOT NULL,
  company text,
  met_at text,
  meeting_date date NOT NULL DEFAULT CURRENT_DATE,
  follow_up_date date,
  notes text,
  status text NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.networking_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own networking" ON public.networking_log FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own networking" ON public.networking_log FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own networking" ON public.networking_log FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own networking" ON public.networking_log FOR DELETE USING (auth.uid() = user_id);
CREATE TRIGGER update_networking_log_updated_at BEFORE UPDATE ON public.networking_log FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

