import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { startOfWeek, format, addDays } from 'date-fns';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function NutritionTracker() {
  const { user } = useAuth();
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 0 });
  const weekKey = format(weekStart, 'yyyy-MM-dd');

  const { data: dailyNutrition = [] } = useQuery({
    queryKey: ['nutrition-weekly', weekKey, user?.id],
    queryFn: async () => {
      // Get meal plan for this week
      const { data: plan } = await supabase
        .from('meal_plans')
        .select('id')
        .eq('week_start', weekKey)
        .maybeSingle();
      if (!plan) return DAYS.map((_, i) => ({ day: i, calories: 0, protein: 0, carbs: 0, fat: 0, meals: 0 }));

      const { data: entries } = await supabase
        .from('meal_plan_entries')
        .select('day_of_week, recipe_id')
        .eq('meal_plan_id', plan.id)
        .not('recipe_id', 'is', null);
      if (!entries || entries.length === 0) return DAYS.map((_, i) => ({ day: i, calories: 0, protein: 0, carbs: 0, fat: 0, meals: 0 }));

      const recipeIds = [...new Set(entries.map(e => e.recipe_id!))];
      const { data: recipes } = await supabase
        .from('recipes')
        .select('id, calories_per_serving, protein_grams, carbs_grams, fat_grams')
        .in('id', recipeIds);
      const recipeMap = Object.fromEntries((recipes || []).map(r => [r.id, r]));

      return DAYS.map((_, dayIdx) => {
        const dayEntries = entries.filter(e => e.day_of_week === dayIdx);
        const totals = dayEntries.reduce(
          (acc, e) => {
            const r = recipeMap[e.recipe_id!];
            if (r) {
              acc.calories += r.calories_per_serving || 0;
              acc.protein += r.protein_grams || 0;
              acc.carbs += r.carbs_grams || 0;
              acc.fat += r.fat_grams || 0;
              acc.meals++;
            }
            return acc;
          },
          { day: dayIdx, calories: 0, protein: 0, carbs: 0, fat: 0, meals: 0 }
        );
        return totals;
      });
    },
    enabled: !!user,
  });

  const weekTotals = dailyNutrition.reduce(
    (acc, d) => ({
      calories: acc.calories + d.calories,
      protein: acc.protein + d.protein,
      carbs: acc.carbs + d.carbs,
      fat: acc.fat + d.fat,
      meals: acc.meals + d.meals,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, meals: 0 }
  );

  const avgCalories = weekTotals.meals > 0 ? Math.round(weekTotals.calories / 7) : 0;

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-2xl font-bold text-foreground">{Math.round(weekTotals.calories)}</p>
            <p className="text-xs text-muted-foreground">Weekly Calories</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-2xl font-bold text-foreground">{avgCalories}</p>
            <p className="text-xs text-muted-foreground">Daily Avg</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-2xl font-bold text-foreground">{Math.round(weekTotals.protein)}g</p>
            <p className="text-xs text-muted-foreground">Weekly Protein</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-2xl font-bold text-foreground">{weekTotals.meals}</p>
            <p className="text-xs text-muted-foreground">Planned Meals</p>
          </CardContent>
        </Card>
      </div>

      {/* Daily breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daily Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {DAYS.map((day, i) => {
              const d = dailyNutrition[i];
              const maxCal = Math.max(...dailyNutrition.map(n => n.calories), 1);
              const pct = d ? (d.calories / maxCal) * 100 : 0;
              return (
                <div key={day} className="flex items-center gap-3">
                  <span className="w-10 text-xs font-medium text-muted-foreground">{day}</span>
                  <span className="text-xs w-8 text-right text-foreground">{format(addDays(weekStart, i), 'M/d')}</span>
                  <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary/70 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="text-xs text-muted-foreground w-24 text-right">
                    {d?.calories ? `${Math.round(d.calories)} cal` : '—'}
                    {d?.protein ? ` · ${Math.round(d.protein)}g P` : ''}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {weekTotals.meals === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            Add recipes with nutrition info to your meal plan to see tracking data here.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

