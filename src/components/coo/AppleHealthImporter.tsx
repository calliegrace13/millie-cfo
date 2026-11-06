import { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Watch, Upload, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';

type ParsedWorkout = {
  name: string;
  workout_type: string;
  duration_minutes: number | null;
  calories_burned: number | null;
  workout_date: string;
  selected: boolean;
};

const WORKOUT_TYPE_MAP: Record<string, string> = {
  'HKWorkoutActivityTypeRunning': 'Running',
  'HKWorkoutActivityTypeWalking': 'Walking',
  'HKWorkoutActivityTypeCycling': 'Cycling',
  'HKWorkoutActivityTypeSwimming': 'Swimming',
  'HKWorkoutActivityTypeYoga': 'Yoga',
  'HKWorkoutActivityTypeHighIntensityIntervalTraining': 'HIIT',
  'HKWorkoutActivityTypeTraditionalStrengthTraining': 'Strength',
  'HKWorkoutActivityTypeFunctionalStrengthTraining': 'Strength',
  'HKWorkoutActivityTypeCrossTraining': 'HIIT',
  'HKWorkoutActivityTypeElliptical': 'Cardio',
  'HKWorkoutActivityTypeRowing': 'Cardio',
  'HKWorkoutActivityTypeStairClimbing': 'Cardio',
  'HKWorkoutActivityTypePilates': 'Yoga',
  'HKWorkoutActivityTypeDance': 'Cardio',
  'HKWorkoutActivityTypeHiking': 'Walking',
};

function parseAppleHealthXML(xmlText: string): ParsedWorkout[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');
  const workoutNodes = doc.querySelectorAll('Workout');
  const workouts: ParsedWorkout[] = [];

  workoutNodes.forEach(node => {
    const activityType = node.getAttribute('workoutActivityType') || '';
    const duration = parseFloat(node.getAttribute('duration') || '0');
    const totalEnergyBurned = parseFloat(node.getAttribute('totalEnergyBurned') || '0');
    const startDate = node.getAttribute('startDate') || '';
    const workoutType = WORKOUT_TYPE_MAP[activityType] || 'Other';
    const cleanName = activityType.replace('HKWorkoutActivityType', '').replace(/([A-Z])/g, ' $1').trim();

    workouts.push({
      name: cleanName || workoutType,
      workout_type: workoutType,
      duration_minutes: duration > 0 ? Math.round(duration) : null,
      calories_burned: totalEnergyBurned > 0 ? Math.round(totalEnergyBurned) : null,
      workout_date: startDate ? format(new Date(startDate), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
      selected: true,
    });
  });

  return workouts.sort((a, b) => b.workout_date.localeCompare(a.workout_date));
}

export function AppleHealthImporter() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [parsedWorkouts, setParsedWorkouts] = useState<ParsedWorkout[]>([]);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true);

    try {
      const text = await file.text();
      const workouts = parseAppleHealthXML(text);
      if (workouts.length === 0) {
        toast({ title: 'No workouts found', description: 'Could not find workout data in this file. Make sure you exported from Apple Health.', variant: 'destructive' });
      }
      setParsedWorkouts(workouts.slice(0, 100)); // Limit to 100
    } catch (err: any) {
      toast({ title: 'Parse error', description: err.message, variant: 'destructive' });
    } finally {
      setParsing(false);
    }
  };

  const importWorkouts = async () => {
    if (!user) return;
    const selected = parsedWorkouts.filter(w => w.selected);
    if (selected.length === 0) return;

    setImporting(true);
    try {
      const { error } = await supabase.from('workouts').insert(
        selected.map(w => ({
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
      toast({ title: `${selected.length} workouts imported!` });
      queryClient.invalidateQueries({ queryKey: ['workouts'] });
      setOpen(false);
      setParsedWorkouts([]);
    } catch (e: any) {
      toast({ title: 'Import failed', description: e.message, variant: 'destructive' });
    } finally {
      setImporting(false);
    }
  };

  const toggleItem = (idx: number) => {
    setParsedWorkouts(w => w.map((item, i) => i === idx ? { ...item, selected: !item.selected } : item));
  };

  const toggleAll = (checked: boolean) => {
    setParsedWorkouts(w => w.map(item => ({ ...item, selected: checked })));
  };

  const selectedCount = parsedWorkouts.filter(w => w.selected).length;

  return (
    <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) setParsedWorkouts([]); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Watch className="w-4 h-4 mr-1" /> Import Apple Health
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Watch className="w-5 h-5" />
            Import from Apple Health
          </DialogTitle>
        </DialogHeader>

        {parsedWorkouts.length === 0 ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Export your health data from the Apple Health app on your iPhone:
            </p>
            <ol className="text-sm text-muted-foreground space-y-1 list-decimal pl-5">
              <li>Open <strong>Health</strong> app on your iPhone</li>
              <li>Tap your profile picture → <strong>Export All Health Data</strong></li>
              <li>This creates a ZIP file — unzip it and find <code>export.xml</code></li>
              <li>Upload that file below</li>
            </ol>
            <input ref={fileRef} type="file" accept=".xml" onChange={handleFileSelect} className="hidden" />
            <Button onClick={() => fileRef.current?.click()} disabled={parsing} className="w-full">
              {parsing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Parsing...</> : <><Upload className="w-4 h-4 mr-2" /> Select export.xml</>}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Checkbox checked={selectedCount === parsedWorkouts.length} onCheckedChange={c => toggleAll(!!c)} />
                <span className="text-sm text-muted-foreground">{selectedCount} of {parsedWorkouts.length} selected</span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setParsedWorkouts([])}>Re-upload</Button>
            </div>

            <div className="space-y-1 max-h-[40vh] overflow-y-auto">
              {parsedWorkouts.map((w, idx) => (
                <div key={idx} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-card border border-border">
                  <Checkbox checked={w.selected} onCheckedChange={() => toggleItem(idx)} />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-foreground">{w.name}</span>
                    <div className="flex gap-2 text-xs text-muted-foreground">
                      <span>{w.workout_date}</span>
                      {w.duration_minutes && <span>{w.duration_minutes} min</span>}
                      {w.calories_burned && <span>{w.calories_burned} cal</span>}
                    </div>
                  </div>
                  <Badge variant="secondary" className="text-xs shrink-0">{w.workout_type}</Badge>
                </div>
              ))}
            </div>

            <Button onClick={importWorkouts} disabled={importing || selectedCount === 0} className="w-full">
              {importing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Import {selectedCount} workouts
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
