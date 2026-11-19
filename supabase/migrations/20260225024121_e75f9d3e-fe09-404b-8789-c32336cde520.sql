
-- Partner can view partner's recipes (for joint meal plans) - use different name since one exists
DROP POLICY IF EXISTS "Partners can view partner recipes" ON public.recipes;
CREATE POLICY "Partners can view partner recipes"
ON public.recipes
FOR SELECT
USING (
  user_id = get_partner_user_id(auth.uid())
  AND id IN (
    SELECT mpe.recipe_id FROM public.meal_plan_entries mpe
    JOIN public.meal_plans mp ON mpe.meal_plan_id = mp.id
    WHERE mp.is_joint = true
  )
);

-- Partner can view recipe ingredients for joint meal plan recipes
DROP POLICY IF EXISTS "Partners can view partner recipe ingredients" ON public.recipe_ingredients;
CREATE POLICY "Partners can view partner recipe ingredients"
ON public.recipe_ingredients
FOR SELECT
USING (
  user_id = get_partner_user_id(auth.uid())
  AND recipe_id IN (
    SELECT mpe.recipe_id FROM public.meal_plan_entries mpe
    JOIN public.meal_plans mp ON mpe.meal_plan_id = mp.id
    WHERE mp.is_joint = true
  )
);

-- Partner can view partner's meal plan entries for joint plans
DROP POLICY IF EXISTS "Partners can view joint meal plan entries" ON public.meal_plan_entries;
CREATE POLICY "Partners can view joint meal plan entries"
ON public.meal_plan_entries
FOR SELECT
USING (
  user_id = get_partner_user_id(auth.uid())
  AND meal_plan_id IN (
    SELECT id FROM public.meal_plans WHERE is_joint = true
  )
);

-- Partner can update joint budgets
DROP POLICY IF EXISTS "Partners can update joint budgets" ON public.budgets;
CREATE POLICY "Partners can update joint budgets"
ON public.budgets
FOR UPDATE
USING (
  is_joint = true AND user_id = get_partner_user_id(auth.uid())
);

