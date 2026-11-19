import { useState, useEffect, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOwnership } from '@/hooks/useOwnership';
import { formatCurrency } from '@/lib/format';
import { Account, Transaction } from '@/lib/types';
import { TrendingUp, TrendingDown, DollarSign, Scale, Plus, Trash2, SlidersHorizontal } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import { addMonths, subMonths, format, startOfMonth } from 'date-fns';

type ForecastMonth = {
  month: string;
  label: string;
  salaryIncome: number;
  otherIncome: number;
  totalIncome: number;
  expenses: Record<string, number>;
  totalExpenses: number;
  netIncome: number;
  operatingCF: number;
  otherCF: number;
  netCF: number;
  cumulativeCash: number;
  totalAssets: number;
  totalLiabilities: number;
  equity: number;
};

type Adjustment = {
  id: string;
  label: string;
  type: 'income' | 'expense';
  targetMonth: string; // 'all' or 'yyyy-MM'
  targetCategory: string; // 'salary', 'other_income', or expense category name
  mode: 'override' | 'delta';
  amount: number;
};

export function PlanningContent() {
  const { user } = useAuth();
  const { getTransactionMultiplier } = useOwnership();
  const [horizon, setHorizon] = useState<string>('6');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [assets, setAssets] = useState<{ value: number; is_liability: boolean }[]>([]);
  const [loading, setLoading] = useState(true);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [addAdjOpen, setAddAdjOpen] = useState(false);
  const [newAdj, setNewAdj] = useState({
    label: '',
    type: 'expense' as 'income' | 'expense',
    targetMonth: 'all',
    targetCategory: '',
    mode: 'delta' as 'override' | 'delta',
    amount: '',
  });

  useEffect(() => {
    if (!user) return;
    const sixMonthsAgo = subMonths(new Date(), 6).toISOString().slice(0, 10);

    const fetchData = async () => {
      setLoading(true);
      const [txRes, accRes, assetRes] = await Promise.all([
        supabase
          .from('transactions')
          .select('*')
          .eq('user_id', user.id)
          .gte('date', sixMonthsAgo)
          .is('linked_transfer_id', null)
          .order('date', { ascending: true }),
        supabase
          .from('accounts')
          .select('*')
          .eq('user_id', user.id)
          .or('is_deleted.is.null,is_deleted.eq.false'),
        supabase
          .from('assets')
          .select('value, is_liability')
          .eq('user_id', user.id),
      ]);
      setTransactions((txRes.data ?? []) as Transaction[]);
      setAccounts((accRes.data ?? []) as Account[]);
      setAssets(assetRes.data ?? []);
      setLoading(false);
    };
    fetchData();
  }, [user]);

  // Build future month options for the adjustment dialog
  const futureMonthOptions = useMemo(() => {
    const horizonNum = parseInt(horizon);
    const now = new Date();
    const options: { value: string; label: string }[] = [{ value: 'all', label: 'Every month' }];
    for (let i = 1; i <= horizonNum; i++) {
      const d = addMonths(startOfMonth(now), i);
      options.push({ value: format(d, 'yyyy-MM'), label: format(d, 'MMM yyyy') });
    }
    return options;
  }, [horizon]);

  const forecast = useMemo(() => {
    if (!transactions.length) return null;

    const months = 6;
    let totalSalary = 0;
    let totalOtherIncome = 0;
    const expensesByCategory: Record<string, number> = {};
    let totalOperatingCF = 0;
    let totalOtherCF = 0;

    transactions.forEach((tx) => {
      const mult = getTransactionMultiplier(tx, accounts);
      const amt = tx.amount * mult;

      if (amt < 0) {
        if (tx.income_type === 'salary') {
          totalSalary += Math.abs(amt);
        } else if (tx.category === 'Income' || tx.income_type === 'other') {
          totalOtherIncome += Math.abs(amt);
        }
      }

      if (amt > 0 && !tx.is_one_time_expense) {
        const cat = tx.category || 'Uncategorized';
        expensesByCategory[cat] = (expensesByCategory[cat] || 0) + amt;
      }

      if (tx.cash_flow_type === 'operating') {
        totalOperatingCF += amt;
      } else {
        totalOtherCF += amt;
      }
    });

    const avgSalary = totalSalary / months;
    const avgOtherIncome = totalOtherIncome / months;
    const avgExpenses: Record<string, number> = {};
    Object.entries(expensesByCategory).forEach(([cat, total]) => {
      avgExpenses[cat] = total / months;
    });
    const avgOperatingCF = totalOperatingCF / months;
    const avgOtherCF = totalOtherCF / months;

    const cashAccounts = accounts.filter(a => ['checking', 'savings'].includes(a.type));
    const currentCash = cashAccounts.reduce((s, a) => s + (a.current_balance || 0), 0);
    const creditBalances = accounts.filter(a => a.type === 'credit').reduce((s, a) => s + Math.abs(a.current_balance || 0), 0);
    const loanBalances = accounts.filter(a => a.type === 'loan').reduce((s, a) => s + Math.abs(a.current_balance || 0), 0);
    const investmentBalances = accounts.filter(a => a.type === 'investment').reduce((s, a) => s + (a.current_balance || 0), 0);

    const fixedAssets = assets.filter(a => !a.is_liability).reduce((s, a) => s + a.value, 0);
    const assetLiabilities = assets.filter(a => a.is_liability).reduce((s, a) => s + a.value, 0);
    const totalLiabilities = creditBalances + loanBalances + assetLiabilities;

    const horizonNum = parseInt(horizon);
    const now = new Date();
    const forecastMonths: ForecastMonth[] = [];

    let runningCash = currentCash;

    for (let i = 1; i <= horizonNum; i++) {
      const futureDate = addMonths(startOfMonth(now), i);
      const monthKey = format(futureDate, 'yyyy-MM');

      // Start from averages
      let salary = avgSalary;
      let otherIncome = avgOtherIncome;
      const monthExpenses = { ...avgExpenses };

      // Apply adjustments
      adjustments.forEach((adj) => {
        const applies = adj.targetMonth === 'all' || adj.targetMonth === monthKey;
        if (!applies) return;

        if (adj.type === 'income') {
          if (adj.targetCategory === 'salary') {
            salary = adj.mode === 'override' ? adj.amount : salary + adj.amount;
          } else {
            otherIncome = adj.mode === 'override' ? adj.amount : otherIncome + adj.amount;
          }
        } else {
          // expense adjustment
          const cat = adj.targetCategory || 'Uncategorized';
          const current = monthExpenses[cat] || 0;
          monthExpenses[cat] = adj.mode === 'override' ? adj.amount : current + adj.amount;
        }
      });

      const totalIncome = salary + otherIncome;
      const totalExp = Object.values(monthExpenses).reduce((s, v) => s + Math.max(0, v), 0);
      const netIncome = totalIncome - totalExp;
      const netCF = -avgOperatingCF - avgOtherCF;
      runningCash += netIncome;

      const projAssets = runningCash + investmentBalances + fixedAssets;
      const projEquity = projAssets - totalLiabilities;

      forecastMonths.push({
        month: monthKey,
        label: format(futureDate, 'MMM yyyy'),
        salaryIncome: salary,
        otherIncome: otherIncome,
        totalIncome,
        expenses: monthExpenses,
        totalExpenses: totalExp,
        netIncome,
        operatingCF: -avgOperatingCF,
        otherCF: -avgOtherCF,
        netCF,
        cumulativeCash: runningCash,
        totalAssets: projAssets,
        totalLiabilities: totalLiabilities,
        equity: projEquity,
      });
    }

    return {
      avgSalary,
      avgOtherIncome,
      avgExpenses,
      currentCash,
      totalLiabilities,
      forecastMonths,
      topCategories: Object.entries(avgExpenses)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([cat]) => cat),
    };
  }, [transactions, accounts, assets, horizon, getTransactionMultiplier, adjustments]);

  // Category options for adjustment dialog
  const expenseCategoryOptions = useMemo(() => {
    if (!forecast) return [];
    return Object.keys(forecast.avgExpenses).sort();
  }, [forecast]);

  // Historical monthly data for charts
  const chartData = useMemo(() => {
    if (!forecast) return [];

    const now = new Date();
    const historicalMap: Record<string, { income: number; expenses: number }> = {};
    for (let i = 5; i >= 0; i--) {
      const m = format(subMonths(startOfMonth(now), i), 'MMM yyyy');
      historicalMap[m] = { income: 0, expenses: 0 };
    }

    transactions.forEach((tx) => {
      const mult = getTransactionMultiplier(tx, accounts);
      const amt = tx.amount * mult;
      const label = format(new Date(tx.date), 'MMM yyyy');
      if (!historicalMap[label]) return;
      if (amt < 0) {
        historicalMap[label].income += Math.abs(amt);
      } else if (amt > 0) {
        historicalMap[label].expenses += amt;
      }
    });

    const historical = Object.entries(historicalMap).map(([label, data]) => ({
      label,
      income: Math.round(data.income),
      expenses: Math.round(data.expenses),
      type: 'historical' as const,
    }));

    const projected = forecast.forecastMonths.map((m) => ({
      label: m.label,
      income: Math.round(m.totalIncome),
      expenses: Math.round(m.totalExpenses),
      type: 'projected' as const,
    }));

    return [...historical, ...projected];
  }, [forecast, transactions, accounts, getTransactionMultiplier]);

  function addAdjustment(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(newAdj.amount);
    if (isNaN(amount)) return;

    setAdjustments(prev => [...prev, {
      id: crypto.randomUUID(),
      label: newAdj.label || `${newAdj.type === 'income' ? 'Income' : 'Expense'} adjustment`,
      type: newAdj.type,
      targetMonth: newAdj.targetMonth,
      targetCategory: newAdj.targetCategory,
      mode: newAdj.mode,
      amount,
    }]);

    setNewAdj({ label: '', type: 'expense', targetMonth: 'all', targetCategory: '', mode: 'delta', amount: '' });
    setAddAdjOpen(false);
  }

  function removeAdjustment(id: string) {
    setAdjustments(prev => prev.filter(a => a.id !== id));
  }

  const lastForecast = forecast?.forecastMonths[forecast.forecastMonths.length - 1];

  return (
    <>
      <PageHeader
        title="Planning"
        description="Forward-looking forecasts based on your spending and income trends"
        actions={
          <div className="flex items-center gap-2">
            <Dialog open={addAdjOpen} onOpenChange={setAddAdjOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <SlidersHorizontal className="w-4 h-4 mr-2" />
                  Adjust
                  {adjustments.length > 0 && (
                    <Badge variant="secondary" className="ml-2">{adjustments.length}</Badge>
                  )}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Add Forecast Adjustment</DialogTitle>
                </DialogHeader>
                <form onSubmit={addAdjustment} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Input
                      value={newAdj.label}
                      onChange={e => setNewAdj({ ...newAdj, label: e.target.value })}
                      placeholder="e.g., Rent increase, New job salary"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Type</Label>
                      <Select value={newAdj.type} onValueChange={v => setNewAdj({ ...newAdj, type: v as 'income' | 'expense', targetCategory: '' })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="income">Income</SelectItem>
                          <SelectItem value="expense">Expense</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Category</Label>
                      {newAdj.type === 'income' ? (
                        <Select value={newAdj.targetCategory} onValueChange={v => setNewAdj({ ...newAdj, targetCategory: v })}>
                          <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="salary">Salary</SelectItem>
                            <SelectItem value="other_income">Other Income</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Select value={newAdj.targetCategory} onValueChange={v => setNewAdj({ ...newAdj, targetCategory: v })}>
                          <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                          <SelectContent>
                            {expenseCategoryOptions.map(cat => (
                              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>When</Label>
                      <Select value={newAdj.targetMonth} onValueChange={v => setNewAdj({ ...newAdj, targetMonth: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {futureMonthOptions.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Mode</Label>
                      <Select value={newAdj.mode} onValueChange={v => setNewAdj({ ...newAdj, mode: v as 'override' | 'delta' })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="delta">Add/Subtract</SelectItem>
                          <SelectItem value="override">Set to exact</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Amount ($)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={newAdj.amount}
                      onChange={e => setNewAdj({ ...newAdj, amount: e.target.value })}
                      placeholder={newAdj.mode === 'delta' ? 'e.g., 200 to add, -100 to subtract' : 'e.g., 3500'}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full">Add Adjustment</Button>
                </form>
              </DialogContent>
            </Dialog>
            <Select value={horizon} onValueChange={setHorizon}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3">3 Months</SelectItem>
                <SelectItem value="6">6 Months</SelectItem>
                <SelectItem value="12">12 Months</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      />

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading forecast data...</div>
      ) : !forecast ? (
        <div className="text-center py-12 text-muted-foreground">
          No transaction history found. Add transactions to generate forecasts.
        </div>
      ) : (
        <div className="space-y-6">
          {/* Active Adjustments */}
          {adjustments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <SlidersHorizontal className="w-5 h-5 text-primary" />
                  Active Adjustments
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {adjustments.map(adj => (
                    <Badge
                      key={adj.id}
                      variant="secondary"
                      className="flex items-center gap-1.5 py-1.5 px-3 text-sm"
                    >
                      <span className={adj.type === 'income' ? 'text-success' : 'text-destructive'}>
                        {adj.type === 'income' ? '↑' : '↓'}
                      </span>
                      <span>{adj.label}</span>
                      <span className="text-muted-foreground">
                        {adj.mode === 'delta' ? (adj.amount >= 0 ? '+' : '') : '='}{formatCurrency(adj.amount)}
                      </span>
                      <span className="text-muted-foreground">
                        · {adj.targetMonth === 'all' ? 'every mo' : futureMonthOptions.find(o => o.value === adj.targetMonth)?.label}
                      </span>
                      <button
                        onClick={() => removeAdjustment(adj.id)}
                        className="ml-1 hover:text-destructive transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Summary KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Projected Monthly Income"
              value={formatCurrency(forecast.avgSalary + forecast.avgOtherIncome)}
              icon={<TrendingUp className="w-5 h-5" />}
              subtitle="6-month trailing average"
            />
            <StatCard
              title="Projected Monthly Expenses"
              value={formatCurrency(Object.values(forecast.avgExpenses).reduce((s, v) => s + v, 0))}
              icon={<TrendingDown className="w-5 h-5" />}
              subtitle="6-month trailing average"
            />
            <StatCard
              title={`Cash Position (${horizon}mo)`}
              value={formatCurrency(lastForecast?.cumulativeCash ?? 0)}
              icon={<DollarSign className="w-5 h-5" />}
              subtitle={`Current: ${formatCurrency(forecast.currentCash)}`}
            />
            <StatCard
              title={`Projected Equity (${horizon}mo)`}
              value={formatCurrency(lastForecast?.equity ?? 0)}
              icon={<Scale className="w-5 h-5" />}
              subtitle={`Liabilities: ${formatCurrency(forecast.totalLiabilities)}`}
            />
          </div>

          {/* Trend Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Income vs Expenses Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                    <YAxis tick={{ fontSize: 12 }} className="fill-muted-foreground" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip
                      formatter={(value: number) => formatCurrency(value)}
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                    />
                    <Legend />
                    <ReferenceLine x={chartData.find(d => d.type === 'projected')?.label} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" label="Forecast" />
                    <Line type="monotone" dataKey="income" name="Income" stroke="hsl(var(--success))" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="expenses" name="Expenses" stroke="hsl(var(--destructive))" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Forecast Tables */}
          <Tabs defaultValue="income" className="space-y-4">
            <TabsList>
              <TabsTrigger value="income">Income Statement</TabsTrigger>
              <TabsTrigger value="cashflow">Cash Flow</TabsTrigger>
              <TabsTrigger value="balance">Balance Sheet</TabsTrigger>
            </TabsList>

            <TabsContent value="income">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Forecasted Income Statement</CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[160px]">Line Item</TableHead>
                        {forecast.forecastMonths.map((m) => (
                          <TableHead key={m.month} className="text-right min-w-[100px]">{m.label}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow className="font-medium">
                        <TableCell>Salary Income</TableCell>
                        {forecast.forecastMonths.map((m) => (
                          <TableCell key={m.month} className="text-right text-success">{formatCurrency(m.salaryIncome)}</TableCell>
                        ))}
                      </TableRow>
                      <TableRow className="font-medium">
                        <TableCell>Other Income</TableCell>
                        {forecast.forecastMonths.map((m) => (
                          <TableCell key={m.month} className="text-right text-success">{formatCurrency(m.otherIncome)}</TableCell>
                        ))}
                      </TableRow>
                      <TableRow className="font-semibold bg-muted/30">
                        <TableCell>Total Income</TableCell>
                        {forecast.forecastMonths.map((m) => (
                          <TableCell key={m.month} className="text-right">{formatCurrency(m.totalIncome)}</TableCell>
                        ))}
                      </TableRow>
                      {forecast.topCategories.map((cat) => (
                        <TableRow key={cat}>
                          <TableCell className="pl-6 text-muted-foreground">{cat}</TableCell>
                          {forecast.forecastMonths.map((m) => (
                            <TableCell key={m.month} className="text-right">{formatCurrency(m.expenses[cat] || 0)}</TableCell>
                          ))}
                        </TableRow>
                      ))}
                      <TableRow className="font-semibold bg-muted/30">
                        <TableCell>Total Expenses</TableCell>
                        {forecast.forecastMonths.map((m) => (
                          <TableCell key={m.month} className="text-right">{formatCurrency(m.totalExpenses)}</TableCell>
                        ))}
                      </TableRow>
                      <TableRow className="font-bold border-t-2">
                        <TableCell>Net Income</TableCell>
                        {forecast.forecastMonths.map((m) => (
                          <TableCell key={m.month} className={`text-right ${m.netIncome >= 0 ? 'text-success' : 'text-destructive'}`}>
                            {formatCurrency(m.netIncome)}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="cashflow">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Forecasted Cash Flow</CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[160px]">Line Item</TableHead>
                        {forecast.forecastMonths.map((m) => (
                          <TableHead key={m.month} className="text-right min-w-[100px]">{m.label}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-medium">Operating Cash Flow</TableCell>
                        {forecast.forecastMonths.map((m) => (
                          <TableCell key={m.month} className="text-right">{formatCurrency(m.operatingCF)}</TableCell>
                        ))}
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Other Cash Flow</TableCell>
                        {forecast.forecastMonths.map((m) => (
                          <TableCell key={m.month} className="text-right">{formatCurrency(m.otherCF)}</TableCell>
                        ))}
                      </TableRow>
                      <TableRow className="font-semibold bg-muted/30">
                        <TableCell>Net Cash Flow</TableCell>
                        {forecast.forecastMonths.map((m) => (
                          <TableCell key={m.month} className={`text-right ${m.netCF >= 0 ? 'text-success' : 'text-destructive'}`}>
                            {formatCurrency(m.netCF)}
                          </TableCell>
                        ))}
                      </TableRow>
                      <TableRow className="font-bold border-t-2">
                        <TableCell>Cumulative Cash Position</TableCell>
                        {forecast.forecastMonths.map((m) => (
                          <TableCell key={m.month} className="text-right">{formatCurrency(m.cumulativeCash)}</TableCell>
                        ))}
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="balance">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Forecasted Balance Sheet</CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[160px]">Line Item</TableHead>
                        {forecast.forecastMonths.map((m) => (
                          <TableHead key={m.month} className="text-right min-w-[100px]">{m.label}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow className="font-semibold bg-muted/30">
                        <TableCell>Total Assets</TableCell>
                        {forecast.forecastMonths.map((m) => (
                          <TableCell key={m.month} className="text-right">{formatCurrency(m.totalAssets)}</TableCell>
                        ))}
                      </TableRow>
                      <TableRow className="font-semibold bg-muted/30">
                        <TableCell>Total Liabilities</TableCell>
                        {forecast.forecastMonths.map((m) => (
                          <TableCell key={m.month} className="text-right">{formatCurrency(m.totalLiabilities)}</TableCell>
                        ))}
                      </TableRow>
                      <TableRow className="font-bold border-t-2">
                        <TableCell>Equity</TableCell>
                        {forecast.forecastMonths.map((m) => (
                          <TableCell key={m.month} className={`text-right ${m.equity >= 0 ? 'text-success' : 'text-destructive'}`}>
                            {formatCurrency(m.equity)}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </>
  );
}

export default function Planning() {
  return (
    <AppLayout>
      <PlanningContent />
    </AppLayout>
  );
}

