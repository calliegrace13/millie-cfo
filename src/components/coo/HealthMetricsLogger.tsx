import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Footprints, Heart, Moon, UtensilsCrossed, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { format, subDays, addDays, startOfDay } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import { HealthDataImporter } from './HealthDataImporter';

type HealthMetric = {
  id: string;
  metric_date: string;
  steps: number | null;
  distance_km: number | null;
  active_energy_cal: number | null;
  resting_heart_rate: number | null;
  avg_heart_rate: number | null;
  max_heart_rate: number | null;
  sleep_hours: number | null;
  sleep_quality: string | null;
  bedtime: string | null;
  wake_time: string | null;
  calories_consumed: number | null;
  protein_grams: number | null;
  carbs_grams: number | null;
  fat_grams: number | null;
  water_ml: number | null;
  source: string;
  notes: string | null;
};

export function HealthMetricsLogger() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [editOpen, setEditOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('activity');

  const { data: metric, isLoading } = useQuery({
    queryKey: ['health-metric', selectedDate, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('daily_health_metrics')
        .select('*')
        .eq('metric_date', selectedDate)
        .maybeSingle();
      if (error) throw error;
      return data as HealthMetric | null;
    },
    enabled: !!user,
  });

  const [form, setForm] = useState({
    steps: '', distance_km: '', active_energy_cal: '',
    resting_heart_rate: '', avg_heart_rate: '', max_heart_rate: '',
    sleep_hours: '', sleep_quality: '', bedtime: '', wake_time: '',
    calories_consumed: '', protein_grams: '', carbs_grams: '', fat_grams: '', water_ml: '',
  });

  const openEdit = () => {
    if (metric) {
      setForm({
        steps: metric.steps?.toString() || '',
        distance_km: metric.distance_km?.toString() || '',
        active_energy_cal: metric.active_energy_cal?.toString() || '',
        resting_heart_rate: metric.resting_heart_rate?.toString() || '',
        avg_heart_rate: metric.avg_heart_rate?.toString() || '',
        max_heart_rate: metric.max_heart_rate?.toString() || '',
        sleep_hours: metric.sleep_hours?.toString() || '',
        sleep_quality: metric.sleep_quality || '',
        bedtime: metric.bedtime || '',
        wake_time: metric.wake_time || '',
        calories_consumed: metric.calories_consumed?.toString() || '',
        protein_grams: metric.protein_grams?.toString() || '',
        carbs_grams: metric.carbs_grams?.toString() || '',
        fat_grams: metric.fat_grams?.toString() || '',
        water_ml: metric.water_ml?.toString() || '',
      });
    } else {
      setForm({
        steps: '', distance_km: '', active_energy_cal: '',
        resting_heart_rate: '', avg_heart_rate: '', max_heart_rate: '',
        sleep_hours: '', sleep_quality: '', bedtime: '', wake_time: '',
        calories_consumed: '', protein_grams: '', carbs_grams: '', fat_grams: '', water_ml: '',
      });
    }
    setEditOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user) return;
      const payload = {
        user_id: user.id,
        metric_date: selectedDate,
        steps: form.steps ? parseInt(form.steps) : null,
        distance_km: form.distance_km ? parseFloat(form.distance_km) : null,
        active_energy_cal: form.active_energy_cal ? parseFloat(form.active_energy_cal) : null,
        resting_heart_rate: form.resting_heart_rate ? parseInt(form.resting_heart_rate) : null,
        avg_heart_rate: form.avg_heart_rate ? parseInt(form.avg_heart_rate) : null,
        max_heart_rate: form.max_heart_rate ? parseInt(form.max_heart_rate) : null,
        sleep_hours: form.sleep_hours ? parseFloat(form.sleep_hours) : null,
        sleep_quality: form.sleep_quality || null,
        bedtime: form.bedtime || null,
        wake_time: form.wake_time || null,
        calories_consumed: form.calories_consumed ? parseFloat(form.calories_consumed) : null,
        protein_grams: form.protein_grams ? parseFloat(form.protein_grams) : null,
        carbs_grams: form.carbs_grams ? parseFloat(form.carbs_grams) : null,
        fat_grams: form.fat_grams ? parseFloat(form.fat_grams) : null,
        water_ml: form.water_ml ? parseFloat(form.water_ml) : null,
        source: 'manual',
      };

      if (metric) {
        const { error } = await supabase
          .from('daily_health_metrics')
          .update(payload)
          .eq('id', metric.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('daily_health_metrics')
          .insert(payload as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['health-metric'] });
      queryClient.invalidateQueries({ queryKey: ['health-metrics-range'] });
      setEditOpen(false);
      toast({ title: 'Health data saved!' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const prevDay = () => setSelectedDate(format(subDays(new Date(selectedDate), 1), 'yyyy-MM-dd'));
  const nextDay = () => {
    const next = addDays(new Date(selectedDate), 1);
    if (next <= startOfDay(addDays(new Date(), 1))) {
      setSelectedDate(format(next, 'yyyy-MM-dd'));
    }
  };

  const numVal = (v: number | null | undefined) => v != null ? v.toLocaleString() : '—';

  return (
    <div className="space-y-4">
      {/* Date navigator + actions */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={prevDay}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-auto"
          />
          <Button variant="outline" size="icon" onClick={nextDay}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex gap-2">
          <Button onClick={openEdit}>
            <Plus className="w-4 h-4 mr-1" /> {metric ? 'Edit' : 'Log'} Data
          </Button>
          <HealthDataImporter />
        </div>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading...</p>
      ) : !metric ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No health data for {format(new Date(selectedDate), 'MMM d, yyyy')}. Tap "Log Data" to add.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Activity */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Footprints className="w-4 h-4 text-green-500" /> Activity
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Steps</span>
                <span className="font-medium">{numVal(metric.steps)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Distance</span>
                <span className="font-medium">{metric.distance_km != null ? `${metric.distance_km.toFixed(1)} km` : '—'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Active Cal</span>
                <span className="font-medium">{numVal(metric.active_energy_cal)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Heart Rate */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Heart className="w-4 h-4 text-red-500" /> Heart Rate
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Resting</span>
                <span className="font-medium">{metric.resting_heart_rate != null ? `${metric.resting_heart_rate} bpm` : '—'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Average</span>
                <span className="font-medium">{metric.avg_heart_rate != null ? `${metric.avg_heart_rate} bpm` : '—'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Max</span>
                <span className="font-medium">{metric.max_heart_rate != null ? `${metric.max_heart_rate} bpm` : '—'}</span>
              </div>
            </CardContent>
          </Card>

          {/* Sleep */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Moon className="w-4 h-4 text-indigo-500" /> Sleep
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Duration</span>
                <span className="font-medium">{metric.sleep_hours != null ? `${metric.sleep_hours.toFixed(1)} hrs` : '—'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Quality</span>
                <span className="font-medium capitalize">{metric.sleep_quality || '—'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Schedule</span>
                <span className="font-medium text-xs">
                  {metric.bedtime && metric.wake_time ? `${metric.bedtime.slice(0, 5)}–${metric.wake_time.slice(0, 5)}` : '—'}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Nutrition */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <UtensilsCrossed className="w-4 h-4 text-orange-500" /> Nutrition
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Calories</span>
                <span className="font-medium">{numVal(metric.calories_consumed)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Protein</span>
                <span className="font-medium">{metric.protein_grams != null ? `${metric.protein_grams}g` : '—'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Carbs / Fat</span>
                <span className="font-medium text-xs">
                  {metric.carbs_grams != null ? `${metric.carbs_grams}g` : '—'} / {metric.fat_grams != null ? `${metric.fat_grams}g` : '—'}
                </span>
              </div>
              {metric.water_ml != null && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Water</span>
                  <span className="font-medium">{metric.water_ml} ml</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Log Health Data — {format(new Date(selectedDate), 'MMM d, yyyy')}</DialogTitle>
          </DialogHeader>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="activity"><Footprints className="w-3.5 h-3.5" /></TabsTrigger>
              <TabsTrigger value="heart"><Heart className="w-3.5 h-3.5" /></TabsTrigger>
              <TabsTrigger value="sleep"><Moon className="w-3.5 h-3.5" /></TabsTrigger>
              <TabsTrigger value="nutrition"><UtensilsCrossed className="w-3.5 h-3.5" /></TabsTrigger>
            </TabsList>

            <TabsContent value="activity" className="space-y-3 mt-3">
              <div>
                <Label>Steps</Label>
                <Input type="number" placeholder="e.g. 10000" value={form.steps} onChange={e => setForm(f => ({ ...f, steps: e.target.value }))} />
              </div>
              <div>
                <Label>Distance (km)</Label>
                <Input type="number" step="0.1" placeholder="e.g. 7.5" value={form.distance_km} onChange={e => setForm(f => ({ ...f, distance_km: e.target.value }))} />
              </div>
              <div>
                <Label>Active Calories</Label>
                <Input type="number" placeholder="e.g. 450" value={form.active_energy_cal} onChange={e => setForm(f => ({ ...f, active_energy_cal: e.target.value }))} />
              </div>
            </TabsContent>

            <TabsContent value="heart" className="space-y-3 mt-3">
              <div>
                <Label>Resting Heart Rate (bpm)</Label>
                <Input type="number" placeholder="e.g. 62" value={form.resting_heart_rate} onChange={e => setForm(f => ({ ...f, resting_heart_rate: e.target.value }))} />
              </div>
              <div>
                <Label>Average Heart Rate (bpm)</Label>
                <Input type="number" placeholder="e.g. 75" value={form.avg_heart_rate} onChange={e => setForm(f => ({ ...f, avg_heart_rate: e.target.value }))} />
              </div>
              <div>
                <Label>Max Heart Rate (bpm)</Label>
                <Input type="number" placeholder="e.g. 165" value={form.max_heart_rate} onChange={e => setForm(f => ({ ...f, max_heart_rate: e.target.value }))} />
              </div>
            </TabsContent>

            <TabsContent value="sleep" className="space-y-3 mt-3">
              <div>
                <Label>Sleep Duration (hours)</Label>
                <Input type="number" step="0.1" placeholder="e.g. 7.5" value={form.sleep_hours} onChange={e => setForm(f => ({ ...f, sleep_hours: e.target.value }))} />
              </div>
              <div>
                <Label>Sleep Quality</Label>
                <Select value={form.sleep_quality} onValueChange={v => setForm(f => ({ ...f, sleep_quality: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select quality" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="poor">Poor</SelectItem>
                    <SelectItem value="fair">Fair</SelectItem>
                    <SelectItem value="good">Good</SelectItem>
                    <SelectItem value="excellent">Excellent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Bedtime</Label>
                  <Input type="time" value={form.bedtime} onChange={e => setForm(f => ({ ...f, bedtime: e.target.value }))} />
                </div>
                <div>
                  <Label>Wake Time</Label>
                  <Input type="time" value={form.wake_time} onChange={e => setForm(f => ({ ...f, wake_time: e.target.value }))} />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="nutrition" className="space-y-3 mt-3">
              <div>
                <Label>Calories Consumed</Label>
                <Input type="number" placeholder="e.g. 2100" value={form.calories_consumed} onChange={e => setForm(f => ({ ...f, calories_consumed: e.target.value }))} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label>Protein (g)</Label>
                  <Input type="number" placeholder="150" value={form.protein_grams} onChange={e => setForm(f => ({ ...f, protein_grams: e.target.value }))} />
                </div>
                <div>
                  <Label>Carbs (g)</Label>
                  <Input type="number" placeholder="200" value={form.carbs_grams} onChange={e => setForm(f => ({ ...f, carbs_grams: e.target.value }))} />
                </div>
                <div>
                  <Label>Fat (g)</Label>
                  <Input type="number" placeholder="70" value={form.fat_grams} onChange={e => setForm(f => ({ ...f, fat_grams: e.target.value }))} />
                </div>
              </div>
              <div>
                <Label>Water (ml)</Label>
                <Input type="number" placeholder="e.g. 2500" value={form.water_ml} onChange={e => setForm(f => ({ ...f, water_ml: e.target.value }))} />
              </div>
            </TabsContent>
          </Tabs>

          <Button onClick={() => saveMutation.mutate()} className="w-full mt-2" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? 'Saving...' : 'Save'}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
