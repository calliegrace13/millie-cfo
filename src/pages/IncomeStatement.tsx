import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { fetchTransactionOffsets, applyOffsets } from '@/lib/transaction-offsets';
import { useAuth } from '@/hooks/useAuth';
import { useOwnership } from '@/hooks/useOwnership';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { formatCurrency, formatMonth } from '@/lib/format';
import { Transaction, AmortizationSchedule, Account } from '@/lib/types';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Settings2, X } from 'lucide-react';

type PeriodType = 'monthly' | 'quarterly' | 'yearly';

// Salary-related categories for income classification
const SALARY_CATEGORIES = ['salary', 'wages', 'payroll', 'paycheck', 'income'];

function getDateRange(period: string, periodType: PeriodType): { start: string; end: string } {
  if (periodType === 'monthly') {
    const [year, month] = period.split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    return {
      start: `${year}-${String(month).padStart(2, '0')}-01`,
      end: `${year}-${String(month).padStart(2, '0')}-${lastDay}`
    };
  } else if (periodType === 'quarterly') {
    const [year, quarter] = period.split('-Q').map(Number);
    const startMonth = (quarter - 1) * 3 + 1;
    const endMonth = quarter * 3;
    const lastDay = new Date(year, endMonth, 0).getDate();
    return {
      start: `${year}-${String(startMonth).padStart(2, '0')}-01`,
      end: `${year}-${String(endMonth).padStart(2, '0')}-${lastDay}`
    };
  } else {
    const year = parseInt(period);
    return {
      start: `${year}-01-01`,
      end: `${year}-12-31`
    };
  }
}

function getPriorPeriod(period: string, periodType: PeriodType): string {
  if (periodType === 'monthly') {
    const [year, month] = period.split('-').map(Number);
    const priorDate = new Date(year - 1, month - 1);
    return `${priorDate.getFullYear()}-${String(priorDate.getMonth() + 1).padStart(2, '0')}`;
  } else if (periodType === 'quarterly') {
    const [year, quarter] = period.split('-Q').map(Number);
    return `${year - 1}-Q${quarter}`;
  } else {
    return String(parseInt(period) - 1);
  }
}

function getMonthsInPeriod(periodType: PeriodType): number {
  if (periodType === 'monthly') return 1;
  if (periodType === 'quarterly') return 3;
  return 12;
}

function isSalaryIncome(transaction: Transaction): boolean {
  // Use the income_type field from the database
  return transaction.income_type === 'salary';
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatYoY(current: number, prior: number): { value: string; isPositive: boolean | null } {
  if (prior === 0) {
    if (current === 0) return { value: '—', isPositive: null };
    return { value: current > 0 ? '+∞%' : '-∞%', isPositive: current > 0 };
  }
  const change = ((current - prior) / Math.abs(prior)) * 100;
  return {
    value: `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`,
    isPositive: change > 0
  };
}

interface PeriodData {
  salaryIncome: number;
  otherIncome: number;
  amortizedIncome: number;
  totalIncome: number;
  cogs: number;
  cogsByCategory: Record<string, number>;
  grossProfit: number;
  expenses: number;
  amortizedExpenses: number;
  totalExpenses: number;
  totalOpEx: number;
  oneTimeExpenses: number;
  gaapNetIncome: number;
  nonGaapNetIncome: number;
  expensesByCategory: Record<string, number>;
}

function calculatePeriodData(
  transactions: Transaction[],
  amortizations: AmortizationSchedule[],
  startDate: Date,
  endDate: Date,
  multiplierMap: Record<string, number> = {},
  cogsCategories: Set<string> = new Set()
): PeriodData {
  const getScaled = (t: Transaction) => t.amount * (multiplierMap[t.id] ?? 1);
  // Split income by type - only count transactions with category 'Income'
  const incomeTransactions = transactions.filter(t => t.amount < 0 && t.category === 'Income');
  const salaryIncome = incomeTransactions
    .filter(t => isSalaryIncome(t))
    .reduce((sum, t) => sum + Math.abs(getScaled(t)), 0);
  const otherIncome = incomeTransactions
    .filter(t => !isSalaryIncome(t))
    .reduce((sum, t) => sum + Math.abs(getScaled(t)), 0);

  const expenseTransactions = transactions.filter(t => t.category !== 'Income');
  const expenses = expenseTransactions.reduce((sum, t) => sum + getScaled(t), 0);
  const oneTimeExpenses = transactions.filter(t => t.is_one_time_expense && t.amount > 0).reduce((sum, t) => sum + getScaled(t), 0);

  // Filter active amortizations for this period
  const activeAmortizations = amortizations.filter(a => {
    if (!a.is_active) return false;
    const schedStart = new Date(a.start_date + 'T12:00:00');
    const schedEnd = new Date(a.end_date + 'T12:00:00');
    return schedStart <= endDate && schedEnd >= startDate;
  });

  const getAmortizationAmount = (a: AmortizationSchedule) => {
    const scheduleStart = new Date(a.start_date + 'T12:00:00');
    const scheduleEnd = new Date(a.end_date + 'T12:00:00');
    const effectiveStart = scheduleStart > startDate ? scheduleStart : startDate;
    const effectiveEnd = scheduleEnd < endDate ? scheduleEnd : endDate;
    const startYear = effectiveStart.getFullYear();
    const startMonthNum = effectiveStart.getMonth();
    const endYear = effectiveEnd.getFullYear();
    const endMonthNum = effectiveEnd.getMonth();
    const monthsActive = Math.max(0, (endYear - startYear) * 12 + (endMonthNum - startMonthNum) + 1);
    return a.monthly_amount * monthsActive;
  };

  // Separate expense amortizations from income amortizations
  const expenseAmortizations = activeAmortizations.filter(a => a.type !== 'deferred_income');
  const incomeAmortizations = activeAmortizations.filter(a => a.type === 'deferred_income');

  const amortizedExpenses = expenseAmortizations.reduce((sum, a) => sum + getAmortizationAmount(a), 0);
  const amortizedIncome = incomeAmortizations.reduce((sum, a) => sum + getAmortizationAmount(a), 0);

  // Normalize for case-insensitive COGS matching
  const cogsLower = new Set([...cogsCategories].map(c => c.toLowerCase()));
  const isCogs = (cat: string) => cogsLower.has(cat.toLowerCase());

  // Group expenses by category, split into COGS vs operating
  const expensesByCategory: Record<string, number> = {};
  const cogsByCategory: Record<string, number> = {};

  expenseTransactions.forEach(t => {
    const cat = t.category || 'Uncategorized';
    const amount = getScaled(t);
    if (isCogs(cat)) {
      cogsByCategory[cat] = (cogsByCategory[cat] || 0) + amount;
    } else {
      expensesByCategory[cat] = (expensesByCategory[cat] || 0) + amount;
    }
  });

  // Add amortized expenses by category
  expenseAmortizations.forEach(a => {
    const cat = a.category || 'Amortization';
    const amount = getAmortizationAmount(a);
    if (isCogs(cat)) {
      cogsByCategory[cat] = (cogsByCategory[cat] || 0) + amount;
    } else {
      if (!expensesByCategory[cat]) expensesByCategory[cat] = 0;
      expensesByCategory[cat] += amount;
    }
  });

  const cogs = Object.values(cogsByCategory).reduce((a, b) => a + b, 0);
  const totalIncome = salaryIncome + otherIncome + amortizedIncome;
  const grossProfit = totalIncome - cogs;
  const totalExpenses = expenses + amortizedExpenses;
  const totalOpEx = totalExpenses - cogs;
  const gaapNetIncome = totalIncome - totalExpenses;
  const nonGaapNetIncome = gaapNetIncome + oneTimeExpenses;

  return {
    salaryIncome,
    otherIncome,
    amortizedIncome,
    totalIncome,
    cogs,
    cogsByCategory,
    grossProfit,
    expenses,
    amortizedExpenses,
    totalExpenses,
    totalOpEx,
    oneTimeExpenses,
    gaapNetIncome,
    nonGaapNetIncome,
    expensesByCategory
  };
}

export function IncomeStatementContent() {
  const { user, loading: authLoading } = useAuth();
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [allAmortizations, setAllAmortizations] = useState<AmortizationSchedule[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [periodType, setPeriodType] = useState<PeriodType>('monthly');
  const [selectedPeriod, setSelectedPeriod] = useState(() => {
    const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [cogsCategories, setCogsCategories] = useState<string[]>([]);
  const [cogsDialogOpen, setCogsDialogOpen] = useState(false);
  const { getTransactionMultiplier } = useOwnership();

  useEffect(() => {
    const now = new Date();
    if (periodType === 'monthly') {
      setSelectedPeriod(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
    } else if (periodType === 'quarterly') {
      const quarter = Math.ceil((now.getMonth() + 1) / 3);
      setSelectedPeriod(`${now.getFullYear()}-Q${quarter}`);
    } else {
      setSelectedPeriod(String(now.getFullYear()));
    }
  }, [periodType]);

  useEffect(() => {
    if (user) fetchData();
  }, [user]);

  async function fetchData() {
    const PAGE_SIZE = 1000;

    async function fetchAllTransactions(): Promise<Transaction[]> {
      const all: Transaction[] = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await supabase
          .from('transactions')
          .select('*')
          .order('date', { ascending: true })
          .range(from, from + PAGE_SIZE - 1);

        if (error) throw error;
        const batch = (data || []) as Transaction[];
        all.push(...batch);
        if (batch.length < PAGE_SIZE) break;
      }
      return all;
    }

    async function fetchAllAmortizations(): Promise<AmortizationSchedule[]> {
      const all: AmortizationSchedule[] = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await supabase
          .from('amortization_schedules')
          .select('*')
          .order('start_date', { ascending: true })
          .range(from, from + PAGE_SIZE - 1);

        if (error) throw error;
        const batch = (data || []) as AmortizationSchedule[];
        all.push(...batch);
        if (batch.length < PAGE_SIZE) break;
      }
      return all;
    }

    setLoading(true);
    try {
      const [transactions, amortizations, accRes, cogsRes, offsets] = await Promise.all([
        fetchAllTransactions(),
        fetchAllAmortizations(),
        supabase.from('accounts').select('*').or('is_deleted.is.null,is_deleted.eq.false'),
        supabase.from('cogs_categories').select('category_name'),
        fetchTransactionOffsets(),
      ]);

      setAllTransactions(applyOffsets(transactions, offsets));
      setAllAmortizations(amortizations);
      if (accRes.data) setAccounts(accRes.data as Account[]);
      if (cogsRes.data) setCogsCategories(cogsRes.data.map((r: any) => r.category_name));
    } catch (err) {
      console.error('Failed to load income statement data', err);
      toast.error('Failed to load income statement data');
    } finally {
      setLoading(false);
    }
  }

  async function addCogsCategory(categoryName: string) {
    const { error } = await supabase.from('cogs_categories').insert({ user_id: user!.id, category_name: categoryName });
    if (error) { toast.error('Failed to add COGS category'); return; }
    setCogsCategories(prev => [...prev, categoryName]);
    toast.success(`"${categoryName}" added to COGS`);
  }

  async function removeCogsCategory(categoryName: string) {
    const { error } = await supabase.from('cogs_categories').delete().eq('user_id', user!.id).eq('category_name', categoryName);
    if (error) { toast.error('Failed to remove COGS category'); return; }
    setCogsCategories(prev => prev.filter(c => c !== categoryName));
    toast.success(`"${categoryName}" removed from COGS`);
  }

  if (authLoading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-pulse">Loading...</div></div>;
  if (!user) return <Navigate to="/auth" replace />;

  // Current period
  const { start: currentStart, end: currentEnd } = getDateRange(selectedPeriod, periodType);
  const currentStartDate = new Date(currentStart + 'T12:00:00');
  const currentEndDate = new Date(currentEnd + 'T12:00:00');

  // Prior period (year ago)
  const priorPeriod = getPriorPeriod(selectedPeriod, periodType);
  const { start: priorStart, end: priorEnd } = getDateRange(priorPeriod, periodType);
  const priorStartDate = new Date(priorStart + 'T12:00:00');
  const priorEndDate = new Date(priorEnd + 'T12:00:00');

  // Filter transactions for each period (exclude linked transfers - they net to 0)
  const currentTransactions = allTransactions.filter(t => {
    if (t.pending || t.category?.toLowerCase() === 'transfer') return false;
    if (t.is_amortized) return false;
    if (t.linked_transfer_id) return false; // Exclude transfers
    const recognitionDate = t.recognition_date || t.date;
    return recognitionDate >= currentStart && recognitionDate <= currentEnd;
  });

  const priorTransactions = allTransactions.filter(t => {
    if (t.pending || t.category?.toLowerCase() === 'transfer') return false;
    if (t.is_amortized) return false;
    if (t.linked_transfer_id) return false; // Exclude transfers
    const recognitionDate = t.recognition_date || t.date;
    return recognitionDate >= priorStart && recognitionDate <= priorEnd;
  });

  const multiplierMap = Object.fromEntries(allTransactions.map(t => [t.id, getTransactionMultiplier(t, accounts)]));

  const cogsSet = new Set(cogsCategories);
  const current = calculatePeriodData(currentTransactions, allAmortizations, currentStartDate, currentEndDate, multiplierMap, cogsSet);
  const prior = calculatePeriodData(priorTransactions, allAmortizations, priorStartDate, priorEndDate, multiplierMap, cogsSet);

  // Generate period options
  const months = Array.from({ length: 24 }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const quarters = Array.from({ length: 12 }, (_, i) => {
    const now = new Date();
    const totalQuarters = Math.ceil((now.getMonth() + 1) / 3) + now.getFullYear() * 4;
    const targetQuarter = totalQuarters - i;
    const year = Math.floor((targetQuarter - 1) / 4);
    const quarter = ((targetQuarter - 1) % 4) + 1;
    return `${year}-Q${quarter}`;
  });

  const years = Array.from({ length: 5 }, (_, i) => {
    return String(new Date().getFullYear() - i);
  });

  const getPeriodLabel = (period: string) => {
    if (periodType === 'monthly') {
      // Ensure period is in YYYY-MM format before adding day
      if (period.match(/^\d{4}-\d{2}$/)) {
        return formatMonth(`${period}-01`);
      }
      // Fallback if period is not in expected format yet
      return period;
    }
    if (periodType === 'quarterly') {
      const parts = period.split('-Q');
      if (parts.length === 2) {
        return `Q${parts[1]} ${parts[0]}`;
      }
      return period;
    }
    return period;
  };

  // Get all unique expense categories (non-COGS) from both periods
  const allCategories = [...new Set([
    ...Object.keys(current.expensesByCategory),
    ...Object.keys(prior.expensesByCategory)
  ])].sort();

  // Get all unique COGS categories from both periods
  const allCogsCategories = [...new Set([
    ...Object.keys(current.cogsByCategory),
    ...Object.keys(prior.cogsByCategory)
  ])].sort();

  // Get all unique expense categories across everything (for the COGS config dialog)
  const allExpenseCategories = [...new Set([
    ...allCategories,
    ...allCogsCategories,
  ])].sort();

  return (
    <>
      <PageHeader
        title="Income Statement"
        description="Consolidated statement of operations"
        actions={
          <div className="flex gap-2">
            <Select value={periodType} onValueChange={(v) => setPeriodType(v as PeriodType)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
                <SelectItem value="yearly">Yearly</SelectItem>
              </SelectContent>
            </Select>
            <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {periodType === 'monthly' && months.map(m => (
                  <SelectItem key={m} value={m}>{formatMonth(`${m}-01`)}</SelectItem>
                ))}
                {periodType === 'quarterly' && quarters.map(q => (
                  <SelectItem key={q} value={q}>{q.replace('-Q', ' Q')}</SelectItem>
                ))}
                {periodType === 'yearly' && years.map(y => (
                  <SelectItem key={y} value={y}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      {loading ? (
        <div className="animate-pulse text-muted-foreground">Loading statement...</div>
      ) : (
        <div className="space-y-6">
          {/* GAAP Income Statement */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                Consolidated Statement of Operations (GAAP)
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                (In dollars, except percentages)
              </p>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table className="min-w-[700px]">
                <TableHeader>
                  <TableRow className="border-b-2">
                    <TableHead className="w-[200px] lg:w-[300px]"></TableHead>
                    <TableHead className="text-right font-bold">{getPeriodLabel(selectedPeriod)}</TableHead>
                    <TableHead className="text-right text-muted-foreground">% of Income</TableHead>
                    <TableHead className="text-right font-bold">{getPeriodLabel(priorPeriod)}</TableHead>
                    <TableHead className="text-right text-muted-foreground">% of Income</TableHead>
                    <TableHead className="text-right font-bold">YoY Change</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* Revenue Section */}
                  <TableRow className="bg-muted/50">
                    <TableCell colSpan={6} className="font-bold">Revenue:</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="pl-6">Salary Income</TableCell>
                    <TableCell className="text-right">{formatCurrency(current.salaryIncome)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {current.totalIncome > 0 ? formatPercent((current.salaryIncome / current.totalIncome) * 100) : '—'}
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(prior.salaryIncome)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {prior.totalIncome > 0 ? formatPercent((prior.salaryIncome / prior.totalIncome) * 100) : '—'}
                    </TableCell>
                    <TableCell className={`text-right ${formatYoY(current.salaryIncome, prior.salaryIncome).isPositive === true ? 'text-success' : formatYoY(current.salaryIncome, prior.salaryIncome).isPositive === false ? 'text-destructive' : ''}`}>
                      {formatYoY(current.salaryIncome, prior.salaryIncome).value}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="pl-6">Other Income</TableCell>
                    <TableCell className="text-right">{formatCurrency(current.otherIncome)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {current.totalIncome > 0 ? formatPercent((current.otherIncome / current.totalIncome) * 100) : '—'}
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(prior.otherIncome)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {prior.totalIncome > 0 ? formatPercent((prior.otherIncome / prior.totalIncome) * 100) : '—'}
                    </TableCell>
                    <TableCell className={`text-right ${formatYoY(current.otherIncome, prior.otherIncome).isPositive === true ? 'text-success' : formatYoY(current.otherIncome, prior.otherIncome).isPositive === false ? 'text-destructive' : ''}`}>
                      {formatYoY(current.otherIncome, prior.otherIncome).value}
                    </TableCell>
                  </TableRow>
                  {(current.amortizedIncome > 0 || prior.amortizedIncome > 0) && (
                    <TableRow>
                      <TableCell className="pl-6">Deferred Income (Amortized)</TableCell>
                      <TableCell className="text-right">{formatCurrency(current.amortizedIncome)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {current.totalIncome > 0 ? formatPercent((current.amortizedIncome / current.totalIncome) * 100) : '—'}
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(prior.amortizedIncome)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {prior.totalIncome > 0 ? formatPercent((prior.amortizedIncome / prior.totalIncome) * 100) : '—'}
                      </TableCell>
                      <TableCell className={`text-right ${formatYoY(current.amortizedIncome, prior.amortizedIncome).isPositive === true ? 'text-success' : formatYoY(current.amortizedIncome, prior.amortizedIncome).isPositive === false ? 'text-destructive' : ''}`}>
                        {formatYoY(current.amortizedIncome, prior.amortizedIncome).value}
                      </TableCell>
                    </TableRow>
                  )}
                  <TableRow className="border-t font-semibold">
                    <TableCell className="pl-8">Total Revenue</TableCell>
                    <TableCell className="text-right">{formatCurrency(current.totalIncome)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">100.0%</TableCell>
                    <TableCell className="text-right">{formatCurrency(prior.totalIncome)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">100.0%</TableCell>
                    <TableCell className={`text-right ${formatYoY(current.totalIncome, prior.totalIncome).isPositive === true ? 'text-success' : formatYoY(current.totalIncome, prior.totalIncome).isPositive === false ? 'text-destructive' : ''}`}>
                      {formatYoY(current.totalIncome, prior.totalIncome).value}
                    </TableCell>
                  </TableRow>

                  {/* COGS Section */}
                  {(current.cogs > 0 || prior.cogs > 0 || cogsCategories.length > 0) && (
                    <>
                      <TableRow className="bg-muted/50">
                        <TableCell colSpan={5} className="font-bold">Cost of Goods Sold:</TableCell>
                        <TableCell className="text-right">
                          <Dialog open={cogsDialogOpen} onOpenChange={setCogsDialogOpen}>
                            <DialogTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-6 px-2">
                                <Settings2 className="w-3 h-3 mr-1" /> Configure
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Configure COGS Categories</DialogTitle>
                              </DialogHeader>
                              <p className="text-sm text-muted-foreground mb-4">
                                Select which expense categories should be classified as Cost of Goods Sold instead of Operating Expenses.
                              </p>
                              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                                {allExpenseCategories.map(cat => {
                                  const isChecked = cogsCategories.some(c => c.toLowerCase() === cat.toLowerCase());
                                  return (
                                    <label key={cat} className="flex items-center gap-2 p-2 rounded hover:bg-muted cursor-pointer">
                                      <Checkbox
                                        checked={isChecked}
                                        onCheckedChange={(checked) => {
                                          if (checked) addCogsCategory(cat);
                                          else removeCogsCategory(cat);
                                        }}
                                      />
                                      <span className="text-sm">{cat}</span>
                                    </label>
                                  );
                                })}
                                {allExpenseCategories.length === 0 && (
                                  <p className="text-sm text-muted-foreground">No expense categories found.</p>
                                )}
                              </div>
                            </DialogContent>
                          </Dialog>
                        </TableCell>
                      </TableRow>
                      {allCogsCategories.map(cat => {
                        const currentAmount = current.cogsByCategory[cat] || 0;
                        const priorAmount = prior.cogsByCategory[cat] || 0;
                        if (currentAmount === 0 && priorAmount === 0) return null;
                        return (
                          <TableRow key={`cogs-${cat}`}>
                            <TableCell className="pl-6">{cat.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ')}</TableCell>
                            <TableCell className="text-right">({formatCurrency(currentAmount)})</TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {current.totalIncome > 0 ? formatPercent((currentAmount / current.totalIncome) * 100) : '—'}
                            </TableCell>
                            <TableCell className="text-right">({formatCurrency(priorAmount)})</TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {prior.totalIncome > 0 ? formatPercent((priorAmount / prior.totalIncome) * 100) : '—'}
                            </TableCell>
                            <TableCell className={`text-right ${formatYoY(currentAmount, priorAmount).isPositive === false ? 'text-success' : formatYoY(currentAmount, priorAmount).isPositive === true ? 'text-destructive' : ''}`}>
                              {formatYoY(currentAmount, priorAmount).value}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      <TableRow className="border-t font-semibold">
                        <TableCell className="pl-8">Total COGS</TableCell>
                        <TableCell className="text-right">({formatCurrency(current.cogs)})</TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {current.totalIncome > 0 ? formatPercent((current.cogs / current.totalIncome) * 100) : '—'}
                        </TableCell>
                        <TableCell className="text-right">({formatCurrency(prior.cogs)})</TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {prior.totalIncome > 0 ? formatPercent((prior.cogs / prior.totalIncome) * 100) : '—'}
                        </TableCell>
                        <TableCell className={`text-right ${formatYoY(current.cogs, prior.cogs).isPositive === false ? 'text-success' : formatYoY(current.cogs, prior.cogs).isPositive === true ? 'text-destructive' : ''}`}>
                          {formatYoY(current.cogs, prior.cogs).value}
                        </TableCell>
                      </TableRow>

                      {/* Gross Profit */}
                      <TableRow className="border-t-2 bg-muted/30">
                        <TableCell className="font-bold">Gross Profit</TableCell>
                        <TableCell className={`text-right font-bold ${current.grossProfit >= 0 ? 'text-success' : 'text-destructive'}`}>
                          {formatCurrency(current.grossProfit)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground font-semibold">
                          {current.totalIncome > 0 ? formatPercent((current.grossProfit / current.totalIncome) * 100) : '—'}
                        </TableCell>
                        <TableCell className={`text-right font-bold ${prior.grossProfit >= 0 ? 'text-success' : 'text-destructive'}`}>
                          {formatCurrency(prior.grossProfit)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground font-semibold">
                          {prior.totalIncome > 0 ? formatPercent((prior.grossProfit / prior.totalIncome) * 100) : '—'}
                        </TableCell>
                        <TableCell className={`text-right font-bold ${formatYoY(current.grossProfit, prior.grossProfit).isPositive === true ? 'text-success' : formatYoY(current.grossProfit, prior.grossProfit).isPositive === false ? 'text-destructive' : ''}`}>
                          {formatYoY(current.grossProfit, prior.grossProfit).value}
                        </TableCell>
                      </TableRow>
                    </>
                  )}

                  {/* Operating Expenses Section */}
                  <TableRow className="bg-muted/50">
                    <TableCell colSpan={6} className="font-bold">Operating Expenses:</TableCell>
                  </TableRow>
                  {allCategories.map(cat => {
                    const currentAmount = current.expensesByCategory[cat] || 0;
                    const priorAmount = prior.expensesByCategory[cat] || 0;
                    if (currentAmount === 0 && priorAmount === 0) return null;
                    return (
                      <TableRow key={cat}>
                        <TableCell className="pl-6">{cat.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ')}</TableCell>
                        <TableCell className="text-right">({formatCurrency(currentAmount)})</TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {current.totalIncome > 0 ? formatPercent((currentAmount / current.totalIncome) * 100) : '—'}
                        </TableCell>
                        <TableCell className="text-right">({formatCurrency(priorAmount)})</TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {prior.totalIncome > 0 ? formatPercent((priorAmount / prior.totalIncome) * 100) : '—'}
                        </TableCell>
                        <TableCell className={`text-right ${formatYoY(currentAmount, priorAmount).isPositive === false ? 'text-success' : formatYoY(currentAmount, priorAmount).isPositive === true ? 'text-destructive' : ''}`}>
                          {formatYoY(currentAmount, priorAmount).value}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow className="border-t font-semibold">
                    <TableCell className="pl-8">Total Operating Expenses</TableCell>
                    <TableCell className="text-right">({formatCurrency(current.totalOpEx)})</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {current.totalIncome > 0 ? formatPercent((current.totalOpEx / current.totalIncome) * 100) : '—'}
                    </TableCell>
                    <TableCell className="text-right">({formatCurrency(prior.totalOpEx)})</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {prior.totalIncome > 0 ? formatPercent((prior.totalOpEx / prior.totalIncome) * 100) : '—'}
                    </TableCell>
                    <TableCell className={`text-right ${formatYoY(current.totalOpEx, prior.totalOpEx).isPositive === false ? 'text-success' : formatYoY(current.totalOpEx, prior.totalOpEx).isPositive === true ? 'text-destructive' : ''}`}>
                      {formatYoY(current.totalOpEx, prior.totalOpEx).value}
                    </TableCell>
                  </TableRow>

                  {/* Net Income */}
                  <TableRow className="border-t-2 bg-muted/30">
                    <TableCell className="font-bold text-lg">Net Income (GAAP)</TableCell>
                    <TableCell className={`text-right font-bold text-lg ${current.gaapNetIncome >= 0 ? 'text-success' : 'text-destructive'}`}>
                      {formatCurrency(current.gaapNetIncome)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground font-semibold">
                      {current.totalIncome > 0 ? formatPercent((current.gaapNetIncome / current.totalIncome) * 100) : '—'}
                    </TableCell>
                    <TableCell className={`text-right font-bold text-lg ${prior.gaapNetIncome >= 0 ? 'text-success' : 'text-destructive'}`}>
                      {formatCurrency(prior.gaapNetIncome)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground font-semibold">
                      {prior.totalIncome > 0 ? formatPercent((prior.gaapNetIncome / prior.totalIncome) * 100) : '—'}
                    </TableCell>
                    <TableCell className={`text-right font-bold ${formatYoY(current.gaapNetIncome, prior.gaapNetIncome).isPositive === true ? 'text-success' : formatYoY(current.gaapNetIncome, prior.gaapNetIncome).isPositive === false ? 'text-destructive' : ''}`}>
                      {formatYoY(current.gaapNetIncome, prior.gaapNetIncome).value}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Non-GAAP Reconciliation */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                Non-GAAP Reconciliation
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Adjusted to exclude one-time expenses
              </p>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table className="min-w-[700px]">
                <TableHeader>
                  <TableRow className="border-b-2">
                    <TableHead className="w-[200px] lg:w-[300px]"></TableHead>
                    <TableHead className="text-right font-bold">{getPeriodLabel(selectedPeriod)}</TableHead>
                    <TableHead className="text-right text-muted-foreground">% of Income</TableHead>
                    <TableHead className="text-right font-bold">{getPeriodLabel(priorPeriod)}</TableHead>
                    <TableHead className="text-right text-muted-foreground">% of Income</TableHead>
                    <TableHead className="text-right font-bold">YoY Change</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">Net Income (GAAP)</TableCell>
                    <TableCell className="text-right">{formatCurrency(current.gaapNetIncome)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {current.totalIncome > 0 ? formatPercent((current.gaapNetIncome / current.totalIncome) * 100) : '—'}
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(prior.gaapNetIncome)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {prior.totalIncome > 0 ? formatPercent((prior.gaapNetIncome / prior.totalIncome) * 100) : '—'}
                    </TableCell>
                    <TableCell className={`text-right ${formatYoY(current.gaapNetIncome, prior.gaapNetIncome).isPositive === true ? 'text-success' : formatYoY(current.gaapNetIncome, prior.gaapNetIncome).isPositive === false ? 'text-destructive' : ''}`}>
                      {formatYoY(current.gaapNetIncome, prior.gaapNetIncome).value}
                    </TableCell>
                  </TableRow>
                  <TableRow className="bg-muted/50">
                    <TableCell colSpan={6} className="font-bold">Adjustments:</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="pl-6">Add: One-Time Transaction Expenses</TableCell>
                    <TableCell className="text-right text-success">+{formatCurrency(current.oneTimeExpenses)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {current.totalIncome > 0 ? formatPercent((current.oneTimeExpenses / current.totalIncome) * 100) : '—'}
                    </TableCell>
                    <TableCell className="text-right text-success">+{formatCurrency(prior.oneTimeExpenses)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {prior.totalIncome > 0 ? formatPercent((prior.oneTimeExpenses / prior.totalIncome) * 100) : '—'}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {formatYoY(current.oneTimeExpenses, prior.oneTimeExpenses).value}
                    </TableCell>
                  </TableRow>
                  <TableRow className="border-t-2 bg-muted/30">
                    <TableCell className="font-bold text-lg">Adjusted Net Income (Non-GAAP)</TableCell>
                    <TableCell className={`text-right font-bold text-lg ${current.nonGaapNetIncome >= 0 ? 'text-success' : 'text-destructive'}`}>
                      {formatCurrency(current.nonGaapNetIncome)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground font-semibold">
                      {current.totalIncome > 0 ? formatPercent((current.nonGaapNetIncome / current.totalIncome) * 100) : '—'}
                    </TableCell>
                    <TableCell className={`text-right font-bold text-lg ${prior.nonGaapNetIncome >= 0 ? 'text-success' : 'text-destructive'}`}>
                      {formatCurrency(prior.nonGaapNetIncome)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground font-semibold">
                      {prior.totalIncome > 0 ? formatPercent((prior.nonGaapNetIncome / prior.totalIncome) * 100) : '—'}
                    </TableCell>
                    <TableCell className={`text-right font-bold ${formatYoY(current.nonGaapNetIncome, prior.nonGaapNetIncome).isPositive === true ? 'text-success' : formatYoY(current.nonGaapNetIncome, prior.nonGaapNetIncome).isPositive === false ? 'text-destructive' : ''}`}>
                      {formatYoY(current.nonGaapNetIncome, prior.nonGaapNetIncome).value}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}

export default function IncomeStatement() {
  return (
    <AppLayout>
      <IncomeStatementContent />
    </AppLayout>
  );
}

