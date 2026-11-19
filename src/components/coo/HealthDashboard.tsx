import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { Footprints, Heart, Moon, UtensilsCrossed, TrendingUp, TrendingDown } from 'lucide-react';
import { format, subDays, startOfWeek, endOfWeek, subWeeks } from 'date-fns';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';

type HealthMetric = {
  metric_date: string;
  steps: number | null;
  distance_km: number | null;
  active_energy_cal: number | null;
  resting_heart_rate: number | null;
  sleep_hours: number | null;
  calories_consumed: number | null;
  protein_grams: number | null;
};

export function HealthDashboard() {
  const { user } = useAuth();
  const thirtyDaysAgo = format(subDays(new Date(), 30), 'yyyy-MM-dd');

  const { data: metrics = [], isLoading } = useQuery({
    queryKey: ['health-metrics-range', user?.id, thirtyDaysAgo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('daily_health_metrics')
        .select('metric_date, steps, distance_km, active_energy_cal, resting_heart_rate, sleep_hours, calories_consumed, protein_grams')
        .gte('metric_date', thirtyDaysAgo)
        .order('metric_date', { ascending: true });
      if (error) throw error;
      return data as HealthMetric[];
    },
    enabled: !!user,
  });

  if (isLoading) return <div className="animate-pulse text-muted-foreground py-8">Loading health data...</div>;

  const daysWithData = metrics.length;
  const avgSteps = daysWithData > 0
    ? Math.round(metrics.filter(m => m.steps).reduce((s, m) => s + (m.steps || 0), 0) / metrics.filter(m => m.steps).length || 1)
    : 0;
  const avgSleep = daysWithData > 0
    ? (metrics.filter(m => m.sleep_hours).reduce((s, m) => s + (m.sleep_hours || 0), 0) / (metrics.filter(m => m.sleep_hours).length || 1)).toFixed(1)
    : '0';
  const avgHR = daysWithData > 0
    ? Math.round(metrics.filter(m => m.resting_heart_rate).reduce((s, m) => s + (m.resting_heart_rate || 0), 0) / (metrics.filter(m => m.resting_heart_rate).length || 1))
    : 0;
  const avgCalories = daysWithData > 0
    ? Math.round(metrics.filter(m => m.calories_consumed).reduce((s, m) => s + (m.calories_consumed || 0), 0) / (metrics.filter(m => m.calories_consumed).length || 1))
    : 0;

  // Week-over-week comparison for steps
  const thisWeekStart = startOfWeek(new Date(), { weekStartsOn: 0 });
  const lastWeekStart = subWeeks(thisWeekStart, 1);
  const thisWeekSteps = metrics
    .filter(m => m.metric_date >= format(thisWeekStart, 'yyyy-MM-dd') && m.steps)
    .reduce((s, m) => s + (m.steps || 0), 0);
  const lastWeekSteps = metrics
    .filter(m => m.metric_date >= format(lastWeekStart, 'yyyy-MM-dd') && m.metric_date < format(thisWeekStart, 'yyyy-MM-dd') && m.steps)
    .reduce((s, m) => s + (m.steps || 0), 0);
  const stepsTrend = lastWeekSteps > 0 ? Math.round(((thisWeekSteps - lastWeekSteps) / lastWeekSteps) * 100) : 0;

  const chartData = metrics.map(m => ({
    date: format(new Date(m.metric_date), 'M/d'),
    steps: m.steps || 0,
    sleep: m.sleep_hours ? parseFloat(m.sleep_hours.toFixed(1)) : 0,
    hr: m.resting_heart_rate || 0,
    calories: m.calories_consumed || 0,
  }));

  if (daysWithData === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <Heart className="w-8 h-8 mx-auto mb-2 opacity-50" />
          No health data yet. Log daily metrics or import from Apple Health to see trends.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Avg Daily Steps"
          value={avgSteps.toLocaleString()}
          icon={<Footprints className="w-5 h-5" />}
          trend={stepsTrend !== 0 ? { value: stepsTrend, label: 'vs last week' } : undefined}
        />
        <StatCard
          title="Avg Sleep"
          value={`${avgSleep} hrs`}
          icon={<Moon className="w-5 h-5" />}
        />
        <StatCard
          title="Avg Resting HR"
          value={avgHR > 0 ? `${avgHR} bpm` : '—'}
          icon={<Heart className="w-5 h-5" />}
        />
        <StatCard
          title="Avg Calories"
          value={avgCalories > 0 ? avgCalories.toLocaleString() : '—'}
          icon={<UtensilsCrossed className="w-5 h-5" />}
        />
      </div>

      {/* Steps Chart */}
      {chartData.some(d => d.steps > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Footprints className="w-4 h-4" /> Daily Steps (30 days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} className="text-muted-foreground" interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10 }} className="text-muted-foreground" />
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }}
                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                  />
                  <Bar dataKey="steps" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sleep & Heart Rate Trend */}
      <div className="grid gap-4 lg:grid-cols-2">
        {chartData.some(d => d.sleep > 0) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Moon className="w-4 h-4" /> Sleep Duration
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData.filter(d => d.sleep > 0)}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis domain={[4, 10]} tick={{ fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }}
                    />
                    <Line type="monotone" dataKey="sleep" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {chartData.some(d => d.hr > 0) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Heart className="w-4 h-4" /> Resting Heart Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData.filter(d => d.hr > 0)}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }}
                    />
                    <Line type="monotone" dataKey="hr" stroke="hsl(0, 70%, 50%)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

