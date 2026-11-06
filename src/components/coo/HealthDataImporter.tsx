import { useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Watch, Upload, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';

type DayBucket = {
  date: string;
  steps: number;
  distance_km: number;
  active_energy_cal: number;
  resting_hr: number[];
  sleep_hours: number;
  dietary_calories: number;
  dietary_protein: number;
  dietary_carbs: number;
  dietary_fat: number;
};

function parseHealthExportXML(xmlText: string): DayBucket[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');
  const records = doc.querySelectorAll('Record');
  const buckets = new Map<string, DayBucket>();

  const getBucket = (dateStr: string): DayBucket => {
    const d = format(new Date(dateStr), 'yyyy-MM-dd');
    if (!buckets.has(d)) {
      buckets.set(d, {
        date: d, steps: 0, distance_km: 0, active_energy_cal: 0,
        resting_hr: [], sleep_hours: 0,
        dietary_calories: 0, dietary_protein: 0, dietary_carbs: 0, dietary_fat: 0,
      });
    }
    return buckets.get(d)!;
  };

  records.forEach(rec => {
    const type = rec.getAttribute('type') || '';
    const startDate = rec.getAttribute('startDate') || '';
    const value = parseFloat(rec.getAttribute('value') || '0');
    if (!startDate || isNaN(value)) return;

    const bucket = getBucket(startDate);

    switch (type) {
      case 'HKQuantityTypeIdentifierStepCount':
        bucket.steps += Math.round(value);
        break;
      case 'HKQuantityTypeIdentifierDistanceWalkingRunning':
        bucket.distance_km += value; // already in km from Apple Health
        break;
      case 'HKQuantityTypeIdentifierActiveEnergyBurned':
        bucket.active_energy_cal += value;
        break;
      case 'HKQuantityTypeIdentifierRestingHeartRate':
        bucket.resting_hr.push(Math.round(value));
        break;
      case 'HKQuantityTypeIdentifierHeartRate':
        // We'll use heart rate records as avg proxy
        break;
      case 'HKCategoryTypeIdentifierSleepAnalysis':
        // Sleep analysis: value=1 means InBed/Asleep
        // duration = endDate - startDate
        const endDate = rec.getAttribute('endDate');
        if (endDate) {
          const durationHrs = (new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60);
          if (durationHrs > 0 && durationHrs < 24) {
            bucket.sleep_hours += durationHrs;
          }
        }
        break;
      case 'HKQuantityTypeIdentifierDietaryEnergyConsumed':
        bucket.dietary_calories += value;
        break;
      case 'HKQuantityTypeIdentifierDietaryProtein':
        bucket.dietary_protein += value;
        break;
      case 'HKQuantityTypeIdentifierDietaryCarbohydrates':
        bucket.dietary_carbs += value;
        break;
      case 'HKQuantityTypeIdentifierDietaryFatTotal':
        bucket.dietary_fat += value;
        break;
    }
  });

  return Array.from(buckets.values())
    .filter(b => b.steps > 0 || b.sleep_hours > 0 || b.resting_hr.length > 0 || b.dietary_calories > 0)
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function HealthDataImporter() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [parsed, setParsed] = useState<DayBucket[]>([]);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true);
    try {
      const text = await file.text();
      const data = parseHealthExportXML(text);
      if (data.length === 0) {
        toast({ title: 'No health data found', description: 'Could not find metrics in this file.', variant: 'destructive' });
      }
      // Limit to last 90 days
      setParsed(data.slice(0, 90));
    } catch (err: any) {
      toast({ title: 'Parse error', description: err.message, variant: 'destructive' });
    } finally {
      setParsing(false);
    }
  };

  const importData = async () => {
    if (!user || parsed.length === 0) return;
    setImporting(true);
    try {
      // Upsert daily metrics
      let imported = 0;
      const batchSize = 20;
      for (let i = 0; i < parsed.length; i += batchSize) {
        const batch = parsed.slice(i, i + batchSize).map(b => ({
          user_id: user.id,
          metric_date: b.date,
          steps: b.steps > 0 ? b.steps : null,
          distance_km: b.distance_km > 0 ? Math.round(b.distance_km * 10) / 10 : null,
          active_energy_cal: b.active_energy_cal > 0 ? Math.round(b.active_energy_cal) : null,
          resting_heart_rate: b.resting_hr.length > 0 ? Math.round(b.resting_hr.reduce((a, b) => a + b, 0) / b.resting_hr.length) : null,
          sleep_hours: b.sleep_hours > 0 ? Math.round(b.sleep_hours * 10) / 10 : null,
          calories_consumed: b.dietary_calories > 0 ? Math.round(b.dietary_calories) : null,
          protein_grams: b.dietary_protein > 0 ? Math.round(b.dietary_protein) : null,
          carbs_grams: b.dietary_carbs > 0 ? Math.round(b.dietary_carbs) : null,
          fat_grams: b.dietary_fat > 0 ? Math.round(b.dietary_fat) : null,
          source: 'apple_health',
        }));

        const { error } = await supabase
          .from('daily_health_metrics')
          .upsert(batch as any, { onConflict: 'user_id,metric_date' });
        if (error) throw error;
        imported += batch.length;
      }

      toast({ title: `${imported} days of health data imported!` });
      queryClient.invalidateQueries({ queryKey: ['health-metric'] });
      queryClient.invalidateQueries({ queryKey: ['health-metrics-range'] });
      setOpen(false);
      setParsed([]);
    } catch (e: any) {
      toast({ title: 'Import failed', description: e.message, variant: 'destructive' });
    } finally {
      setImporting(false);
    }
  };

  const summary = parsed.length > 0 ? {
    days: parsed.length,
    stepsAvg: Math.round(parsed.reduce((s, b) => s + b.steps, 0) / parsed.filter(b => b.steps > 0).length || 1),
    sleepAvg: (parsed.reduce((s, b) => s + b.sleep_hours, 0) / parsed.filter(b => b.sleep_hours > 0).length || 0).toFixed(1),
    hasHR: parsed.some(b => b.resting_hr.length > 0),
    hasNutrition: parsed.some(b => b.dietary_calories > 0),
  } : null;

  return (
    <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) setParsed([]); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Watch className="w-4 h-4 mr-1" /> Import Apple Health
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Watch className="w-5 h-5" />
            Import Health Data
          </DialogTitle>
        </DialogHeader>

        {parsed.length === 0 ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Import steps, heart rate, sleep, and nutrition data from Apple Health.
            </p>
            <ol className="text-sm text-muted-foreground space-y-1 list-decimal pl-5">
              <li>Open <strong>Health</strong> app → Profile → <strong>Export All Health Data</strong></li>
              <li>Unzip the file and find <code>export.xml</code></li>
              <li>Upload that file below</li>
            </ol>
            <input ref={fileRef} type="file" accept=".xml" onChange={handleFileSelect} className="hidden" />
            <Button onClick={() => fileRef.current?.click()} disabled={parsing} className="w-full">
              {parsing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Parsing...</> : <><Upload className="w-4 h-4 mr-2" /> Select export.xml</>}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <p className="text-sm font-medium">Found data for {summary!.days} days</p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">Avg {summary!.stepsAvg.toLocaleString()} steps/day</Badge>
                {parseFloat(summary!.sleepAvg) > 0 && <Badge variant="secondary">Avg {summary!.sleepAvg} hrs sleep</Badge>}
                {summary!.hasHR && <Badge variant="secondary">Heart rate ✓</Badge>}
                {summary!.hasNutrition && <Badge variant="secondary">Nutrition ✓</Badge>}
              </div>
              <p className="text-xs text-muted-foreground">
                Date range: {parsed[parsed.length - 1].date} → {parsed[0].date}
              </p>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setParsed([])} className="flex-1">Re-upload</Button>
              <Button onClick={importData} disabled={importing} className="flex-1">
                {importing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Import All
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
