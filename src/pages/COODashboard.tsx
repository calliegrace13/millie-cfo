import { useLocation, useNavigate, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { RecipeLibrary } from '@/components/coo/RecipeLibrary';
import { WeeklyMealPlanner } from '@/components/coo/WeeklyMealPlanner';
import { GroceryList } from '@/components/coo/GroceryList';
import { NutritionTracker } from '@/components/coo/NutritionTracker';
import { WorkoutLogger } from '@/components/coo/WorkoutLogger';
import { WorkoutStats } from '@/components/coo/WorkoutStats';
import { HealthMetricsLogger } from '@/components/coo/HealthMetricsLogger';
import { HealthDashboard } from '@/components/coo/HealthDashboard';
import { ChefHat, CalendarDays, ShoppingCart, Apple, Dumbbell, BarChart3, LayoutDashboard, ArrowRight, Heart, Activity } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';

type COOView = 'dashboard' | 'meal-plan' | 'recipes' | 'groceries' | 'nutrition' | 'workouts' | 'workout-stats' | 'health-log' | 'health-dashboard';

const pathToView: Record<string, COOView> = {
  '/coo': 'dashboard',
  '/coo/meal-plan': 'meal-plan',
  '/coo/recipes': 'recipes',
  '/coo/groceries': 'groceries',
  '/coo/nutrition': 'nutrition',
  '/coo/workouts': 'workouts',
  '/coo/workout-stats': 'workout-stats',
  '/coo/health': 'health-log',
  '/coo/health-dashboard': 'health-dashboard',
};

const viewToPath: Record<COOView, string> = {
  'dashboard': '/coo',
  'meal-plan': '/coo/meal-plan',
  'recipes': '/coo/recipes',
  'groceries': '/coo/groceries',
  'nutrition': '/coo/nutrition',
  'workouts': '/coo/workouts',
  'workout-stats': '/coo/workout-stats',
  'health-log': '/coo/health',
  'health-dashboard': '/coo/health-dashboard',
};

const nutritionViews: COOView[] = ['meal-plan', 'recipes', 'groceries', 'nutrition'];
const workoutViews: COOView[] = ['workouts', 'workout-stats'];
const healthViews: COOView[] = ['health-log', 'health-dashboard'];

function COOOverview() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    workoutsThisWeek: 0,
    totalWorkouts: 0,
    recipesCount: 0,
    mealPlansCount: 0,
    groceryItemsUnchecked: 0,
  });

  useEffect(() => {
    if (!user) return;
    async function fetch() {
      setLoading(true);
      const now = new Date();
      const weekStart = format(new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()), 'yyyy-MM-dd');

      const [workoutsWeek, workoutsAll, recipes, mealPlans, groceries] = await Promise.all([
        supabase.from('workouts').select('id', { count: 'exact', head: true }).gte('workout_date', weekStart),
        supabase.from('workouts').select('id', { count: 'exact', head: true }),
        supabase.from('recipes').select('id', { count: 'exact', head: true }),
        supabase.from('meal_plans').select('id', { count: 'exact', head: true }),
        supabase.from('grocery_items').select('id', { count: 'exact', head: true }).eq('is_checked', false),
      ]);

      setStats({
        workoutsThisWeek: workoutsWeek.count || 0,
        totalWorkouts: workoutsAll.count || 0,
        recipesCount: recipes.count || 0,
        mealPlansCount: mealPlans.count || 0,
        groceryItemsUnchecked: groceries.count || 0,
      });
      setLoading(false);
    }
    fetch();
  }, [user]);

  if (loading) return <div className="animate-pulse text-muted-foreground py-8">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link to="/coo/workouts" className="block">
          <StatCard title="Workouts This Week" value={stats.workoutsThisWeek.toString()} icon={<Dumbbell className="w-5 h-5" />} />
        </Link>
        <Link to="/coo/workout-stats" className="block">
          <StatCard title="Total Workouts" value={stats.totalWorkouts.toString()} icon={<BarChart3 className="w-5 h-5" />} />
        </Link>
        <Link to="/coo/recipes" className="block">
          <StatCard title="Recipes" value={stats.recipesCount.toString()} icon={<ChefHat className="w-5 h-5" />} />
        </Link>
        <Link to="/coo/groceries" className="block">
          <StatCard title="Grocery Items" value={stats.groceryItemsUnchecked.toString()} subtitle="Unchecked" icon={<ShoppingCart className="w-5 h-5" />} />
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Link to="/coo/meal-plan" className="block">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-[hsl(340_55%_32%)] flex items-center justify-center">
                    <CalendarDays className="w-4 h-4 text-white" />
                  </div>
                  <CardTitle className="text-base">Meal Planning</CardTitle>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {stats.mealPlansCount} meal plan{stats.mealPlansCount !== 1 ? 's' : ''}. Plan meals & generate grocery lists.
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link to="/coo/nutrition" className="block">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-[hsl(140_35%_32%)] flex items-center justify-center">
                    <Apple className="w-4 h-4 text-white" />
                  </div>
                  <CardTitle className="text-base">Nutrition</CardTitle>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Track daily macros and calories from your meal plans.
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link to="/coo/health" className="block">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-[hsl(0_60%_40%)] flex items-center justify-center">
                    <Heart className="w-4 h-4 text-white" />
                  </div>
                  <CardTitle className="text-base">Health Metrics</CardTitle>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Steps, heart rate, sleep & nutrition. Import from Apple Health.
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}

export default function COODashboard() {
  const location = useLocation();
  const navigate = useNavigate();
  const view = pathToView[location.pathname] || 'dashboard';

  const setView = (v: COOView) => navigate(viewToPath[v]);

  const isNutritionSection = nutritionViews.includes(view);
  const isWorkoutSection = workoutViews.includes(view);
  const isHealthSection = healthViews.includes(view);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Millie COO</h1>
          <p className="text-muted-foreground mt-1">Operations — Nutrition, meal planning & fitness</p>
        </div>

        {/* Sub-tab toggles */}
        {isNutritionSection && (
          <ToggleGroup
            type="single"
            value={view}
            onValueChange={(v) => { if (v) setView(v as COOView); }}
            variant="outline"
            className="justify-start flex-wrap"
          >
            <ToggleGroupItem value="meal-plan" className="gap-2 px-4">
              <CalendarDays className="w-4 h-4" />
              Meal Plan
            </ToggleGroupItem>
            <ToggleGroupItem value="recipes" className="gap-2 px-4">
              <ChefHat className="w-4 h-4" />
              Recipes
            </ToggleGroupItem>
            <ToggleGroupItem value="groceries" className="gap-2 px-4">
              <ShoppingCart className="w-4 h-4" />
              Groceries
            </ToggleGroupItem>
            <ToggleGroupItem value="nutrition" className="gap-2 px-4">
              <Apple className="w-4 h-4" />
              Nutrition
            </ToggleGroupItem>
          </ToggleGroup>
        )}

        {isWorkoutSection && (
          <ToggleGroup
            type="single"
            value={view}
            onValueChange={(v) => { if (v) setView(v as COOView); }}
            variant="outline"
            className="justify-start flex-wrap"
          >
            <ToggleGroupItem value="workouts" className="gap-2 px-4">
              <Dumbbell className="w-4 h-4" />
              Log Workouts
            </ToggleGroupItem>
            <ToggleGroupItem value="workout-stats" className="gap-2 px-4">
              <BarChart3 className="w-4 h-4" />
              Stats
            </ToggleGroupItem>
          </ToggleGroup>
        )}

        {isHealthSection && (
          <ToggleGroup
            type="single"
            value={view}
            onValueChange={(v) => { if (v) setView(v as COOView); }}
            variant="outline"
            className="justify-start flex-wrap"
          >
            <ToggleGroupItem value="health-log" className="gap-2 px-4">
              <Activity className="w-4 h-4" />
              Daily Log
            </ToggleGroupItem>
            <ToggleGroupItem value="health-dashboard" className="gap-2 px-4">
              <Heart className="w-4 h-4" />
              Trends
            </ToggleGroupItem>
          </ToggleGroup>
        )}

        {view === 'dashboard' && <COOOverview />}
        {view === 'meal-plan' && <WeeklyMealPlanner />}
        {view === 'recipes' && <RecipeLibrary />}
        {view === 'groceries' && <GroceryList />}
        {view === 'nutrition' && <NutritionTracker />}
        {view === 'workouts' && <WorkoutLogger />}
        {view === 'workout-stats' && <WorkoutStats />}
        {view === 'health-log' && <HealthMetricsLogger />}
        {view === 'health-dashboard' && <HealthDashboard />}
      </div>
    </AppLayout>
  );
}

