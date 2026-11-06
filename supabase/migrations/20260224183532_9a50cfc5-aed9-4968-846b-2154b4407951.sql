
-- Partner linking table: pairs two users via a code
CREATE TABLE public.partner_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  partner_user_id UUID,
  pairing_code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  linked_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.partner_links ENABLE ROW LEVEL SECURITY;

-- Users can see their own links (as creator or partner)
CREATE POLICY "Users can view own partner links"
  ON public.partner_links FOR SELECT
  USING (auth.uid() = user_id OR auth.uid() = partner_user_id);

CREATE POLICY "Users can create partner links"
  ON public.partner_links FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own partner links"
  ON public.partner_links FOR UPDATE
  USING (auth.uid() = user_id OR auth.uid() = partner_user_id);

CREATE POLICY "Users can delete own partner links"
  ON public.partner_links FOR DELETE
  USING (auth.uid() = user_id);

-- Anyone can read a pending link by code (for pairing flow)
CREATE POLICY "Anyone can find pending link by code"
  ON public.partner_links FOR SELECT
  USING (status = 'pending');

-- Add is_joint to ceo_tasks
ALTER TABLE public.ceo_tasks ADD COLUMN is_joint BOOLEAN DEFAULT false;

-- Add is_joint to ceo_calendar_events
ALTER TABLE public.ceo_calendar_events ADD COLUMN is_joint BOOLEAN DEFAULT false;

-- Add is_joint to meal_plans
ALTER TABLE public.meal_plans ADD COLUMN is_joint BOOLEAN DEFAULT false;

-- Add is_joint to budgets (joint budgets)
ALTER TABLE public.budgets ADD COLUMN is_joint BOOLEAN DEFAULT false;

-- Security definer function to get partner user id
CREATE OR REPLACE FUNCTION public.get_partner_user_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE 
    WHEN user_id = _user_id THEN partner_user_id
    ELSE user_id
  END
  FROM public.partner_links
  WHERE status = 'active'
    AND (user_id = _user_id OR partner_user_id = _user_id)
  LIMIT 1
$$;

-- Update RLS on ceo_tasks: allow partner to see joint tasks
CREATE POLICY "Partners can view joint tasks"
  ON public.ceo_tasks FOR SELECT
  USING (
    is_joint = true 
    AND user_id = public.get_partner_user_id(auth.uid())
  );

CREATE POLICY "Partners can update joint tasks"
  ON public.ceo_tasks FOR UPDATE
  USING (
    is_joint = true 
    AND user_id = public.get_partner_user_id(auth.uid())
  );

-- Update RLS on ceo_calendar_events: allow partner to see joint events
CREATE POLICY "Partners can view joint events"
  ON public.ceo_calendar_events FOR SELECT
  USING (
    is_joint = true 
    AND user_id = public.get_partner_user_id(auth.uid())
  );

-- Update RLS on meal_plans: allow partner to see joint meal plans
CREATE POLICY "Partners can view joint meal plans"
  ON public.meal_plans FOR SELECT
  USING (
    is_joint = true 
    AND user_id = public.get_partner_user_id(auth.uid())
  );

-- Update RLS on grocery_items: allow partner to see items from joint meal plans
CREATE POLICY "Partners can view joint grocery items"
  ON public.grocery_items FOR SELECT
  USING (
    user_id = public.get_partner_user_id(auth.uid())
    AND (
      meal_plan_id IS NULL 
      OR meal_plan_id IN (
        SELECT id FROM public.meal_plans WHERE is_joint = true AND user_id = public.get_partner_user_id(auth.uid())
      )
    )
  );

-- Update RLS on accounts: allow partner to see joint accounts
CREATE POLICY "Partners can view joint accounts"
  ON public.accounts FOR SELECT
  USING (
    is_joint = true 
    AND user_id = public.get_partner_user_id(auth.uid())
  );

-- Update RLS on transactions: allow partner to see transactions for joint accounts
CREATE POLICY "Partners can view joint transactions"
  ON public.transactions FOR SELECT
  USING (
    account_id IN (
      SELECT id FROM public.accounts 
      WHERE is_joint = true 
        AND user_id = public.get_partner_user_id(auth.uid())
    )
  );

-- Update RLS on budgets: allow partner to see joint budgets
CREATE POLICY "Partners can view joint budgets"
  ON public.budgets FOR SELECT
  USING (
    is_joint = true 
    AND user_id = public.get_partner_user_id(auth.uid())
  );

-- Update RLS on recipes: allow partner to see partner's recipes (for shared meal plans)
CREATE POLICY "Partners can view partner recipes"
  ON public.recipes FOR SELECT
  USING (
    user_id = public.get_partner_user_id(auth.uid())
  );
