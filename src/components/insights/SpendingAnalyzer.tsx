import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { formatCurrency } from '@/lib/format';
import { Transaction, Account } from '@/lib/types';
import { TrendingUp, TrendingDown, AlertTriangle, ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { format, subMonths, startOfMonth, endOfMonth, parseISO, isWithinInterval } from 'date-fns';

type Props = {
  transactions: Transaction[];
  accounts: Account[];
  getMultiplier: (tx: Transaction, accounts: Account[]) => number;
};

type CategoryTrend = {
  category: string;
  currentMonth: number;
  previousMonth: number;
  threeMonthAvg: number;
  changePercent: number;
  isAnomaly: boolean;
  direction: 'up' | 'down' | 'flat';
};

type MerchantPattern = {
  merchant: string;
  totalSpent: number;
  txCount: number;
  avgAmount: number;
  categories: string[];
  trend: 'increasing' | 'decreasing' | 'stable';
};

export function SpendingAnalyzer({ transactions, accounts, getMultiplier }: Props) {
  const now = new Date();

  const monthlyBuckets = useMemo(() => {
    const buckets: Record<string, Transaction[]> = {};
    for (let i = 0; i < 6; i++) {
      const d = subMonths(now, i);
      const key = format(d, 'yyyy-MM');
      const start = startOfMonth(d);
      const end = endOfMonth(d);
      buckets[key] = transactions.filter(tx => {
        const txDate = parseISO(tx.date);
        return tx.amount > 0 && isWithinInterval(txDate, { start, end });
      });
    }
    return buckets;
  }, [transactions]);

  const currentKey = format(now, 'yyyy-MM');
  const prevKey = format(subMonths(now, 1), 'yyyy-MM');

  // Category trends
  const categoryTrends = useMemo(() => {
    const getCategoryTotals = (txs: Transaction[]) => {
      const totals: Record<string, number> = {};
      txs.forEach(tx => {
        const cat = tx.category || 'Uncategorized';
        if (cat === 'Transfer' || cat === 'Credit Card Payment') return;
        const scaled = tx.amount * getMultiplier(tx, accounts);
        totals[cat] = (totals[cat] || 0) + scaled;
      });
      return totals;
    };

    const currentTotals = getCategoryTotals(monthlyBuckets[currentKey] || []);
    const prevTotals = getCategoryTotals(monthlyBuckets[prevKey] || []);

    // 3-month average (months 1-3 ago)
    const avgTotals: Record<string, number> = {};
    for (let i = 1; i <= 3; i++) {
      const key = format(subMonths(now, i), 'yyyy-MM');
      const totals = getCategoryTotals(monthlyBuckets[key] || []);
      Object.entries(totals).forEach(([cat, val]) => {
        avgTotals[cat] = (avgTotals[cat] || 0) + val / 3;
      });
    }

    const allCategories = new Set([...Object.keys(currentTotals), ...Object.keys(prevTotals)]);

    const trends: CategoryTrend[] = Array.from(allCategories).map(cat => {
      const current = currentTotals[cat] || 0;
      const prev = prevTotals[cat] || 0;
      const avg = avgTotals[cat] || 0;
      const changePercent = prev > 0 ? ((current - prev) / prev) * 100 : current > 0 ? 100 : 0;
      const isAnomaly = avg > 0 && current > avg * 1.5; // 50%+ above 3-month avg
      const direction: 'up' | 'down' | 'flat' = changePercent > 10 ? 'up' : changePercent < -10 ? 'down' : 'flat';

      return { category: cat, currentMonth: current, previousMonth: prev, threeMonthAvg: avg, changePercent, isAnomaly, direction };
    });

    return trends.filter(t => t.currentMonth > 0 || t.previousMonth > 0).sort((a, b) => b.currentMonth - a.currentMonth);
  }, [monthlyBuckets, accounts, getMultiplier]);

  // Merchant patterns (top spenders)
  const merchantPatterns = useMemo(() => {
    const threeMonthsAgo = subMonths(now, 3);
    const recentTxs = transactions.filter(tx => tx.amount > 0 && parseISO(tx.date) >= threeMonthsAgo);

    const merchantMap: Record<string, { total: number; count: number; categories: Set<string>; amounts: number[] }> = {};
    recentTxs.forEach(tx => {
      const name = tx.merchant_name || tx.name;
      if (!merchantMap[name]) merchantMap[name] = { total: 0, count: 0, categories: new Set(), amounts: [] };
      const scaled = tx.amount * getMultiplier(tx, accounts);
      merchantMap[name].total += scaled;
      merchantMap[name].count += 1;
      merchantMap[name].amounts.push(scaled);
      if (tx.category) merchantMap[name].categories.add(tx.category);
    });

    return Object.entries(merchantMap)
      .filter(([, v]) => v.count >= 2)
      .map(([merchant, v]) => {
        const half = Math.floor(v.amounts.length / 2);
        const firstHalf = v.amounts.slice(0, half).reduce((s, a) => s + a, 0);
        const secondHalf = v.amounts.slice(half).reduce((s, a) => s + a, 0);
        const trend: 'increasing' | 'decreasing' | 'stable' =
          secondHalf > firstHalf * 1.2 ? 'increasing' : secondHalf < firstHalf * 0.8 ? 'decreasing' : 'stable';

        return {
          merchant,
          totalSpent: v.total,
          txCount: v.count,
          avgAmount: v.total / v.count,
          categories: Array.from(v.categories),
          trend,
        } as MerchantPattern;
      })
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 10);
  }, [transactions, accounts, getMultiplier]);

  // Anomalies
  const anomalies = categoryTrends.filter(t => t.isAnomaly);

  const totalCurrentExpenses = categoryTrends.reduce((s, t) => s + t.currentMonth, 0);
  const totalPrevExpenses = categoryTrends.reduce((s, t) => s + t.previousMonth, 0);
  const overallChange = totalPrevExpenses > 0 ? ((totalCurrentExpenses - totalPrevExpenses) / totalPrevExpenses) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Overall Summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="py-6">
            <p className="text-sm text-muted-foreground">This Month</p>
            <p className="text-2xl font-bold">{formatCurrency(totalCurrentExpenses)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-6">
            <p className="text-sm text-muted-foreground">vs Last Month</p>
            <p className={`text-2xl font-bold ${overallChange > 0 ? 'text-destructive' : 'text-success'}`}>
              {overallChange > 0 ? '+' : ''}{overallChange.toFixed(1)}%
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-6">
            <p className="text-sm text-muted-foreground">Anomalies Detected</p>
            <p className="text-2xl font-bold">{anomalies.length}</p>
            {anomalies.length > 0 && <p className="text-xs text-warning mt-1">Categories 50%+ above 3-month avg</p>}
          </CardContent>
        </Card>
      </div>

      {/* Anomaly Alerts */}
      {anomalies.length > 0 && (
        <Card className="border-warning/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-warning" />
              Spending Anomalies
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {anomalies.map(a => (
              <div key={a.category} className="flex items-center justify-between p-3 rounded-lg bg-warning/5">
                <div>
                  <p className="font-medium text-sm">{a.category}</p>
                  <p className="text-xs text-muted-foreground">
                    3-month avg: {formatCurrency(a.threeMonthAvg)} → This month: {formatCurrency(a.currentMonth)}
                  </p>
                </div>
                <Badge variant="outline" className="text-warning border-warning">
                  +{((a.currentMonth / a.threeMonthAvg - 1) * 100).toFixed(0)}%
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Category Breakdown with Trends */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Category Trends</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {categoryTrends.slice(0, 12).map(trend => {
              const pctOfTotal = totalCurrentExpenses > 0 ? (trend.currentMonth / totalCurrentExpenses) * 100 : 0;
              return (
                <div key={trend.category} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{trend.category}</span>
                      {trend.direction === 'up' && <ArrowUp className="w-3 h-3 text-destructive" />}
                      {trend.direction === 'down' && <ArrowDown className="w-3 h-3 text-success" />}
                      {trend.direction === 'flat' && <Minus className="w-3 h-3 text-muted-foreground" />}
                      {trend.isAnomaly && <AlertTriangle className="w-3 h-3 text-warning" />}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">
                        {trend.changePercent > 0 ? '+' : ''}{trend.changePercent.toFixed(0)}%
                      </span>
                      <span className="font-mono">{formatCurrency(trend.currentMonth)}</span>
                    </div>
                  </div>
                  <Progress value={pctOfTotal} className="h-1.5" />
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Top Merchants */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top Merchants (3 months)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {merchantPatterns.map((m, i) => (
              <div key={m.merchant} className="flex items-center justify-between py-2">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-medium shrink-0">{i + 1}</span>
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{m.merchant}</p>
                    <p className="text-xs text-muted-foreground">{m.txCount} transactions · avg {formatCurrency(m.avgAmount)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {m.trend === 'increasing' && <TrendingUp className="w-3.5 h-3.5 text-destructive" />}
                  {m.trend === 'decreasing' && <TrendingDown className="w-3.5 h-3.5 text-success" />}
                  <span className="font-mono text-sm">{formatCurrency(m.totalSpent)}</span>
                </div>
              </div>
            ))}
            {merchantPatterns.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">Not enough transaction data yet</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

