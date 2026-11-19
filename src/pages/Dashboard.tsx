import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOwnership } from '@/hooks/useOwnership';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { formatCurrency, formatDate } from '@/lib/format';
import { Wallet, TrendingUp, TrendingDown, DollarSign, ArrowUpRight, ArrowDownRight, Gift, CheckCircle2, AlertCircle, Droplets, Users } from 'lucide-react';
import { Account, Transaction, Budget } from '@/lib/types';
import { BudgetAlerts } from '@/components/insights/BudgetAlerts';
import { Navigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { startOfYear, endOfYear, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, isWithinInterval, parseISO, format } from 'date-fns';

type Benefit = {
  id: string;
  credit_card_id: string;
  benefit_name: string;
  benefit_type: string;
  benefit_value: number;
  benefit_period: string;
  merchant_keywords: string[] | null;
  category_match: string | null;
  is_active: boolean;
};

type CreditCard = {
  id: string;
  card_name: string;
  card_issuer: string | null;
};

type BenefitUsage = {
  id: string;
  benefit_id: string;
  amount_used: number;
  usage_date: string;
  period_start: string;
  period_end: string;
};

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [reviewTransactions, setReviewTransactions] = useState<Transaction[]>([]);
  const [benefits, setBenefits] = useState<Benefit[]>([]);
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [benefitUsage, setBenefitUsage] = useState<BenefitUsage[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [budgetTransactions, setBudgetTransactions] = useState<Transaction[]>([]);
  const [recentTxForBenefits, setRecentTxForBenefits] = useState<{ id: string; name: string; merchant_name: string | null; amount: number; date: string; category: string | null; account_id: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const { buildMultiplierMap, getTransactionMultiplier } = useOwnership();

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  async function fetchData() {
    setLoading(true);
    setLoadError(false);
    
    const [accountsRes, transactionsRes, reviewRes, benefitsRes, cardsRes, usageRes, benefitTxRes, budgetsRes, budgetTxRes] = await Promise.all([
      supabase.from('accounts').select('*').or('is_deleted.is.null,is_deleted.eq.false').order('created_at', { ascending: false }),
      supabase.from('transactions').select('*').order('date', { ascending: false }).limit(10),
      supabase.from('transactions').select('*').eq('needs_review', true).order('date', { ascending: false }).limit(50),
      supabase.from('credit_card_benefits').select('*').eq('is_active', true),
      supabase.from('credit_cards').select('id, card_name, card_issuer'),
      supabase.from('benefit_usage').select('*'),
      supabase.from('transactions').select('id, name, merchant_name, amount, date, category, account_id').order('date', { ascending: false }).limit(1000),
      supabase.from('budgets').select('*').eq('is_active', true),
      fetchReportTransactions(),
    ]);

    if ([accountsRes, transactionsRes, reviewRes, benefitsRes, cardsRes, usageRes, benefitTxRes, budgetsRes, budgetTxRes].some(r => r.error)) setLoadError(true);
    if (accountsRes.data) setAccounts(accountsRes.data as Account[]);
    if (transactionsRes.data) setTransactions(transactionsRes.data as Transaction[]);
    if (reviewRes.data) setReviewTransactions(reviewRes.data as Transaction[]);
    if (benefitsRes.data) setBenefits(benefitsRes.data as Benefit[]);
    if (cardsRes.data) setCards(cardsRes.data as CreditCard[]);
    if (usageRes.data) setBenefitUsage(usageRes.data as BenefitUsage[]);
    if (benefitTxRes.data) setRecentTxForBenefits(benefitTxRes.data);
    if (budgetsRes.data) setBudgets(budgetsRes.data as Budget[]);
    if (budgetTxRes.data) setBudgetTransactions(budgetTxRes.data as Transaction[]);
    
    setLoading(false);
  }

  async function fetchReportTransactions() {
    const data: Transaction[] = [];
    for (let from = 0; ; from += 1000) {
      const result = await supabase.from('transactions').select('*')
        .gte('date', format(startOfYear(new Date()), 'yyyy-MM-dd'))
        .lte('date', format(endOfMonth(new Date()), 'yyyy-MM-dd'))
        .order('date').order('id').range(from, from + 999);
      if (result.error) return { data: null, error: result.error };
      data.push(...result.data as Transaction[]);
      if (result.data.length < 1000) return { data, error: null };
    }
  }

  // Unused benefits analysis
  const unusedBenefits = useMemo(() => {
    const now = new Date();

    function getPeriodRange(period: string): { start: Date; end: Date; label: string } {
      switch (period) {
        case 'monthly':
          return { start: startOfMonth(now), end: endOfMonth(now), label: 'This Month' };
        case 'quarterly':
          return { start: startOfQuarter(now), end: endOfQuarter(now), label: 'This Quarter' };
        case 'semiannual': {
          const month = now.getMonth();
          const half = month < 6 ? 0 : 1;
          const start = new Date(now.getFullYear(), half * 6, 1);
          const end = new Date(now.getFullYear(), half * 6 + 6, 0, 23, 59, 59);
          return { start, end, label: half === 0 ? 'Jan–Jun' : 'Jul–Dec' };
        }
        default:
          return { start: startOfYear(now), end: endOfYear(now), label: 'This Year' };
      }
    }

    return benefits
      .filter(b => b.benefit_type === 'credit')
      .map(benefit => {
        const { start: periodStart, end: periodEnd, label: periodLabel } = getPeriodRange(benefit.benefit_period);
        const card = cards.find(c => c.id === benefit.credit_card_id);

        const matchingTxs = recentTxForBenefits.filter(tx => {
          const txDate = parseISO(tx.date);
          if (!isWithinInterval(txDate, { start: periodStart, end: periodEnd })) return false;
          if (benefit.category_match && tx.category) {
            if (tx.category.toLowerCase().includes(benefit.category_match.toLowerCase())) return true;
          }
          if (benefit.merchant_keywords && benefit.merchant_keywords.length > 0) {
            const txName = (tx.name + ' ' + (tx.merchant_name || '')).toLowerCase();
            return benefit.merchant_keywords.some(kw => txName.includes(kw.toLowerCase()));
          }
          return false;
        });

        let usedAmount = matchingTxs.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
        usedAmount = Math.min(usedAmount, benefit.benefit_value);

        const manualUsage = benefitUsage
          .filter(u => u.benefit_id === benefit.id &&
            isWithinInterval(parseISO(u.usage_date), { start: periodStart, end: periodEnd }))
          .reduce((sum, u) => sum + u.amount_used, 0);

        const totalUsed = Math.max(usedAmount, manualUsage);
        const remaining = Math.max(0, benefit.benefit_value - totalUsed);
        const percentUsed = benefit.benefit_value > 0 ? Math.min((totalUsed / benefit.benefit_value) * 100, 100) : 0;

        return { benefit, card, remaining, percentUsed, periodLabel, totalUsed };
      })
      .filter(b => b.remaining > 0)
      .sort((a, b) => b.remaining - a.remaining);
  }, [benefits, cards, recentTxForBenefits, benefitUsage]);

  async function markReviewed(id: string) {
    const tx = reviewTransactions.find(t => t.id === id);
    const idsToMark = [id];
    if (tx?.linked_transfer_id) idsToMark.push(tx.linked_transfer_id);
    await supabase.from('transactions').update({ needs_review: false }).in('id', idsToMark);
    setReviewTransactions(prev => prev.filter(t => !idsToMark.includes(t.id)));
  }

  async function markAllReviewed() {
    const ids = reviewTransactions.map(tx => tx.id);
    if (ids.length === 0) return;
    await supabase.from('transactions').update({ needs_review: false }).in('id', ids);
    setReviewTransactions([]);
    toast.success(`Marked ${ids.length} transactions as reviewed`);
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (loading) return <AppLayout><PageHeader title="Overview"/><p role="status" className="text-muted-foreground">Loading your finances…</p></AppLayout>;
  if (loadError) return <AppLayout><PageHeader title="Overview"/><Card><CardContent className="p-6 space-y-4"><p>We couldn't load your finances. Try again before relying on the totals.</p><Button onClick={fetchData}>Try again</Button></CardContent></Card></AppLayout>;
  if (accounts.length === 0 && transactions.length === 0) return (
    <AppLayout>
      <PageHeader title="Overview"description="Start with your accounts, then build your budget." />
      <Card className="border-primary/25 mb-6"><CardContent className="p-6 sm:p-8">
        <Wallet className="h-8 w-8 text-primary mb-4" />
        <h2 className="text-xl font-semibold mb-2">Bring your finances into view</h2>
        <p className="text-muted-foreground max-w-xl mb-6">Connect a bank or add an account manually. Your reports will fill in as transactions are added.</p>
        <Button asChild><Link to="/accounts">Add your first account</Link></Button>
      </CardContent></Card>
      <div className="grid gap-4 md:grid-cols-3">
        {[['1', 'Add accounts', 'Connect a bank or track balances manually.', '/accounts'], ['2', 'Review transactions', 'Check categories so your reports reflect your spending.', '/transactions'], ['3', 'Set a budget', 'Choose spending limits and compare them with actuals.', '/budgets']].map(([step,title,description,href]) => <Link key={step} to={href} className="rounded-xl border bg-card p-5 hover:border-primary focus-visible:ring-2 focus-visible:ring-ring"><span className="text-sm font-semibold text-primary">Step {step}</span><h2 className="text-lg font-semibold mt-2">{title}</h2><p className="text-sm text-muted-foreground mt-2">{description}</p></Link>)}
      </div>
    </AppLayout>
  );

  const multiplierMap = buildMultiplierMap(accounts);

  const scaleBalance = (acc: Account) => acc.is_zero_balance ? 0 : (acc.current_balance || 0) * (multiplierMap[acc.id] ?? 1);

  const totalBalance = accounts.reduce((sum, acc) => {
    const scaled = scaleBalance(acc);
    if (acc.type === 'credit' || acc.type === 'loan') {
      return sum - scaled;
    }
    return sum + scaled;
  }, 0);

  const assets = accounts
    .filter(a => a.type !== 'credit' && a.type !== 'loan')
    .reduce((sum, acc) => sum + scaleBalance(acc), 0);

  const liabilities = accounts
    .filter(a => a.type === 'credit' || a.type === 'loan')
    .reduce((sum, acc) => sum + scaleBalance(acc), 0);

  const thisMonthTransactions = budgetTransactions.filter(t => {
    if (t.pending || t.linked_transfer_id) return false;
    const txDate = parseISO(t.date);
    const now = new Date();
    return txDate.getMonth() === now.getMonth() && txDate.getFullYear() === now.getFullYear();
  });

  const scaleTxAmount = (tx: Transaction) => {
    return tx.amount * getTransactionMultiplier(tx, accounts);
  };

  const income = thisMonthTransactions
    .filter(t => t.amount < 0 && t.category === 'Income')
    .reduce((sum, t) => sum + Math.abs(scaleTxAmount(t)), 0);

  const expenses = thisMonthTransactions
    .filter(t => !['Income', 'Transfer', 'Credit Card Payment'].includes(t.category || ''))
    .reduce((sum, t) => sum + scaleTxAmount(t), 0);

  return (
    <AppLayout>
      <PageHeader 
        title="Overview"
        description="Your balances, spending, and next steps"
        actions={<Button asChild variant="outline"><Link to="/transactions">Review transactions</Link></Button>}
      />

      {transactions.length === 0 && <Card className="mb-6 border-primary/25"><CardContent className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"><div><h2 className="font-semibold">No transactions yet</h2><p className="text-sm text-muted-foreground mt-1">Sync your bank or add transactions to start seeing income, spending, and budget comparisons.</p></div><Button asChild><Link to="/transactions">Add or sync transactions</Link></Button></CardContent></Card>}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
        <StatCard
          title="Net Worth"
          value={formatCurrency(totalBalance)}
          icon={<DollarSign className="w-5 h-5" />}
        />
        <StatCard
          title="Total Assets"
          value={formatCurrency(assets)}
          icon={<TrendingUp className="w-5 h-5" />}
        />
        <StatCard
          title="Total Liabilities"
          value={formatCurrency(liabilities)}
          icon={<TrendingDown className="w-5 h-5" />}
        />
        <StatCard
          title="Accounts"
          value={accounts.length.toString()}
          subtitle="Linked and manual accounts"
          icon={<Wallet className="w-5 h-5" />}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2 mb-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">This Month's Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-lg bg-success/10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-success/20 flex items-center justify-center">
                    <ArrowDownRight className="w-5 h-5 text-success" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Income</p>
                    <p className="text-xl font-bold">{thisMonthTransactions.length ? formatCurrency(income) : '—'}</p>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between p-4 rounded-lg bg-destructive/10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-destructive/20 flex items-center justify-center">
                    <ArrowUpRight className="w-5 h-5 text-destructive" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Expenses</p>
                    <p className="text-xl font-bold">{thisMonthTransactions.length ? formatCurrency(expenses) : '—'}</p>
                  </div>
                </div>
              </div>
              <div className="pt-4 border-t">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Income minus expenses</span>
                  <span className={`text-xl font-bold ${income - expenses >= 0 ? 'text-success' : 'text-destructive'}`}>
                    {thisMonthTransactions.length ? formatCurrency(income - expenses) : '—'}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Cash after credit card debt</CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              const isLiquidityAccount = (a: Account) =>
                a.type === 'checking' || ((a as any).type === 'depository' && a.subtype !== 'savings') || a.type === 'credit';
              const calc = (filtered: Account[]) => {
                const checking = filtered
                  .filter(a => a.type === 'checking' || ((a as any).type === 'depository' && a.subtype !== 'savings'))
                  .reduce((sum, a) => sum + (a.current_balance || 0), 0);
                const credit = filtered
                  .filter(a => a.type === 'credit')
                  .reduce((sum, a) => sum + (a.current_balance || 0), 0);
                return checking - credit;
              };
              const personal = accounts.filter(a => isLiquidityAccount(a) && !a.is_joint);
              const joint = accounts.filter(a => isLiquidityAccount(a) && a.is_joint);
              const personalLiquidity = calc(personal);
              const jointLiquidity = calc(joint);

              return (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-lg bg-primary/10">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                        <Droplets className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Personal</p>
                        <p className="text-xl font-bold">{formatCurrency(personalLiquidity)}</p>
                      </div>
                    </div>
                  </div>
                  {joint.length > 0 && (
                    <div className="flex items-center justify-between p-4 rounded-lg bg-accent/10">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center">
                          <Users className="w-5 h-5 text-accent" />
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Joint</p>
                          <p className="text-xl font-bold">{formatCurrency(jointLiquidity)}</p>
                        </div>
                      </div>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">Checking balances minus credit card debt</p>
                </div>
              );
            })()}
          </CardContent>
        </Card>
      </div>

      {/* Review Transactions */}
      {reviewTransactions.length > 0 && (
        <Card className="mb-8">
          <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 space-y-0">
            <div className="flex items-center gap-2 min-w-0">
              <CardTitle className="text-lg truncate">Transactions to Review</CardTitle>
              <Badge variant="secondary">{reviewTransactions.length}</Badge>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {reviewTransactions.length <= 20 && (
                <Button variant="outline" size="sm" onClick={markAllReviewed} className="flex-1 sm:flex-none">
                  <CheckCircle2 className="w-4 h-4 mr-1" />
                  Clear All
                </Button>
              )}
              <Button variant="ghost" size="sm" asChild className="flex-1 sm:flex-none">
                <Link to="/transactions">View All</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {reviewTransactions.slice(0, 15).map((tx) => {
                const scaled = scaleTxAmount(tx);
                return (
                  <div key={tx.id} className="flex items-center justify-between gap-2 py-2 px-2 sm:px-3 rounded-lg hover:bg-muted/50 group">
                    <div className="flex-1 min-w-0 flex items-center gap-2 sm:gap-3">
                      <AlertCircle className="w-4 h-4 text-warning shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium truncate text-sm">{tx.merchant_name || tx.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {formatDate(tx.date)}
                          {tx.category && <span> · {tx.category}</span>}
                          {tx.account_name && <span> · {tx.account_name}</span>}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 sm:gap-3 shrink-0">
                      <span className={`font-mono text-sm font-medium whitespace-nowrap ${scaled > 0 ? 'text-destructive' : 'text-success'}`}>
                        {scaled > 0 ? '-' : '+'}{formatCurrency(Math.abs(scaled))}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="sm:opacity-0 sm:group-hover:opacity-100 transition-opacity h-8 w-8 p-0 shrink-0"
                        onClick={() => markReviewed(tx.id)}
                      >
                        <CheckCircle2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
              {reviewTransactions.length > 15 && (
                <p className="text-sm text-muted-foreground text-center pt-2">
                  +{reviewTransactions.length - 15} more — <Link to="/transactions" className="text-primary underline">view all</Link>
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Budget Alerts */}
      <div className="mb-8">
        <BudgetAlerts budgets={budgets} transactions={budgetTransactions} accounts={accounts} getMultiplier={getTransactionMultiplier} />
      </div>

      {/* Unused Card Benefits */}
      {unusedBenefits.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div className="flex items-center gap-2">
              <Gift className="w-5 h-5 text-accent" />
              <CardTitle className="text-lg">Unused Card Benefits</CardTitle>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/card-benefits">View All</Link>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {unusedBenefits.slice(0, 6).map(({ benefit, card, remaining, percentUsed, periodLabel }) => (
                <div key={benefit.id} className="flex items-center gap-4 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{benefit.benefit_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {card?.card_name} · {periodLabel}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="w-20">
                      <Progress value={percentUsed} className="h-2" />
                    </div>
                    <span className="font-mono text-sm font-medium text-success w-16 text-right">
                      {formatCurrency(remaining)}
                    </span>
                  </div>
                </div>
              ))}
              {unusedBenefits.length > 6 && (
                <p className="text-sm text-muted-foreground text-center pt-1">
                  +{unusedBenefits.length - 6} more — <Link to="/card-benefits" className="text-primary underline">view all</Link>
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </AppLayout>
  );
}
