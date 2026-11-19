import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

type Props = {
  spendingSummary: string;
  monthlyTrends: string;
  topMerchants: string;
  savingsRate: number;
  totalIncome: number;
  totalExpenses: number;
};

export function MonthlyFinancialSummary({ spendingSummary, monthlyTrends, topMerchants, savingsRate, totalIncome, totalExpenses }: Props) {
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function generateSummary() {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('monthly-summary', {
        body: {
          spending_summary: spendingSummary,
          monthly_trends: monthlyTrends,
          top_merchants: topMerchants,
          savings_rate: savingsRate,
          total_income: totalIncome,
          total_expenses: totalExpenses,
        },
      });

      if (error) throw error;
      setSummary(data.summary || 'No summary generated.');
    } catch (e: any) {
      toast.error(e.message || 'Failed to generate summary');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="w-4 h-4" />
          Monthly Financial Summary
        </CardTitle>
      </CardHeader>
      <CardContent>
        {summary ? (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            {summary.split('\n').map((line, i) => (
              <p key={i} className="text-sm leading-relaxed mb-2">{line}</p>
            ))}
            <Button variant="outline" size="sm" className="mt-4" onClick={generateSummary} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
              Regenerate
            </Button>
          </div>
        ) : (
          <div className="text-center py-6">
            <p className="text-sm text-muted-foreground mb-4">
              Get an AI-generated narrative summary of your monthly finances.
            </p>
            <Button onClick={generateSummary} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
              Generate Summary
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

