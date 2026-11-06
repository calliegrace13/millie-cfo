import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/format';
import { AlertTriangle, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Transaction, RecurringTransaction } from '@/lib/types';
import { parseISO, differenceInDays, format, subMonths } from 'date-fns';

type Props = {
  recurring: RecurringTransaction[];
  transactions: Transaction[];
};

type SubscriptionAnalysis = {
  item: RecurringTransaction;
  priceHistory: { date: string; amount: number }[];
  priceChange: number; // percentage
  priceDirection: 'up' | 'down' | 'stable';
  monthlyEquivalent: number;
  isOverdue: boolean;
  overdueDays: number;
};

function normalizeName(name: string): string {
  return name.toLowerCase().trim()
    .replace(/\s+jpm[a-z0-9]+$/i, '')
    .replace(/\s+[a-z0-9]{8,}$/i, '')
    .replace(/\s+\d{2}\/\d{2}$/i, '')
    .trim();
}

function getMonthlyEquiv(amount: number, freq: string): number {
  switch (freq) {
    case 'weekly': return Math.abs(amount) * 4.33;
    case 'biweekly': return Math.abs(amount) * 2.17;
    case 'monthly': return Math.abs(amount);
    case 'quarterly': return Math.abs(amount) / 3;
    case 'yearly': return Math.abs(amount) / 12;
    default: return Math.abs(amount);
  }
}

export function SubscriptionTracker({ recurring, transactions }: Props) {
  const analysis = useMemo(() => {
    const sixMonthsAgo = subMonths(new Date(), 6);
    const results: SubscriptionAnalysis[] = [];

    recurring.filter(r => r.is_active && r.expected_amount > 0).forEach(item => {
      const key = normalizeName(item.merchant_name || item.name);
      const matchingTx = transactions
        .filter(tx => {
          const txKey = normalizeName(tx.merchant_name || tx.name);
          return txKey === key && tx.amount > 0 && parseISO(tx.date) >= sixMonthsAgo;
        })
        .sort((a, b) => a.date.localeCompare(b.date));

      const priceHistory = matchingTx.map(tx => ({ date: tx.date, amount: tx.amount }));

      let priceChange = 0;
      let priceDirection: 'up' | 'down' | 'stable' = 'stable';
      if (priceHistory.length >= 2) {
        const first = priceHistory[0].amount;
        const last = priceHistory[priceHistory.length - 1].amount;
        priceChange = first > 0 ? ((last - first) / first) * 100 : 0;
        priceDirection = priceChange > 2 ? 'up' : priceChange < -2 ? 'down' : 'stable';
      }

      let isOverdue = false;
      let overdueDays = 0;
      if (item.next_expected_date) {
        overdueDays = differenceInDays(new Date(), parseISO(item.next_expected_date));
        isOverdue = overdueDays > 7;
      }

      results.push({
        item,
        priceHistory,
        priceChange: Math.round(priceChange * 10) / 10,
        priceDirection,
        monthlyEquivalent: getMonthlyEquiv(item.expected_amount, item.frequency),
        isOverdue,
        overdueDays,
      });
    });

    results.sort((a, b) => b.monthlyEquivalent - a.monthlyEquivalent);
    return results;
  }, [recurring, transactions]);

  const totalMonthly = analysis.reduce((s, a) => s + a.monthlyEquivalent, 0);
  const priceIncreases = analysis.filter(a => a.priceDirection === 'up');
  const overdueItems = analysis.filter(a => a.isOverdue);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Active Subscriptions</p>
            <p className="text-2xl font-bold">{analysis.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Monthly Cost</p>
            <p className="text-2xl font-bold">{formatCurrency(totalMonthly)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Annual Cost</p>
            <p className="text-2xl font-bold">{formatCurrency(totalMonthly * 12)}</p>
          </CardContent>
        </Card>
      </div>

      {priceIncreases.length > 0 && (
        <Card className="border-warning/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-warning" />
              Price Increases Detected
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {priceIncreases.map(a => (
                <div key={a.item.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-warning/5">
                  <span className="font-medium text-sm">{a.item.name}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="destructive" className="text-xs">
                      <TrendingUp className="w-3 h-3 mr-1" />
                      +{a.priceChange}%
                    </Badge>
                    {a.priceHistory.length >= 2 && (
                      <span className="text-xs text-muted-foreground">
                        {formatCurrency(a.priceHistory[0].amount)} → {formatCurrency(a.priceHistory[a.priceHistory.length - 1].amount)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {overdueItems.length > 0 && (
        <Card className="border-destructive/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              Possibly Missed Charges
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {overdueItems.map(a => (
                <div key={a.item.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-destructive/5">
                  <span className="font-medium text-sm">{a.item.name}</span>
                  <span className="text-xs text-muted-foreground">
                    Expected {a.item.next_expected_date ? format(parseISO(a.item.next_expected_date), 'MMM d') : '—'} ({a.overdueDays}d ago)
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">All Subscriptions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {analysis.map(a => (
              <div key={a.item.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50">
                <div className="flex items-center gap-3">
                  {a.priceDirection === 'up' ? <TrendingUp className="w-4 h-4 text-destructive" /> :
                   a.priceDirection === 'down' ? <TrendingDown className="w-4 h-4 text-success" /> :
                   <Minus className="w-4 h-4 text-muted-foreground" />}
                  <div>
                    <p className="font-medium text-sm">{a.item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.item.frequency} · {a.item.category || 'Uncategorized'}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-mono text-sm font-medium">{formatCurrency(Math.abs(a.item.expected_amount))}</p>
                  <p className="text-xs text-muted-foreground">{formatCurrency(a.monthlyEquivalent)}/mo</p>
                </div>
              </div>
            ))}
            {analysis.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No active subscriptions found. Use Auto-Detect on the Recurring page to find them.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
