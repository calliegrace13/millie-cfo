import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/format';
import { Sparkles, Loader2, ArrowUp, ArrowDown, Minus, RefreshCw } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

type Suggestion = {
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
};

type Props = {
  spendingSummary: string;
  monthlyTrends: string;
  topMerchants: string;
  savingsRate: number;
  healthScore: number;
};

export function AIHabitSuggestions({ spendingSummary, monthlyTrends, topMerchants, savingsRate, healthScore }: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  const fetchSuggestions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('spending-insights', {
        body: {
          spending_summary: spendingSummary,
          monthly_trends: monthlyTrends,
          top_merchants: topMerchants,
          savings_rate: savingsRate.toFixed(1),
          health_score: healthScore,
        },
      });

      if (error) throw error;
      if (data?.suggestions) {
        setSuggestions(data.suggestions);
        setHasLoaded(true);
      }
    } catch (e: any) {
      console.error('AI suggestions error:', e);
      toast({ title: 'Could not generate suggestions', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const impactColor = (impact: string) => {
    if (impact === 'high') return 'border-success text-success';
    if (impact === 'medium') return 'border-warning text-warning';
    return 'border-muted-foreground text-muted-foreground';
  };

  if (!hasLoaded) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <Sparkles className="w-8 h-8 mx-auto mb-3 text-primary" />
          <p className="text-sm text-muted-foreground mb-4">
            Get AI-powered suggestions to optimize your spending habits based on your actual transaction data.
          </p>
          <Button onClick={fetchSuggestions} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
            Analyze My Spending
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          AI Suggestions
        </h3>
        <Button variant="ghost" size="sm" onClick={fetchSuggestions} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        </Button>
      </div>

      {suggestions.map((s, i) => (
        <Card key={i}>
          <CardContent className="py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-sm">{s.title}</p>
                <p className="text-xs text-muted-foreground mt-1">{s.description}</p>
              </div>
              <Badge variant="outline" className={cn("shrink-0", impactColor(s.impact))}>
                {s.impact}
              </Badge>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

