import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/format';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Transaction, Budget, Account } from '@/lib/types';
import { parseISO, startOfMonth, endOfMonth, startOfYear, endOfYear, isWithinInterval } from 'date-fns';

type Props = {
  budgets: Budget[];
  transactions: Transaction[];
  accounts: Account[];
  getMultiplier: (tx: Transaction, accounts: Account[]) => number;
};

type BudgetAlert = {
  budget: Budget;
  spent: number;
  limit: number;
  pct: number;
  status: 'safe' | 'warning' | 'danger' | 'exceeded';
};

export function BudgetAlerts({ budgets, transactions, accounts, getMultiplier }: Props) {
  const alerts = useMemo(() => {
    const now = new Date();
    const results: BudgetAlert[] = [];

    budgets.filter(b => b.is_active).forEach(budget => {
      const start = budget.period === 'yearly' ? startOfYear(now) : startOfMonth(now);
      const end = budget.period === 'yearly' ? endOfYear(now) : endOfMonth(now);
      const limit = budget.monthly_limit;

      let spent = 0;
      transactions.forEach(tx => {
        if (tx.pending || tx.linked_transfer_id || tx.category === 'Income') return;
        if (tx.category !== budget.category) return;
        const txDate = parseISO(tx.date);
        if (!isWithinInterval(txDate, { start, end })) return;
        if (tx.category === 'Transfer' || tx.category === 'Credit Card Payment') return;

        if (budget.budget_scope === 'personal') {
          const acct = accounts.find(a => a.id === tx.account_id);
          if (acct?.is_joint) return;
        } else if (budget.budget_scope === 'joint') {
          const acct = accounts.find(a => a.id === tx.account_id);
          if (!acct?.is_joint) return;
        }

        spent += tx.amount * getMultiplier(tx, accounts);
      });

      const pct = limit > 0 ? (spent / limit) * 100 : 0;
      const status = pct >= 100 ? 'exceeded' : pct >= 90 ? 'danger' : pct >= 75 ? 'warning' : 'safe';

      if (status !== 'safe') {
        results.push({ budget, spent, limit, pct: Math.round(pct), status });
      }
    });

    results.sort((a, b) => b.pct - a.pct);
    return results;
  }, [budgets, transactions, accounts, getMultiplier]);

  if (alerts.length === 0) return null;

  return (
    <Card className="border-warning/30">
      <CardHeader className="pb-3 flex flex-row items-center gap-2 space-y-0">
        <AlertTriangle className="w-4 h-4 text-warning" />
        <CardTitle className="text-base">Budget Alerts</CardTitle>
        <Badge variant="secondary" className="ml-auto">{alerts.length}</Badge>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {alerts.map(a => (
            <div key={a.budget.id} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{a.budget.category}</span>
                <span className={a.status === 'exceeded' ? 'text-destructive font-medium' : 'text-muted-foreground'}>
                  {formatCurrency(a.spent)} / {formatCurrency(a.limit)}
                </span>
              </div>
              <Progress
                value={Math.min(a.pct, 100)}
                className={`h-2 ${a.status === 'exceeded' ? '[&>div]:bg-destructive' : a.status === 'danger' ? '[&>div]:bg-warning' : '[&>div]:bg-yellow-500'}`}
              />
              <p className="text-xs text-muted-foreground">
                {a.status === 'exceeded'
                  ? `Over budget by ${formatCurrency(a.spent - a.limit)}`
                  : `${formatCurrency(a.limit - a.spent)} remaining (${a.pct}% used)`}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

