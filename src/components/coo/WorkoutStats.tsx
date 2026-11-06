import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { startOfWeek, endOfWeek, subWeeks, format, eachDayOfInterval, isSameDay, parseISO } from 'date-fns';

export function WorkoutStats() {
  const { user } = useAuth();

  const { data: workouts = [] } = useQuery({
    queryKey: ['workouts-stats', user?.id],
    queryFn: async () => {
      const fourWeeksAgo = format(subWeeks(new Date(), 4), 'yyyy-MM-dd');
      const { data, error } = await supabase
        .from('workouts')
        .select('workout_date, workout_type, duration_minutes, calories_burned')
        .gte('workout_date', fourWeeksAgo)
        .order('workout_date', { ascending: true });
      if (error) throw error;
      return data as { workout_date: string; workout_type: string; duration_minutes: number | null; calories_burned: number | null }[];
    },
    enabled: !!user,
  });

  const thisWeekStart = startOfWeek(new Date(), { weekStartsOn: 0 });
  const thisWeekEnd = endOfWeek(new Date(), { weekStartsOn: 0 });
  const lastWeekStart = subWeeks(thisWeekStart, 1);
  const lastWeekEnd = subWeeks(thisWeekEnd, 1);

  const thisWeek = workouts.filter(w => {
    const d = parseISO(w.workout_date);
    return d >= thisWeekStart && d <= thisWeekEnd;
  });

  const lastWeek = workouts.filter(w => {
    const d = parseISO(w.workout_date);
    return d >= lastWeekStart && d <= lastWeekEnd;
  });

  const totalDuration = thisWeek.reduce((sum, w) => sum + (w.duration_minutes || 0), 0);
  const totalCalories = thisWeek.reduce((sum, w) => sum + (w.calories_burned || 0), 0);
  const lastWeekDuration = lastWeek.reduce((sum, w) => sum + (w.duration_minutes || 0), 0);

  // Type breakdown
  const typeCounts: Record<string, number> = {};
  thisWeek.forEach(w => { typeCounts[w.workout_type] = (typeCounts[w.workout_type] || 0) + 1; });
  const topTypes = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);

  // Activity heatmap (last 4 weeks)
  const fourWeeksAgo = subWeeks(thisWeekStart, 3);
  const allDays = eachDayOfInterval({ start: fourWeeksAgo, end: thisWeekEnd });
  const dayActivity = allDays.map(day => {
    const count = workouts.filter(w => isSameDay(parseISO(w.workout_date), day)).length;
    return { date: day, count };
  });

  const durationChange = lastWeekDuration > 0 ? Math.round(((totalDuration - lastWeekDuration) / lastWeekDuration) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-2xl font-bold text-foreground">{thisWeek.length}</p>
            <p className="text-xs text-muted-foreground">Workouts This Week</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-2xl font-bold text-foreground">{totalDuration}</p>
            <p className="text-xs text-muted-foreground">Minutes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-2xl font-bold text-foreground">{Math.round(totalCalories)}</p>
            <p className="text-xs text-muted-foreground">Calories Burned</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className={`text-2xl font-bold ${durationChange >= 0 ? 'text-green-600' : 'text-red-500'}`}>
              {durationChange >= 0 ? '+' : ''}{durationChange}%
            </p>
            <p className="text-xs text-muted-foreground">vs Last Week</p>
          </CardContent>
        </Card>
      </div>

      {/* Activity heatmap */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Activity (Last 4 Weeks)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-1">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
              <div key={i} className="text-xs text-muted-foreground text-center mb-1">{d}</div>
            ))}
            {dayActivity.map(({ date, count }, i) => (
              <div
                key={i}
                className={`aspect-square rounded-sm ${
                  count === 0 ? 'bg-muted' :
                  count === 1 ? 'bg-primary/30' :
                  count === 2 ? 'bg-primary/60' :
                  'bg-primary'
                }`}
                title={`${format(date, 'MMM d')}: ${count} workout${count !== 1 ? 's' : ''}`}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Type breakdown */}
      {topTypes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">This Week by Type</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {topTypes.map(([type, count]) => {
                const pct = (count / thisWeek.length) * 100;
                return (
                  <div key={type} className="flex items-center gap-3">
                    <span className="w-20 text-xs font-medium text-muted-foreground">{type}</span>
                    <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary/70 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs text-muted-foreground w-6 text-right">{count}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {workouts.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            Log workouts or import from Apple Health to see your stats here.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
