import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { startOfWeek, addWeeks, subWeeks, format, addDays } from 'date-fns';
import { toast } from '@/hooks/use-toast';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];

type MealEntry = {
  id: string;
  meal_plan_id: string;
  recipe_id: string | null;
  day_of_week: number;
  meal_type: string;
  custom_meal_name: string | null;
  recipe_name?: string;
};

export function WeeklyMealPlanner() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 0 }));

  const weekKey = format(weekStart, 'yyyy-MM-dd');

  // Fetch or create meal plan for the week
  const { data: mealPlan } = useQuery({
    queryKey: ['meal-plan', weekKey, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('meal_plans')
        .select('*')
        .eq('week_start', weekKey)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: entries = [] } = useQuery({
    queryKey: ['meal-plan-entries', mealPlan?.id],
    queryFn: async () => {
      if (!mealPlan) return [];
      const { data, error } = await supabase
        .from('meal_plan_entries')
        .select('*')
        .eq('meal_plan_id', mealPlan.id);
      if (error) throw error;
      // Fetch recipe names
      const recipeIds = (data as any[]).filter(e => e.recipe_id).map(e => e.recipe_id);
      let recipeMap: Record<string, string> = {};
      if (recipeIds.length > 0) {
        const { data: recipes } = await supabase
          .from('recipes')
          .select('id, name')
          .in('id', recipeIds);
        if (recipes) {
          recipeMap = Object.fromEntries(recipes.map(r => [r.id, r.name]));
        }
      }
      return (data as any[]).map(e => ({
        ...e,
        recipe_name: e.recipe_id ? recipeMap[e.recipe_id] : null,
      })) as MealEntry[];
    },
    enabled: !!mealPlan,
  });

  const { data: recipes = [] } = useQuery({
    queryKey: ['recipes-list', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recipes')
        .select('id, name')
        .order('name');
      if (error) throw error;
      return data as { id: string; name: string }[];
    },
    enabled: !!user,
  });

  const ensureMealPlan = async () => {
    if (mealPlan) return mealPlan.id;
    const { data, error } = await supabase
      .from('meal_plans')
      .insert({ user_id: user!.id, week_start: weekKey } as any)
      .select('id')
      .single();
    if (error) throw error;
    queryClient.invalidateQueries({ queryKey: ['meal-plan', weekKey] });
    return data.id;
  };

  const addEntry = useMutation({
    mutationFn: async ({ dayOfWeek, mealType }: { dayOfWeek: number; mealType: string }) => {
      const planId = await ensureMealPlan();
      const { error } = await supabase.from('meal_plan_entries').insert({
        meal_plan_id: planId,
        user_id: user!.id,
        day_of_week: dayOfWeek,
        meal_type: mealType,
        custom_meal_name: 'New meal',
      } as any);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['meal-plan-entries'] }),
  });

  const updateEntry = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; recipe_id?: string | null; custom_meal_name?: string }) => {
      const { error } = await supabase.from('meal_plan_entries').update(updates as any).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['meal-plan-entries'] }),
  });

  const deleteEntry = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('meal_plan_entries').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['meal-plan-entries'] }),
  });

  const getEntriesForSlot = (day: number, mealType: string) =>
    entries.filter(e => e.day_of_week === day && e.meal_type === mealType);

  return (
    <div className="space-y-4">
      {/* Week navigation */}
      <div className="flex items-center justify-between">
        <Button variant="outline" size="icon" onClick={() => setWeekStart(subWeeks(weekStart, 1))}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <h3 className="font-semibold text-foreground">
          {format(weekStart, 'MMM d')} – {format(addDays(weekStart, 6), 'MMM d, yyyy')}
        </h3>
        <Button variant="outline" size="icon" onClick={() => setWeekStart(addWeeks(weekStart, 1))}>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto">
        <div className="min-w-[800px]">
          {/* Header row */}
          <div className="grid grid-cols-8 gap-1 mb-1">
            <div className="p-2 text-xs font-medium text-muted-foreground" />
            {DAYS.map((day, i) => (
              <div key={day} className="p-2 text-center text-xs font-semibold text-foreground bg-muted rounded">
                <div>{day}</div>
                <div className="text-muted-foreground">{format(addDays(weekStart, i), 'M/d')}</div>
              </div>
            ))}
          </div>

          {/* Meal type rows */}
          {MEAL_TYPES.map(mealType => (
            <div key={mealType} className="grid grid-cols-8 gap-1 mb-1">
              <div className="p-2 text-xs font-medium text-muted-foreground capitalize flex items-start pt-3">
                {mealType}
              </div>
              {DAYS.map((_, dayIdx) => {
                const slotEntries = getEntriesForSlot(dayIdx, mealType);
                return (
                  <div key={dayIdx} className="min-h-[60px] border border-border rounded p-1 bg-card">
                    {slotEntries.map(entry => (
                      <div key={entry.id} className="text-xs p-1 bg-secondary rounded mb-1 group flex items-center gap-1">
                        {entry.recipe_id ? (
                          <span className="truncate flex-1 font-medium">{entry.recipe_name}</span>
                        ) : (
                          <Input
                            className="h-5 text-xs border-0 bg-transparent p-0"
                            defaultValue={entry.custom_meal_name || ''}
                            onBlur={e => {
                              if (e.target.value !== entry.custom_meal_name) {
                                updateEntry.mutate({ id: entry.id, custom_meal_name: e.target.value });
                              }
                            }}
                          />
                        )}
                        <button
                          onClick={() => deleteEntry.mutate(entry.id)}
                          className="opacity-0 group-hover:opacity-100 shrink-0"
                        >
                          <Trash2 className="w-3 h-3 text-muted-foreground" />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => addEntry.mutate({ dayOfWeek: dayIdx, mealType })}
                      className="w-full text-xs text-muted-foreground hover:text-foreground py-0.5 opacity-0 hover:opacity-100 transition-opacity"
                    >
                      <Plus className="w-3 h-3 mx-auto" />
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Daily nutrition summary */}
      <DailyNutritionSummary entries={entries} weekStart={weekStart} />
    </div>
  );
}

function DailyNutritionSummary({ entries, weekStart }: { entries: MealEntry[]; weekStart: Date }) {
  const recipeIds = useMemo(() => [...new Set(entries.filter(e => e.recipe_id).map(e => e.recipe_id!))], [entries]);

  const { data: nutritionMap = {} } = useQuery({
    queryKey: ['recipe-nutrition', recipeIds],
    queryFn: async () => {
      if (recipeIds.length === 0) return {};
      const { data } = await supabase
        .from('recipes')
        .select('id, calories_per_serving, protein_grams, carbs_grams, fat_grams')
        .in('id', recipeIds);
      if (!data) return {};
      return Object.fromEntries(data.map(r => [r.id, r])) as Record<string, any>;
    },
    enabled: recipeIds.length > 0,
  });

  if (Object.keys(nutritionMap).length === 0) return null;

  return (
    <div className="grid grid-cols-7 gap-2">
      {DAYS.map((day, i) => {
        const dayEntries = entries.filter(e => e.day_of_week === i && e.recipe_id);
        const totals = dayEntries.reduce(
          (acc, e) => {
            const n = nutritionMap[e.recipe_id!];
            if (n) {
              acc.cal += n.calories_per_serving || 0;
              acc.protein += n.protein_grams || 0;
              acc.carbs += n.carbs_grams || 0;
              acc.fat += n.fat_grams || 0;
            }
            return acc;
          },
          { cal: 0, protein: 0, carbs: 0, fat: 0 }
        );
        if (totals.cal === 0) return <div key={i} />;
        return (
          <div key={i} className="text-center text-xs text-muted-foreground bg-muted/50 rounded p-2">
            <div className="font-medium text-foreground">{day}</div>
            <div>{Math.round(totals.cal)} cal</div>
            <div>P:{Math.round(totals.protein)}g</div>
          </div>
        );
      })}
    </div>
  );
}

