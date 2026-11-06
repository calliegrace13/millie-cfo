import { useState, useEffect, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatCurrency } from '@/lib/format';
import type { Transaction, RecurringTransaction, RecurringFrequency } from '@/lib/types';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Repeat, Plus, Trash2, AlertTriangle, CalendarCheck,
  TrendingUp, TrendingDown, Search, Sparkles, Eye, EyeOff
} from 'lucide-react';
import { addDays, addWeeks, addMonths, addYears, format, differenceInDays, parseISO } from 'date-fns';

// ── Auto-detection types ──────────────────────────────────────────

type DetectedPattern = {
  merchant: string;
  avgAmount: number;
  frequency: RecurringFrequency;
  lastDate: string;
  nextExpected: string;
  occurrences: number;
  category?: string;
  amountVariance: number; // % variance in amounts
  transactions: Transaction[];
};

// ── Helpers ───────────────────────────────────────────────────────

function normalizeMerchantKey(tx: Transaction): string {
  const raw = (tx.merchant_name || tx.name).toLowerCase().trim();
  // Strip trailing reference/ID codes (e.g., Zelle payment to NAME JPM99xyz123)
  return raw
    .replace(/\s+jpm[a-z0-9]+$/i, '')       // Zelle JPMorgan ref IDs
    .replace(/\s+[a-z0-9]{8,}$/i, '')        // generic long alphanumeric suffixes
    .replace(/\s+\d{2}\/\d{2}$/i, '')        // trailing dates like 06/13
    .replace(/\s+ppd\s+id:\s*\d+$/i, '')     // ACH PPD IDs
    .replace(/\s+web\s+id:\s*\d+$/i, '')     // ACH WEB IDs
    .trim();
}

function inferFrequency(gaps: number[]): RecurringFrequency | null {
  if (gaps.length < 1) return null;
  const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  if (avg >= 340 && avg <= 400) return 'yearly';
  if (avg >= 80 && avg <= 100) return 'quarterly';
  if (avg >= 25 && avg <= 35) return 'monthly';
  if (avg >= 12 && avg <= 16) return 'biweekly';
  if (avg >= 5 && avg <= 9) return 'weekly';
  return null;
}

function getNextDate(lastDate: string, freq: RecurringFrequency): string {
  const d = parseISO(lastDate);
  switch (freq) {
    case 'weekly': return format(addWeeks(d, 1), 'yyyy-MM-dd');
    case 'biweekly': return format(addWeeks(d, 2), 'yyyy-MM-dd');
    case 'monthly': return format(addMonths(d, 1), 'yyyy-MM-dd');
    case 'quarterly': return format(addMonths(d, 3), 'yyyy-MM-dd');
    case 'yearly': return format(addYears(d, 1), 'yyyy-MM-dd');
  }
}

function getMonthlyEquivalent(amount: number, freq: RecurringFrequency): number {
  switch (freq) {
    case 'weekly': return amount * 4.33;
    case 'biweekly': return amount * 2.17;
    case 'monthly': return amount;
    case 'quarterly': return amount / 3;
    case 'yearly': return amount / 12;
  }
}

const FREQUENCY_LABELS: Record<RecurringFrequency, string> = {
  weekly: 'Weekly',
  biweekly: 'Bi-weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
};

// ── Component ─────────────────────────────────────────────────────

export function RecurringContent() {
  const { user, loading: authLoading } = useAuth();
  const [recurring, setRecurring] = useState<RecurringTransaction[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [detectedPatterns, setDetectedPatterns] = useState<DetectedPattern[]>([]);
  const [showDetected, setShowDetected] = useState(false);
  const [newItem, setNewItem] = useState({
    name: '', merchant_name: '', expected_amount: '', frequency: 'monthly' as RecurringFrequency,
    category: '', notes: '',
  });

  useEffect(() => {
    if (!user) return;
    fetchData();
  }, [user]);

  async function fetchData() {
    setLoading(true);
    const recRes = await supabase.from('recurring_transactions').select('*').eq('user_id', user!.id).order('name');

    // Fetch all transactions with pagination (Supabase default limit is 1000)
    let allTx: Transaction[] = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data } = await supabase.from('transactions').select('*')
        .eq('user_id', user!.id)
        .is('linked_transfer_id', null)
        .order('date', { ascending: true })
        .range(from, from + pageSize - 1);
      const rows = (data ?? []) as Transaction[];
      allTx = allTx.concat(rows);
      if (rows.length < pageSize) break;
      from += pageSize;
    }

    setRecurring((recRes.data ?? []) as unknown as RecurringTransaction[]);
    setTransactions(allTx);
    setLoading(false);
  }

  // ── Auto-detection ────────────────────────────────────────────

  function detectRecurring() {
    setDetecting(true);
    const merchantGroups: Record<string, Transaction[]> = {};

    transactions.forEach(tx => {
      const key = normalizeMerchantKey(tx);
      if (!merchantGroups[key]) merchantGroups[key] = [];
      merchantGroups[key].push(tx);
    });

    const existingMerchants = new Set(
      recurring.map(r => {
        const raw = (r.merchant_name || r.name).toLowerCase().trim();
        return raw
          .replace(/\s+jpm[a-z0-9]+$/i, '')
          .replace(/\s+[a-z0-9]{8,}$/i, '')
          .replace(/\s+\d{2}\/\d{2}$/i, '')
          .replace(/\s+ppd\s+id:\s*\d+$/i, '')
          .replace(/\s+web\s+id:\s*\d+$/i, '')
          .trim();
      })
    );

    const patterns: DetectedPattern[] = [];

    Object.entries(merchantGroups).forEach(([merchant, txs]) => {
      if (txs.length < 3) return; // need at least 3 occurrences
      if (existingMerchants.has(merchant)) return;

      // Sort by date
      const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date));
      const gaps = sorted.slice(1).map((tx, i) =>
        differenceInDays(parseISO(tx.date), parseISO(sorted[i].date))
      );

      const freq = inferFrequency(gaps);
      if (!freq) return;

      // Use recent transactions (last 6) for amount analysis to handle price changes over time
      const recentSorted = sorted.slice(-6);
      const amounts = recentSorted.map(t => Math.abs(t.amount));
      const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
      const maxDiff = Math.max(...amounts.map(a => Math.abs(a - avg)));
      const variance = avg > 0 ? (maxDiff / avg) * 100 : 0;

      // Skip if recent amounts vary too wildly (>40%)
      if (variance > 40) return;

      const lastTx = sorted[sorted.length - 1];
      const nextExpected = getNextDate(lastTx.date, freq);

      // Skip if last transaction is too far in the past (> 2x the avg gap)
      const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      const daysSinceLast = differenceInDays(new Date(), parseISO(lastTx.date));
      if (daysSinceLast > avgGap * 2.5) return;

      patterns.push({
        merchant: lastTx.merchant_name || normalizeMerchantKey(lastTx).replace(/\b\w/g, c => c.toUpperCase()),
        avgAmount: Math.round(avg * 100) / 100,
        frequency: freq,
        lastDate: lastTx.date,
        nextExpected,
        occurrences: sorted.length,
        category: txs[0].category || undefined,
        amountVariance: Math.round(variance * 10) / 10,
        transactions: sorted,
      });
    });

    patterns.sort((a, b) => getMonthlyEquivalent(b.avgAmount, b.frequency) - getMonthlyEquivalent(a.avgAmount, a.frequency));
    setDetectedPatterns(patterns);
    setShowDetected(true);
    setDetecting(false);
  }

  async function confirmDetected(pattern: DetectedPattern) {
    if (!user) return;
    const isExpense = pattern.transactions[0].amount > 0;

    const { error } = await supabase.from('recurring_transactions').insert({
      user_id: user.id,
      name: pattern.merchant,
      merchant_name: pattern.merchant,
      expected_amount: isExpense ? pattern.avgAmount : -pattern.avgAmount,
      frequency: pattern.frequency,
      category: pattern.category,
      last_seen_date: pattern.lastDate,
      next_expected_date: pattern.nextExpected,
      last_amount: Math.abs(pattern.transactions[pattern.transactions.length - 1].amount),
      is_auto_detected: true,
      is_active: true,
    } as any);

    if (error) {
      toast.error('Failed to save');
    } else {
      toast.success(`Added "${pattern.merchant}" as recurring`);
      setDetectedPatterns(prev => prev.filter(p => p.merchant !== pattern.merchant));
      fetchData();
    }
  }

  // ── Manual add ────────────────────────────────────────────────

  async function addManual(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const amount = parseFloat(newItem.expected_amount);
    if (isNaN(amount)) return;

    const nextDate = getNextDate(format(new Date(), 'yyyy-MM-dd'), newItem.frequency);
    const { error } = await supabase.from('recurring_transactions').insert({
      user_id: user.id,
      name: newItem.name,
      merchant_name: newItem.merchant_name || null,
      expected_amount: amount,
      frequency: newItem.frequency,
      category: newItem.category || null,
      next_expected_date: nextDate,
      is_auto_detected: false,
      is_active: true,
      notes: newItem.notes || null,
    } as any);

    if (error) {
      toast.error('Failed to add recurring item');
    } else {
      toast.success('Recurring item added');
      setNewItem({ name: '', merchant_name: '', expected_amount: '', frequency: 'monthly', category: '', notes: '' });
      setAddOpen(false);
      fetchData();
    }
  }

  async function toggleActive(item: RecurringTransaction) {
    await supabase.from('recurring_transactions')
      .update({ is_active: !item.is_active } as any)
      .eq('id', item.id);
    setRecurring(prev => prev.map(r => r.id === item.id ? { ...r, is_active: !r.is_active } : r));
  }

  async function deleteItem(id: string) {
    await supabase.from('recurring_transactions').delete().eq('id', id);
    setRecurring(prev => prev.filter(r => r.id !== id));
    toast.success('Deleted');
  }

  // ── Change detection ──────────────────────────────────────────

  const changes = useMemo(() => {
    const results: { item: RecurringTransaction; issue: string; severity: 'warning' | 'info' }[] = [];

    recurring.filter(r => r.is_active).forEach(item => {
      // Check for amount changes
      if (item.last_amount && item.expected_amount !== 0) {
        const diff = Math.abs(item.last_amount - Math.abs(item.expected_amount));
        const pct = (diff / Math.abs(item.expected_amount)) * 100;
        if (pct > 5) {
          results.push({
            item,
            issue: `Amount changed: expected ${formatCurrency(Math.abs(item.expected_amount))}, last was ${formatCurrency(item.last_amount)}`,
            severity: 'warning',
          });
        }
      }

      // Check for missed charges
      if (item.next_expected_date) {
        const next = parseISO(item.next_expected_date);
        const today = new Date();
        const overdueDays = differenceInDays(today, next);
        if (overdueDays > 7) {
          results.push({
            item,
            issue: `Possibly missed — expected ${format(next, 'MMM d')} (${overdueDays} days ago)`,
            severity: 'warning',
          });
        }
      }
    });

    return results;
  }, [recurring]);

  // ── Forecast upcoming ─────────────────────────────────────────

  const upcomingForecast = useMemo(() => {
    const today = new Date();
    const endDate = addMonths(today, 3);
    const upcoming: { date: string; name: string; amount: number; frequency: RecurringFrequency }[] = [];

    recurring.filter(r => r.is_active && r.next_expected_date).forEach(item => {
      let d = parseISO(item.next_expected_date!);
      let safety = 0;
      while (d <= endDate && safety < 52) {
        if (d >= today) {
          upcoming.push({
            date: format(d, 'yyyy-MM-dd'),
            name: item.name,
            amount: item.expected_amount,
            frequency: item.frequency,
          });
        }
        switch (item.frequency) {
          case 'weekly': d = addWeeks(d, 1); break;
          case 'biweekly': d = addWeeks(d, 2); break;
          case 'monthly': d = addMonths(d, 1); break;
          case 'quarterly': d = addMonths(d, 3); break;
          case 'yearly': d = addYears(d, 1); break;
        }
        safety++;
      }
    });

    upcoming.sort((a, b) => a.date.localeCompare(b.date));
    return upcoming;
  }, [recurring]);

  // ── Summary stats ─────────────────────────────────────────────

  const stats = useMemo(() => {
    const active = recurring.filter(r => r.is_active);
    const monthlyExpenses = active
      .filter(r => r.expected_amount > 0)
      .reduce((s, r) => s + getMonthlyEquivalent(r.expected_amount, r.frequency), 0);
    const monthlyIncome = active
      .filter(r => r.expected_amount < 0)
      .reduce((s, r) => s + getMonthlyEquivalent(Math.abs(r.expected_amount), r.frequency), 0);
    return { total: active.length, monthlyExpenses, monthlyIncome, alerts: changes.length };
  }, [recurring, changes]);

  if (authLoading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-pulse">Loading...</div></div>;
  if (!user) return <Navigate to="/auth" replace />;

  return (
    <>
      <PageHeader
        title="Recurring Transactions"
        description="Identify, manage, and forecast recurring charges and income"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={detectRecurring} disabled={detecting || loading}>
              <Sparkles className="w-4 h-4 mr-2" />
              {detecting ? 'Detecting...' : 'Auto-Detect'}
            </Button>
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Manual
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Add Recurring Transaction</DialogTitle>
                </DialogHeader>
                <form onSubmit={addManual} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input value={newItem.name} onChange={e => setNewItem({ ...newItem, name: e.target.value })} placeholder="e.g., Rent, Netflix" required />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Amount ($)</Label>
                      <Input type="number" step="0.01" value={newItem.expected_amount} onChange={e => setNewItem({ ...newItem, expected_amount: e.target.value })} placeholder="Positive=expense, negative=income" required />
                    </div>
                    <div className="space-y-2">
                      <Label>Frequency</Label>
                      <Select value={newItem.frequency} onValueChange={v => setNewItem({ ...newItem, frequency: v as RecurringFrequency })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(FREQUENCY_LABELS).map(([k, v]) => (
                            <SelectItem key={k} value={k}>{v}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Merchant (optional)</Label>
                      <Input value={newItem.merchant_name} onChange={e => setNewItem({ ...newItem, merchant_name: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Category (optional)</Label>
                      <Input value={newItem.category} onChange={e => setNewItem({ ...newItem, category: e.target.value })} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Notes (optional)</Label>
                    <Input value={newItem.notes} onChange={e => setNewItem({ ...newItem, notes: e.target.value })} />
                  </div>
                  <Button type="submit" className="w-full">Add Recurring Item</Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : (
        <div className="space-y-6">
          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="py-4 text-center">
                <p className="text-sm text-muted-foreground">Active Recurring</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4 text-center">
                <p className="text-sm text-muted-foreground">Monthly Expenses</p>
                <p className="text-2xl font-bold text-destructive">{formatCurrency(stats.monthlyExpenses)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4 text-center">
                <p className="text-sm text-muted-foreground">Monthly Income</p>
                <p className="text-2xl font-bold text-success">{formatCurrency(stats.monthlyIncome)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4 text-center">
                <p className="text-sm text-muted-foreground">Alerts</p>
                <p className={`text-2xl font-bold ${stats.alerts > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>{stats.alerts}</p>
              </CardContent>
            </Card>
          </div>

          {/* Alerts */}
          {changes.length > 0 && (
            <Card className="border-destructive/50 bg-destructive/5">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-destructive" />
                  Changes & Alerts
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {changes.map((c, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm p-2 rounded-lg bg-background">
                    <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
                    <span className="font-medium">{c.item.name}:</span>
                    <span className="text-muted-foreground">{c.issue}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Auto-detected patterns */}
          {showDetected && detectedPatterns.length > 0 && (
            <Card className="border-primary/50 bg-primary/5">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-primary" />
                    Detected Patterns ({detectedPatterns.length})
                  </CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => setShowDetected(false)}>
                    <EyeOff className="w-4 h-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Merchant</TableHead>
                      <TableHead className="text-right">Avg Amount</TableHead>
                      <TableHead>Frequency</TableHead>
                      <TableHead className="text-right">Occurrences</TableHead>
                      <TableHead className="text-right">Variance</TableHead>
                      <TableHead>Next Expected</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detectedPatterns.map((p, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{p.merchant}</TableCell>
                        <TableCell className="text-right">{formatCurrency(p.avgAmount)}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{FREQUENCY_LABELS[p.frequency]}</Badge>
                        </TableCell>
                        <TableCell className="text-right">{p.occurrences}×</TableCell>
                        <TableCell className="text-right text-muted-foreground">±{p.amountVariance}%</TableCell>
                        <TableCell>{format(parseISO(p.nextExpected), 'MMM d, yyyy')}</TableCell>
                        <TableCell>
                          <Button size="sm" variant="outline" onClick={() => confirmDetected(p)}>
                            <Plus className="w-3 h-3 mr-1" /> Add
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
          {showDetected && detectedPatterns.length === 0 && !detecting && (
            <Card className="border-primary/50 bg-primary/5">
              <CardContent className="py-6 text-center text-muted-foreground">
                No new recurring patterns detected. All known patterns are already tracked.
              </CardContent>
            </Card>
          )}

          {/* Main content tabs */}
          <Tabs defaultValue="managed">
            <TabsList>
              <TabsTrigger value="managed">Managed ({recurring.length})</TabsTrigger>
              <TabsTrigger value="upcoming">Upcoming ({upcomingForecast.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="managed">
              <Card>
                <CardContent className="pt-6">
                  {recurring.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No recurring transactions yet. Use <strong>Auto-Detect</strong> or <strong>Add Manual</strong> to get started.
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead>Frequency</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead>Last Seen</TableHead>
                          <TableHead>Next Expected</TableHead>
                          <TableHead className="text-right">Monthly Equiv.</TableHead>
                          <TableHead className="text-center">Active</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {recurring.map(item => {
                          const isExpense = item.expected_amount > 0;
                          return (
                            <TableRow key={item.id} className={!item.is_active ? 'opacity-50' : ''}>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">{item.name}</span>
                                  {item.is_auto_detected && (
                                    <Badge variant="outline" className="text-xs">auto</Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className={`text-right font-medium ${isExpense ? 'text-destructive' : 'text-success'}`}>
                                {isExpense ? '-' : '+'}{formatCurrency(Math.abs(item.expected_amount))}
                              </TableCell>
                              <TableCell>
                                <Badge variant="secondary">{FREQUENCY_LABELS[item.frequency]}</Badge>
                              </TableCell>
                              <TableCell className="text-muted-foreground">{item.category || '—'}</TableCell>
                              <TableCell className="text-muted-foreground">
                                {item.last_seen_date ? format(parseISO(item.last_seen_date), 'MMM d') : '—'}
                              </TableCell>
                              <TableCell>
                                {item.next_expected_date ? format(parseISO(item.next_expected_date), 'MMM d, yyyy') : '—'}
                              </TableCell>
                              <TableCell className="text-right text-muted-foreground">
                                {formatCurrency(getMonthlyEquivalent(Math.abs(item.expected_amount), item.frequency))}
                              </TableCell>
                              <TableCell className="text-center">
                                <Switch checked={item.is_active} onCheckedChange={() => toggleActive(item)} />
                              </TableCell>
                              <TableCell>
                                <Button variant="ghost" size="icon" onClick={() => deleteItem(item.id)} className="h-8 w-8 text-muted-foreground hover:text-destructive">
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="upcoming">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <CalendarCheck className="w-5 h-5" />
                    Next 3 Months
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {upcomingForecast.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No upcoming recurring transactions. Add some to see forecasts.
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Frequency</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {upcomingForecast.slice(0, 50).map((item, i) => {
                          const isExpense = item.amount > 0;
                          return (
                            <TableRow key={i}>
                              <TableCell>{format(parseISO(item.date), 'MMM d, yyyy')}</TableCell>
                              <TableCell className="font-medium">{item.name}</TableCell>
                              <TableCell>
                                <Badge variant="secondary">{FREQUENCY_LABELS[item.frequency]}</Badge>
                              </TableCell>
                              <TableCell className={`text-right font-medium ${isExpense ? 'text-destructive' : 'text-success'}`}>
                                {isExpense ? '-' : '+'}{formatCurrency(Math.abs(item.amount))}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </>
  );
}

export default function Recurring() {
  return (
    <AppLayout>
      <RecurringContent />
    </AppLayout>
  );
}
