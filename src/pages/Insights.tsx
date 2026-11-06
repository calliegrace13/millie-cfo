import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOwnership } from '@/hooks/useOwnership';
import { PageHeader } from '@/components/ui/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatCurrency } from '@/lib/format';
import { Transaction, Account, RecurringTransaction } from '@/lib/types';
import { Navigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { SpendingAnalyzer } from '@/components/insights/SpendingAnalyzer';
import { FinancialHealthScore } from '@/components/insights/FinancialHealthScore';
import { CardOptimizer } from '@/components/insights/CardOptimizer';
import { AIHabitSuggestions } from '@/components/insights/AIHabitSuggestions';
import { SubscriptionTracker } from '@/components/insights/SubscriptionTracker';
import { MerchantInsights } from '@/components/insights/MerchantInsights';
import { MonthlyFinancialSummary } from '@/components/insights/MonthlyFinancialSummary';
import { subMonths, startOfMonth, endOfMonth, parseISO, isWithinInterval, format } from 'date-fns';

export function InsightsContent() {
  const { user, loading: authLoading } = useAuth();
  const { getTransactionMultiplier, buildMultiplierMap } = useOwnership();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [recurring, setRecurring] = useState<RecurringTransaction[]>([]);
  const [cards, setCards] = useState<{ id: string; card_name: string; card_issuer: string | null; annual_fee: number }[]>([]);
  const [benefits, setBenefits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');

  useEffect(() => {
    if (user) fetchData();
  }, [user]);

  async function fetchData() {
    const sixMonthsAgo = format(subMonths(new Date(), 6), 'yyyy-MM-dd');
    const [txRes, accRes, cardsRes, benefitsRes, recRes] = await Promise.all([
      supabase.from('transactions').select('*').gte('date', sixMonthsAgo).order('date', { ascending: false }),
      supabase.from('accounts').select('*').or('is_deleted.is.null,is_deleted.eq.false'),
      supabase.from('credit_cards').select('id, card_name, card_issuer, annual_fee'),
      supabase.from('credit_card_benefits').select('*').eq('is_active', true),
      supabase.from('recurring_transactions').select('*').eq('is_active', true),
    ]);

    if (txRes.data) setTransactions(txRes.data as Transaction[]);
    if (accRes.data) setAccounts(accRes.data as Account[]);
    if (cardsRes.data) setCards(cardsRes.data);
    if (benefitsRes.data) setBenefits(benefitsRes.data);
    if (recRes.data) setRecurring(recRes.data as unknown as RecurringTransaction[]);
    setLoading(false);
  }

  const now = new Date();
  const threeMonthsAgo = subMonths(now, 3);

  const categorySpending = useMemo(() => {
    const totals: Record<string, number> = {};
    transactions.forEach(tx => {
      const txDate = parseISO(tx.date);
      if (txDate < threeMonthsAgo || tx.amount <= 0) return;
      const cat = tx.category || 'Uncategorized';
      if (cat === 'Transfer' || cat === 'Credit Card Payment') return;
      const scaled = tx.amount * getTransactionMultiplier(tx, accounts);
      totals[cat] = (totals[cat] || 0) + scaled;
    });
    return totals;
  }, [transactions, accounts, getTransactionMultiplier]);

  const recentMonths = useMemo(() => {
    let income = 0, expenses = 0;
    transactions.forEach(tx => {
      const txDate = parseISO(tx.date);
      if (txDate < threeMonthsAgo) return;
      const scaled = tx.amount * getTransactionMultiplier(tx, accounts);
      if (tx.amount < 0 && tx.category === 'Income') income += Math.abs(scaled);
      else if (tx.amount > 0 && tx.category !== 'Transfer' && tx.category !== 'Credit Card Payment') expenses += scaled;
    });
    return { income, expenses };
  }, [transactions, accounts, getTransactionMultiplier]);

  const savingsRate = recentMonths.income > 0 ? ((recentMonths.income - recentMonths.expenses) / recentMonths.income) * 100 : 0;

  const spendingSummary = useMemo(() =>
    Object.entries(categorySpending)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, amt]) => `${cat}: ${formatCurrency(amt)}`)
      .join('\n'),
    [categorySpending]
  );

  const topMerchants = useMemo(() => {
    const map: Record<string, number> = {};
    transactions.filter(tx => tx.amount > 0 && parseISO(tx.date) >= threeMonthsAgo).forEach(tx => {
      const name = tx.merchant_name || tx.name;
      map[name] = (map[name] || 0) + tx.amount;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([n, a]) => `${n}: ${formatCurrency(a)}`).join('\n');
  }, [transactions]);

  const monthlyTrends = useMemo(() => {
    const lines: string[] = [];
    for (let i = 0; i < 3; i++) {
      const d = subMonths(now, i);
      const start = startOfMonth(d);
      const end = endOfMonth(d);
      let inc = 0, exp = 0;
      transactions.forEach(tx => {
        const txDate = parseISO(tx.date);
        if (!isWithinInterval(txDate, { start, end })) return;
        if (tx.amount < 0 && tx.category === 'Income') inc += Math.abs(tx.amount);
        else if (tx.amount > 0) exp += tx.amount;
      });
      lines.push(`${format(d, 'MMM yyyy')}: Income ${formatCurrency(inc)}, Expenses ${formatCurrency(exp)}`);
    }
    return lines.join('\n');
  }, [transactions]);

  if (authLoading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-pulse">Loading...</div></div>;
  if (!user) return <Navigate to="/auth" replace />;

  return (
    <>
      <PageHeader title="Spending Insights" description="Analyze patterns, optimize cards, and get AI-powered advice" />

      {loading ? (
        <div className="animate-pulse text-muted-foreground">Loading insights...</div>
      ) : (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-6 flex-wrap">
            <TabsTrigger value="overview">Patterns</TabsTrigger>
            <TabsTrigger value="merchants">Merchants</TabsTrigger>
            <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
            <TabsTrigger value="health">Health Score</TabsTrigger>
            <TabsTrigger value="cards">Card Optimizer</TabsTrigger>
            <TabsTrigger value="ai">AI Summary</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <SpendingAnalyzer transactions={transactions} accounts={accounts} getMultiplier={getTransactionMultiplier} />
          </TabsContent>

          <TabsContent value="merchants">
            <MerchantInsights transactions={transactions} accounts={accounts} getMultiplier={getTransactionMultiplier} />
          </TabsContent>

          <TabsContent value="subscriptions">
            <SubscriptionTracker recurring={recurring} transactions={transactions} />
          </TabsContent>

          <TabsContent value="health">
            <FinancialHealthScore transactions={transactions} accounts={accounts} getMultiplier={getTransactionMultiplier} buildMultiplierMap={buildMultiplierMap} />
          </TabsContent>

          <TabsContent value="cards">
            <CardOptimizer cards={cards} benefits={benefits} categorySpending={categorySpending} />
          </TabsContent>

          <TabsContent value="ai">
            <div className="space-y-6">
              <MonthlyFinancialSummary
                spendingSummary={spendingSummary}
                monthlyTrends={monthlyTrends}
                topMerchants={topMerchants}
                savingsRate={savingsRate}
                totalIncome={recentMonths.income}
                totalExpenses={recentMonths.expenses}
              />
              <AIHabitSuggestions spendingSummary={spendingSummary} monthlyTrends={monthlyTrends} topMerchants={topMerchants} savingsRate={savingsRate} healthScore={0} />
            </div>
          </TabsContent>
        </Tabs>
      )}
    </>
  );
}

export default function Insights() {
  return (
    <AppLayout>
      <InsightsContent />
    </AppLayout>
  );
}
