import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { fetchTransactionOffsets, applyOffsets } from '@/lib/transaction-offsets';
import { useAuth } from '@/hooks/useAuth';
import { useOwnership } from '@/hooks/useOwnership';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency, formatMonth } from '@/lib/format';
import { Transaction, Account } from '@/lib/types';
import { Navigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

type PeriodType = 'monthly' | 'quarterly' | 'yearly';

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

export function CashFlowContent() {
  const { user, loading: authLoading } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [priorTransactions, setPriorTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [periodType, setPeriodType] = useState<PeriodType>('monthly');
  const [selectedPeriod, setSelectedPeriod] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const { buildMultiplierMap } = useOwnership();

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
  }, [user, selectedPeriod, periodType]);

  async function fetchData() {
    const { start, end } = getDateRange(selectedPeriod, periodType);
    const priorPeriod = getPriorPeriod(selectedPeriod, periodType);
    const { start: priorStart, end: priorEnd } = getDateRange(priorPeriod, periodType);

    const [txRes, priorTxRes, accRes, offsets] = await Promise.all([
      supabase.from('transactions').select('*').gte('date', start).lte('date', end),
      supabase.from('transactions').select('*').gte('date', priorStart).lte('date', priorEnd),
      supabase.from('accounts').select('*').or('is_deleted.is.null,is_deleted.eq.false'),
      fetchTransactionOffsets(),
    ]);

    if (txRes.data) setTransactions(applyOffsets(txRes.data as Transaction[], offsets));
    if (priorTxRes.data) setPriorTransactions(applyOffsets(priorTxRes.data as Transaction[], offsets));
    if (accRes.data) setAccounts(accRes.data as Account[]);
    setLoading(false);
  }

  if (authLoading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-pulse">Loading...</div></div>;
  if (!user) return <Navigate to="/auth" replace />;

  const multiplierMap = buildMultiplierMap(accounts);
  const scaledAmount = (t: Transaction) => t.amount * (t.account_id ? (multiplierMap[t.account_id] ?? 1) : 1);

  // Exclude linked transfers (they net to 0) and group by cash flow type
  const nonTransferTransactions = transactions.filter(t => !t.linked_transfer_id);
  const priorNonTransferTransactions = priorTransactions.filter(t => !t.linked_transfer_id);
  
  const operating = nonTransferTransactions.filter(t => t.cash_flow_type === 'operating');
  const other = nonTransferTransactions.filter(t => t.cash_flow_type === 'other');
  const priorOperating = priorNonTransferTransactions.filter(t => t.cash_flow_type === 'operating');
  const priorOther = priorNonTransferTransactions.filter(t => t.cash_flow_type === 'other');

  const operatingCashFlow = operating.reduce((sum, t) => sum - scaledAmount(t), 0);
  const otherCashFlow = other.reduce((sum, t) => sum - scaledAmount(t), 0);
  const netCashFlow = operatingCashFlow + otherCashFlow;

  const priorOperatingCashFlow = priorOperating.reduce((sum, t) => sum - scaledAmount(t), 0);
  const priorOtherCashFlow = priorOther.reduce((sum, t) => sum - scaledAmount(t), 0);
  const priorNetCashFlow = priorOperatingCashFlow + priorOtherCashFlow;

  // Calculate income for % of Income calculation
  const totalIncome = nonTransferTransactions
    .filter(t => t.amount < 0 && t.category === 'Income')
    .reduce((sum, t) => sum + Math.abs(scaledAmount(t)), 0);
  const priorTotalIncome = priorNonTransferTransactions
    .filter(t => t.amount < 0 && t.category === 'Income')
    .reduce((sum, t) => sum + Math.abs(scaledAmount(t)), 0);

  const cashAccounts = accounts.filter(a => a.type === 'checking' || a.type === 'savings');
  const endingCash = cashAccounts.reduce((sum, a) => sum + (a.current_balance || 0) * (multiplierMap[a.id] ?? 1), 0);
  const beginningCash = endingCash - netCashFlow;

  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const quarters = Array.from({ length: 8 }, (_, i) => {
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

  const groupByCategory = (txs: Transaction[]) => {
    return txs.reduce((acc, t) => {
      const cat = t.category || 'Uncategorized';
      if (!acc[cat]) acc[cat] = 0;
      acc[cat] -= scaledAmount(t); // Negative amount = inflow
      return acc;
    }, {} as Record<string, number>);
  };

  const getPeriodLabel = (period: string) => {
    if (periodType === 'monthly') return formatMonth(`${period}-01`);
    if (periodType === 'quarterly') {
      const [year, q] = period.split('-Q');
      return `Q${q} ${year}`;
    }
    return period;
  };

  const formatPercent = (value: number): string => `${value.toFixed(1)}%`;

  const formatYoY = (current: number, prior: number): { value: string; isPositive: boolean | null } => {
    if (prior === 0) {
      if (current === 0) return { value: '—', isPositive: null };
      return { value: current > 0 ? '+∞%' : '-∞%', isPositive: current > 0 };
    }
    const change = ((current - prior) / Math.abs(prior)) * 100;
    return {
      value: `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`,
      isPositive: change > 0
    };
  };

  const priorPeriod = getPriorPeriod(selectedPeriod, periodType);
  const operatingByCategory = groupByCategory(operating);
  const priorOperatingByCategory = groupByCategory(priorOperating);
  const otherByCategory = groupByCategory(other);
  const priorOtherByCategory = groupByCategory(priorOther);

  // Sort categories: Income first, then by value (largest positive to most negative)
  const sortCategories = (categories: string[], currentData: Record<string, number>) => {
    return categories.sort((a, b) => {
      // Income always comes first
      if (a === 'Income') return -1;
      if (b === 'Income') return 1;
      // Then sort by value (largest to smallest)
      const valA = currentData[a] || 0;
      const valB = currentData[b] || 0;
      return valB - valA;
    });
  };

  const allOperatingCategories = sortCategories(
    [...new Set([...Object.keys(operatingByCategory), ...Object.keys(priorOperatingByCategory)])],
    operatingByCategory
  );
  const allOtherCategories = sortCategories(
    [...new Set([...Object.keys(otherByCategory), ...Object.keys(priorOtherByCategory)])],
    otherByCategory
  );

  return (
    <>
      <PageHeader
        title="Cash Flow Statement"
        description="Track cash movements by activity type"
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
        <div className="animate-pulse text-muted-foreground">Loading cash flow...</div>
      ) : (
        <>
          {/* Cash Flow Summary */}
          <div className="grid gap-4 md:grid-cols-5 mb-8">
            <Card className="text-center">
              <CardContent className="py-4">
                <p className="text-sm text-muted-foreground">Beginning</p>
                <p className="text-xl font-bold">{formatCurrency(beginningCash)}</p>
              </CardContent>
            </Card>
            <div className="hidden md:flex items-center justify-center">
              <ArrowRight className="w-6 h-6 text-muted-foreground" />
            </div>
            <Card className="text-center">
              <CardContent className="py-4">
                <p className="text-sm text-muted-foreground">Net Change</p>
                <p className={`text-xl font-bold ${netCashFlow >= 0 ? 'text-success' : 'text-destructive'}`}>
                  {netCashFlow >= 0 ? '+' : ''}{formatCurrency(netCashFlow)}
                </p>
              </CardContent>
            </Card>
            <div className="hidden md:flex items-center justify-center">
              <ArrowRight className="w-6 h-6 text-muted-foreground" />
            </div>
            <Card className="text-center">
              <CardContent className="py-4">
                <p className="text-sm text-muted-foreground">Ending</p>
                <p className="text-xl font-bold">{formatCurrency(endingCash)}</p>
              </CardContent>
            </Card>
          </div>

          {/* Detailed Statement */}
          <Card>
            <CardHeader>
              <CardTitle>Cash Flow Statement</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table className="min-w-[600px]">
                <TableHeader>
                  <TableRow className="border-b-2">
                    <TableHead className="w-[200px] lg:w-[250px]">Category</TableHead>
                    <TableHead className="text-right font-bold">{getPeriodLabel(selectedPeriod)}</TableHead>
                    <TableHead className="text-right text-muted-foreground">% of Income</TableHead>
                    <TableHead className="text-right font-bold">{getPeriodLabel(priorPeriod)}</TableHead>
                    <TableHead className="text-right font-bold">YoY Change</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* Operating Activities */}
                  <TableRow className="bg-muted/50">
                    <TableCell colSpan={5} className="font-bold">Operating Activities</TableCell>
                  </TableRow>
                  {allOperatingCategories.map(cat => {
                    const current = operatingByCategory[cat] || 0;
                    const prior = priorOperatingByCategory[cat] || 0;
                    const yoy = formatYoY(current, prior);
                    return (
                      <TableRow key={`op-${cat}`}>
                        <TableCell className="pl-6">{cat}</TableCell>
                        <TableCell className={`text-right ${current >= 0 ? 'text-success' : 'text-destructive'}`}>
                          {formatCurrency(current)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {totalIncome > 0 ? formatPercent((current / totalIncome) * 100) : '—'}
                        </TableCell>
                        <TableCell className={`text-right ${prior >= 0 ? 'text-success' : 'text-destructive'}`}>
                          {formatCurrency(prior)}
                        </TableCell>
                        <TableCell className={`text-right ${yoy.isPositive === true ? 'text-success' : yoy.isPositive === false ? 'text-destructive' : ''}`}>
                          {yoy.value}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {allOperatingCategories.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="pl-6 text-muted-foreground">No operating activities</TableCell></TableRow>
                  )}
                  <TableRow className="border-t">
                    <TableCell className="font-medium">Net Operating Cash Flow</TableCell>
                    <TableCell className={`text-right font-medium ${operatingCashFlow >= 0 ? 'text-success' : 'text-destructive'}`}>
                      {formatCurrency(operatingCashFlow)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground font-medium">
                      {totalIncome > 0 ? formatPercent((operatingCashFlow / totalIncome) * 100) : '—'}
                    </TableCell>
                    <TableCell className={`text-right font-medium ${priorOperatingCashFlow >= 0 ? 'text-success' : 'text-destructive'}`}>
                      {formatCurrency(priorOperatingCashFlow)}
                    </TableCell>
                    <TableCell className={`text-right font-medium ${formatYoY(operatingCashFlow, priorOperatingCashFlow).isPositive === true ? 'text-success' : formatYoY(operatingCashFlow, priorOperatingCashFlow).isPositive === false ? 'text-destructive' : ''}`}>
                      {formatYoY(operatingCashFlow, priorOperatingCashFlow).value}
                    </TableCell>
                  </TableRow>

                  {/* Other Activities */}
                  <TableRow className="bg-muted/50">
                    <TableCell colSpan={5} className="font-bold">Other Activities</TableCell>
                  </TableRow>
                  {allOtherCategories.map(cat => {
                    const current = otherByCategory[cat] || 0;
                    const prior = priorOtherByCategory[cat] || 0;
                    const yoy = formatYoY(current, prior);
                    return (
                      <TableRow key={`other-${cat}`}>
                        <TableCell className="pl-6">{cat}</TableCell>
                        <TableCell className={`text-right ${current >= 0 ? 'text-success' : 'text-destructive'}`}>
                          {formatCurrency(current)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {totalIncome > 0 ? formatPercent((current / totalIncome) * 100) : '—'}
                        </TableCell>
                        <TableCell className={`text-right ${prior >= 0 ? 'text-success' : 'text-destructive'}`}>
                          {formatCurrency(prior)}
                        </TableCell>
                        <TableCell className={`text-right ${yoy.isPositive === true ? 'text-success' : yoy.isPositive === false ? 'text-destructive' : ''}`}>
                          {yoy.value}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {allOtherCategories.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="pl-6 text-muted-foreground">No other activities</TableCell></TableRow>
                  )}
                  <TableRow className="border-t">
                    <TableCell className="font-medium">Net Other Cash Flow</TableCell>
                    <TableCell className={`text-right font-medium ${otherCashFlow >= 0 ? 'text-success' : 'text-destructive'}`}>
                      {formatCurrency(otherCashFlow)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground font-medium">
                      {totalIncome > 0 ? formatPercent((otherCashFlow / totalIncome) * 100) : '—'}
                    </TableCell>
                    <TableCell className={`text-right font-medium ${priorOtherCashFlow >= 0 ? 'text-success' : 'text-destructive'}`}>
                      {formatCurrency(priorOtherCashFlow)}
                    </TableCell>
                    <TableCell className={`text-right font-medium ${formatYoY(otherCashFlow, priorOtherCashFlow).isPositive === true ? 'text-success' : formatYoY(otherCashFlow, priorOtherCashFlow).isPositive === false ? 'text-destructive' : ''}`}>
                      {formatYoY(otherCashFlow, priorOtherCashFlow).value}
                    </TableCell>
                  </TableRow>

                  {/* Total */}
                  <TableRow className="border-t-2 bg-muted/30">
                    <TableCell className="font-bold text-lg">Net Change in Cash</TableCell>
                    <TableCell className={`text-right font-bold text-lg ${netCashFlow >= 0 ? 'text-success' : 'text-destructive'}`}>
                      {formatCurrency(netCashFlow)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground font-bold">
                      {totalIncome > 0 ? formatPercent((netCashFlow / totalIncome) * 100) : '—'}
                    </TableCell>
                    <TableCell className={`text-right font-bold text-lg ${priorNetCashFlow >= 0 ? 'text-success' : 'text-destructive'}`}>
                      {formatCurrency(priorNetCashFlow)}
                    </TableCell>
                    <TableCell className={`text-right font-bold ${formatYoY(netCashFlow, priorNetCashFlow).isPositive === true ? 'text-success' : formatYoY(netCashFlow, priorNetCashFlow).isPositive === false ? 'text-destructive' : ''}`}>
                      {formatYoY(netCashFlow, priorNetCashFlow).value}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}

export default function CashFlow() {
  return (
    <AppLayout>
      <CashFlowContent />
    </AppLayout>
  );
}
