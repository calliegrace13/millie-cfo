import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { formatCurrency } from '@/lib/format';
import { Transaction, Account } from '@/lib/types';
import { Shield, CheckCircle2, AlertCircle, XCircle } from 'lucide-react';
import { subMonths, parseISO, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { cn } from '@/lib/utils';

type Props = {
  transactions: Transaction[];
  accounts: Account[];
  getMultiplier: (tx: Transaction, accounts: Account[]) => number;
  buildMultiplierMap: (accounts: Account[]) => Record<string, number>;
};

type ScoreComponent = {
  name: string;
  score: number; // 0-100
  maxPoints: number;
  points: number;
  status: 'good' | 'fair' | 'poor';
  detail: string;
};

export function FinancialHealthScore({ transactions, accounts, getMultiplier, buildMultiplierMap }: Props) {
  const analysis = useMemo(() => {
    const now = new Date();
    const multiplierMap = buildMultiplierMap(accounts);

    // Helper: get monthly expense/income totals for last N months
    const getMonthly = (monthsBack: number) => {
      const buckets: { income: number; expenses: number }[] = [];
      for (let i = 0; i < monthsBack; i++) {
        const d = subMonths(now, i);
        const start = startOfMonth(d);
        const end = endOfMonth(d);
        let income = 0, expenses = 0;
        transactions.forEach(tx => {
          const txDate = parseISO(tx.date);
          if (!isWithinInterval(txDate, { start, end })) return;
          const scaled = tx.amount * getMultiplier(tx, accounts);
          if (tx.amount < 0 && tx.category === 'Income') income += Math.abs(scaled);
          else if (tx.amount > 0 && tx.category !== 'Transfer' && tx.category !== 'Credit Card Payment') expenses += scaled;
        });
        buckets.push({ income, expenses });
      }
      return buckets;
    };

    const monthly = getMonthly(3);
    const avgIncome = monthly.reduce((s, m) => s + m.income, 0) / Math.max(monthly.filter(m => m.income > 0).length, 1);
    const avgExpenses = monthly.reduce((s, m) => s + m.expenses, 0) / Math.max(monthly.length, 1);

    // 1. Savings Rate (25 points)
    const savingsRate = avgIncome > 0 ? ((avgIncome - avgExpenses) / avgIncome) * 100 : 0;
    const savingsScore = savingsRate >= 20 ? 100 : savingsRate >= 10 ? 70 : savingsRate >= 0 ? 40 : 10;
    const savingsComponent: ScoreComponent = {
      name: 'Savings Rate',
      score: savingsScore,
      maxPoints: 25,
      points: Math.round(savingsScore * 0.25),
      status: savingsScore >= 70 ? 'good' : savingsScore >= 40 ? 'fair' : 'poor',
      detail: `${savingsRate.toFixed(1)}% of income saved`,
    };

    // 2. Debt Ratio (25 points) — credit card debt vs checking
    const scaleBalance = (acc: Account) => (acc.current_balance || 0) * (multiplierMap[acc.id] ?? 1);
    const checkingTotal = accounts.filter(a => a.type === 'checking' || (a.type as string === 'depository' && a.subtype !== 'savings')).reduce((s, a) => s + scaleBalance(a), 0);
    const creditDebt = accounts.filter(a => a.type === 'credit').reduce((s, a) => s + scaleBalance(a), 0);
    const debtRatio = checkingTotal > 0 ? (creditDebt / checkingTotal) * 100 : creditDebt > 0 ? 100 : 0;
    const debtScore = debtRatio <= 10 ? 100 : debtRatio <= 30 ? 70 : debtRatio <= 60 ? 40 : 10;
    const debtComponent: ScoreComponent = {
      name: 'Debt-to-Cash Ratio',
      score: debtScore,
      maxPoints: 25,
      points: Math.round(debtScore * 0.25),
      status: debtScore >= 70 ? 'good' : debtScore >= 40 ? 'fair' : 'poor',
      detail: `${debtRatio.toFixed(0)}% credit debt vs cash`,
    };

    // 3. Spending Consistency (25 points) — low variance in monthly spending
    const expenseAmounts = monthly.map(m => m.expenses).filter(e => e > 0);
    const expenseAvg = expenseAmounts.reduce((s, e) => s + e, 0) / Math.max(expenseAmounts.length, 1);
    const variance = expenseAmounts.length > 1
      ? Math.sqrt(expenseAmounts.reduce((s, e) => s + Math.pow(e - expenseAvg, 2), 0) / expenseAmounts.length) / Math.max(expenseAvg, 1) * 100
      : 0;
    const consistencyScore = variance <= 10 ? 100 : variance <= 25 ? 70 : variance <= 50 ? 40 : 20;
    const consistencyComponent: ScoreComponent = {
      name: 'Spending Consistency',
      score: consistencyScore,
      maxPoints: 25,
      points: Math.round(consistencyScore * 0.25),
      status: consistencyScore >= 70 ? 'good' : consistencyScore >= 40 ? 'fair' : 'poor',
      detail: `${variance.toFixed(0)}% monthly variance`,
    };

    // 4. Emergency Fund (25 points) — months of expenses in checking+savings
    const liquidAssets = accounts.filter(a => a.type === 'checking' || a.type === 'savings' || (a.type as string === 'depository')).reduce((s, a) => s + scaleBalance(a), 0);
    const monthsOfRunway = avgExpenses > 0 ? liquidAssets / avgExpenses : 99;
    const emergencyScore = monthsOfRunway >= 6 ? 100 : monthsOfRunway >= 3 ? 70 : monthsOfRunway >= 1 ? 40 : 10;
    const emergencyComponent: ScoreComponent = {
      name: 'Emergency Fund',
      score: emergencyScore,
      maxPoints: 25,
      points: Math.round(emergencyScore * 0.25),
      status: emergencyScore >= 70 ? 'good' : emergencyScore >= 40 ? 'fair' : 'poor',
      detail: `${monthsOfRunway.toFixed(1)} months of expenses covered`,
    };

    const components = [savingsComponent, debtComponent, consistencyComponent, emergencyComponent];
    const totalScore = components.reduce((s, c) => s + c.points, 0);

    return { totalScore, components, avgIncome, avgExpenses };
  }, [transactions, accounts, getMultiplier, buildMultiplierMap]);

  const { totalScore, components } = analysis;

  const getScoreColor = (score: number) => {
    if (score >= 75) return 'text-success';
    if (score >= 50) return 'text-warning';
    return 'text-destructive';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Fair';
    return 'Needs Work';
  };

  const StatusIcon = ({ status }: { status: string }) => {
    if (status === 'good') return <CheckCircle2 className="w-4 h-4 text-success" />;
    if (status === 'fair') return <AlertCircle className="w-4 h-4 text-warning" />;
    return <XCircle className="w-4 h-4 text-destructive" />;
  };

  return (
    <div className="space-y-6">
      {/* Overall Score */}
      <Card>
        <CardContent className="py-8 text-center">
          <Shield className="w-8 h-8 mx-auto mb-2 text-primary" />
          <p className="text-sm text-muted-foreground mb-1">Financial Health Score</p>
          <p className={cn("text-5xl font-bold", getScoreColor(totalScore))}>{totalScore}</p>
          <p className="text-sm text-muted-foreground mt-1">{getScoreLabel(totalScore)} · out of 100</p>
          <div className="mt-4 max-w-xs mx-auto">
            <Progress value={totalScore} className="h-3" />
          </div>
        </CardContent>
      </Card>

      {/* Score Breakdown */}
      <div className="grid gap-4 sm:grid-cols-2">
        {components.map(comp => (
          <Card key={comp.name}>
            <CardContent className="py-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <StatusIcon status={comp.status} />
                  <p className="font-medium text-sm">{comp.name}</p>
                </div>
                <span className="text-lg font-bold">{comp.points}/{comp.maxPoints}</span>
              </div>
              <Progress value={comp.score} className="h-1.5 mb-2" />
              <p className="text-xs text-muted-foreground">{comp.detail}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
