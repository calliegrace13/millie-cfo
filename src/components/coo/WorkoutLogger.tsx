import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Trash2, Dumbbell, Clock, Flame, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import { AppleHealthImporter } from './AppleHealthImporter';

const WORKOUT_TYPES = ['Strength', 'Cardio', 'HIIT', 'Yoga', 'Running', 'Cycling', 'Swimming', 'Walking', 'Other'];

type Workout = {
  id: string;
  name: string;
  workout_type: string;
  duration_minutes: number | null;
  calories_burned: number | null;
  notes: string | null;
  source: string;
  workout_date: string;
  created_at: string;
};

export function WorkoutLogger() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  
  const [form, setForm] = useState({
    name: '', workout_type: 'Strength', duration_minutes: '', calories_burned: '', notes: '', workout_date: format(new Date(), 'yyyy-MM-dd'),
  });

  const { data: workouts = [], isLoading } = useQuery({
    queryKey: ['workouts', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workouts')
        .select('*')
        .order('workout_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as Workout[];
    },
    enabled: !!user,
  });

  const addWorkout = useMutation({
    mutationFn: async () => {
      if (!user || !form.name.trim()) return;
      const { error } = await supabase.from('workouts').insert({
        user_id: user.id,
        name: form.name.trim(),
        workout_type: form.workout_type,
        duration_minutes: form.duration_minutes ? parseInt(form.duration_minutes) : null,
        calories_burned: form.calories_burned ? parseFloat(form.calories_burned) : null,
        notes: form.notes || null,
        workout_date: form.workout_date,
        source: 'manual',
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workouts'] });
      setOpen(false);
      setForm({ name: '', workout_type: 'Strength', duration_minutes: '', calories_burned: '', notes: '', workout_date: format(new Date(), 'yyyy-MM-dd') });
      toast({ title: 'Workout logged!' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const deleteWorkout = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('workouts').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['workouts'] }),
  });

  const typeColors: Record<string, string> = {
    Strength: 'bg-blue-500/10 text-blue-600',
    Cardio: 'bg-red-500/10 text-red-600',
    HIIT: 'bg-orange-500/10 text-orange-600',
    Running: 'bg-green-500/10 text-green-600',
    Cycling: 'bg-yellow-500/10 text-yellow-600',
    Yoga: 'bg-purple-500/10 text-purple-600',
    Swimming: 'bg-cyan-500/10 text-cyan-600',
    Walking: 'bg-emerald-500/10 text-emerald-600',
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-1" /> Log Workout</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Log Workout</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Input placeholder="Workout name (e.g. Upper Body, 5K Run)" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              <div className="grid grid-cols-2 gap-3">
                <Select value={form.workout_type} onValueChange={v => setForm(f => ({ ...f, workout_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {WORKOUT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input type="date" value={form.workout_date} onChange={e => setForm(f => ({ ...f, workout_date: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input type="number" placeholder="Duration (min)" value={form.duration_minutes} onChange={e => setForm(f => ({ ...f, duration_minutes: e.target.value }))} />
                <Input type="number" placeholder="Calories burned" value={form.calories_burned} onChange={e => setForm(f => ({ ...f, calories_burned: e.target.value }))} />
              </div>
              <Textarea placeholder="Notes (optional)" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
              <Button onClick={() => addWorkout.mutate()} disabled={!form.name.trim()} className="w-full">Save Workout</Button>
            </div>
          </DialogContent>
        </Dialog>
        <AppleHealthImporter />
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading...</p>
      ) : workouts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Dumbbell className="w-8 h-8 mx-auto mb-2 opacity-50" />
            No workouts logged yet. Start by logging your first workout!
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {workouts.map(w => (
            <Card key={w.id} className="group">
              <CardContent className="py-3 px-4">
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-foreground">{w.name}</span>
                      <Badge variant="secondary" className={`text-xs ${typeColors[w.workout_type] || ''}`}>{w.workout_type}</Badge>
                      {w.source !== 'manual' && <Badge variant="outline" className="text-xs">Apple Health</Badge>}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{format(new Date(w.workout_date), 'MMM d, yyyy')}</span>
                      {w.duration_minutes && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{w.duration_minutes} min</span>}
                      {w.calories_burned && <span className="flex items-center gap-1"><Flame className="w-3 h-3" />{Math.round(w.calories_burned)} cal</span>}
                    </div>
                  </div>
                  <button onClick={() => deleteWorkout.mutate(w.id)} className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <Trash2 className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

