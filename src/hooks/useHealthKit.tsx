import { useState, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import { format, subDays } from 'date-fns';

const WORKOUT_TYPE_LABELS: Record<string, string> = {
  running: 'Running',
  walking: 'Walking',
  cycling: 'Cycling',
  swimming: 'Swimming',
  yoga: 'Yoga',
  strengthTraining: 'Strength',
  traditionalStrengthTraining: 'Strength',
  crossTraining: 'HIIT',
  elliptical: 'Cardio',
  rowing: 'Cardio',
  stairClimbing: 'Cardio',
  hiking: 'Walking',
  tennis: 'Cardio',
  basketball: 'Cardio',
  soccer: 'Cardio',
  other: 'Other',
};

function cleanWorkoutName(type: string): string {
  return type
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, s => s.toUpperCase())
    .trim();
}

export function useHealthKit() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const [lastSyncCount, setLastSyncCount] = useState<number | null>(null);

  const isNative = Capacitor.isNativePlatform();
  const isIOS = Capacitor.getPlatform() === 'ios';
  const available = isNative && isIOS;

  const requestPermissions = useCallback(async () => {
    if (!available) return false;
    try {
      const { Health } = await import('@capgo/capacitor-health');
      const { available: sdkAvailable } = await Health.isAvailable();
      if (!sdkAvailable) return false;
      await Health.requestAuthorization({
        read: ['calories', 'distance', 'steps'],
        write: [],
      });
      return true;
    } catch (e: any) {
      console.error('HealthKit permission error:', e);
      toast({ title: 'HealthKit access denied', description: e.message, variant: 'destructive' });
      return false;
    }
  }, [available]);

  const syncWorkouts = useCallback(async (daysBack = 30) => {
    if (!user || !available) return;
    setSyncing(true);
    setLastSyncCount(null);

    try {
      const { Health } = await import('@capgo/capacitor-health');
      const granted = await requestPermissions();
      if (!granted) {
        setSyncing(false);
        return;
      }

      const startDate = subDays(new Date(), daysBack);
      const endDate = new Date();

      const result = await Health.queryWorkouts({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        limit: 200,
        ascending: false,
      });

      const samples = result.workouts || [];

      if (samples.length === 0) {
        toast({ title: 'No new workouts found', description: `Checked the last ${daysBack} days.` });
        setLastSyncCount(0);
        setSyncing(false);
        return;
      }

      // Fetch existing apple_health workouts to avoid duplicates
      const { data: existing } = await supabase
        .from('workouts')
        .select('workout_date, name, duration_minutes')
        .eq('source', 'apple_health');

      const existingKeys = new Set(
        (existing || []).map(w => `${w.workout_date}|${w.name}|${w.duration_minutes}`)
      );

      const workouts = samples
        .map(s => {
          const workoutType = WORKOUT_TYPE_LABELS[s.workoutType] || 'Other';
          const name = cleanWorkoutName(s.workoutType) || workoutType;
          const durationMin = s.duration > 0 ? Math.round(s.duration / 60) : null;
          const calories = s.totalEnergyBurned ? Math.round(s.totalEnergyBurned) : null;
          const dateStr = format(new Date(s.startDate), 'yyyy-MM-dd');

          return { name, workout_type: workoutType, duration_minutes: durationMin, calories_burned: calories, workout_date: dateStr };
        })
        .filter(w => !existingKeys.has(`${w.workout_date}|${w.name}|${w.duration_minutes}`));

      if (workouts.length === 0) {
        toast({ title: 'Already up to date', description: 'No new workouts to import.' });
        setLastSyncCount(0);
        setSyncing(false);
        return;
      }

      const { error } = await supabase.from('workouts').insert(
        workouts.map(w => ({
          user_id: user.id,
          name: w.name,
          workout_type: w.workout_type,
          duration_minutes: w.duration_minutes,
          calories_burned: w.calories_burned,
          workout_date: w.workout_date,
          source: 'apple_health',
        })) as any
      );

      if (error) throw error;

      setLastSyncCount(workouts.length);
      toast({ title: `${workouts.length} workouts synced from Apple Health!` });
      queryClient.invalidateQueries({ queryKey: ['workouts'] });
      queryClient.invalidateQueries({ queryKey: ['workouts-stats'] });
    } catch (e: any) {
      console.error('HealthKit sync error:', e);
      toast({ title: 'Sync failed', description: e.message, variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  }, [user, available, requestPermissions, queryClient]);

  return { available, syncing, lastSyncCount, syncWorkouts, requestPermissions };
}
