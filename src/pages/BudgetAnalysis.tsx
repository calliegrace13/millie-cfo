import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOwnership } from '@/hooks/useOwnership';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency } from '@/lib/format';
import type { Account, Budget, Transaction } from '@/lib/types';
import { analyzeBudget } from '@/lib/budget-analysis';

export default function BudgetAnalysis() {
  const { user } = useAuth();
  const ownership = useOwnership();
  const [month, setMonth] = useState(() => `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`);
  const [period, setPeriod] = useState('monthly');
  const [scope, setScope] = useState('all');
  const [data, setData] = useState<{ transactions: Transaction[]; accounts: Account[]; budgets: Budget[] }>({ transactions: [], accounts: [], budgets: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!user || !/^\d{4}-\d{2}$/.test(month)) return;
    let active = true;
    async function load() {
      setLoading(true); setError('');
      try {
        const year = month.slice(0, 4);
        const start = period === 'yearly' ? year + '-01-01' : month + '-01';
        const end = period === 'yearly' ? year + '-12-31' : month + '-' + new Date(Number(year), Number(month.slice(5)), 0).getDate();
        const transactions: Transaction[] = [];
        for (let from = 0; ; from += 1000) {
          const res = await supabase.from('transactions').select('*').gte('date', start).lte('date', end).order('id').range(from, from + 999);
          if (res.error) throw res.error;
          transactions.push(...res.data as Transaction[]);
          if (res.data.length < 1000) break;
        }
        const [accounts, budgets] = await Promise.all([supabase.from('accounts').select('*'), supabase.from('budgets').select('*').eq('is_active', true)]);
        if (accounts.error) throw accounts.error;
        if (budgets.error) throw budgets.error;
        if (active) setData({ transactions, accounts: accounts.data as Account[], budgets: budgets.data as Budget[] });
      } catch { if (active) setError('Your budget analysis could not be loaded. Please try again.'); }
      finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, [user, month, period, reload]);
  const result = useMemo(() => analyzeBudget(data.transactions, data.accounts, data.budgets, period, scope, (t) => ownership.getTransactionMultiplier(t, data.accounts), ownership.isJointActive), [data, period, scope, ownership.getTransactionMultiplier, ownership.isJointActive]);
  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool: (tool: unknown, options: { signal: AbortSignal }) => unknown } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      Promise.resolve(context.registerTool({
        name: 'read_budget_analysis', title: 'Read budget analysis',
        description: 'Read the currently displayed budget-versus-actual report and selected period. Does not modify data.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute(input: unknown) {
          if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length) throw new Error('Expected an empty object.');
          if (loading || ownership.loading || error) throw new Error('The report is not available yet.');
          return { month, period, scope, ...result };
        },
      }, { signal: lifecycle.signal })).catch(() => {});
    } catch { /* Standard browser UI remains available without WebMCP. */ }
    return () => lifecycle.abort();
  }, [result, month, period, scope, loading, ownership.loading, error]);
  return <AppLayout>
    <PageHeader title="Budget vs. Actual" description="See where your spending differs from your plan." actions={<Button asChild variant="outline"><Link to="/manage-finances">Manage budgets</Link></Button>} />
    <div className="flex flex-wrap gap-4 mb-6 items-end">
      <div className="space-y-2"><Label htmlFor="budget-month">Reporting month</Label><Input id="budget-month" type="month" value={month} onChange={e => e.target.value && setMonth(e.target.value)} className="w-44" /></div>
      <div className="space-y-2"><Label>Period</Label><Select value={period} onValueChange={setPeriod}><SelectTrigger className="w-44" aria-label="Reporting period"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="monthly">Monthly</SelectItem><SelectItem value="yearly">Full year</SelectItem></SelectContent></Select></div>
      <div className="space-y-2"><Label>Budget scope</Label><Select value={scope} onValueChange={setScope}><SelectTrigger className="w-44" aria-label="Budget scope"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All accounts</SelectItem><SelectItem value="personal">Personal</SelectItem><SelectItem value="joint">Joint</SelectItem></SelectContent></Select></div>
    </div>
    <p className="text-sm text-muted-foreground mb-6">Posted spending by transaction date, net of refunds and excluding linked transfers. Ownership shares apply. Annual budgets are divided evenly across months; monthly budgets are multiplied by 12 for a full year. Only budgets matching the selected scope are compared.</p>
    {error ? <Card><CardContent className="py-8"><p role="alert">{error}</p><Button onClick={() => setReload(x => x + 1)} className="mt-4">Try again</Button></CardContent></Card> : loading || ownership.loading ? <p role="status">Loading budget analysis…</p> : <>
      <div className="grid gap-4 sm:grid-cols-3 mb-6">{[['Planned spending', result.planned], ['Actual spending', result.actual], ['Remaining budget', result.planned - result.actual]].map(([label, value]) => <Card key={label}><CardContent className="py-6"><p className="text-sm text-muted-foreground mb-2">{label}</p><p className="text-3xl font-semibold tabular-nums">{formatCurrency(Number(value))}</p></CardContent></Card>)}</div>
      {result.rows.length === 0 ? <Card><CardContent className="py-10 text-center"><h2 className="text-xl mb-2">No spending or budgets in this period</h2><p className="text-muted-foreground">Add transactions and category budgets in Manage Finances to start comparing.</p></CardContent></Card> : <Card><CardContent className="p-0 overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Category</TableHead><TableHead className="text-right">Budget</TableHead><TableHead className="text-right">Actual</TableHead><TableHead className="text-right">Remaining</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{result.rows.map(row => <TableRow key={row.category}><TableCell className="font-medium">{row.category}</TableCell><TableCell className="text-right tabular-nums">{row.budget === null ? 'Not set' : formatCurrency(row.budget)}</TableCell><TableCell className="text-right tabular-nums">{formatCurrency(row.actual)}</TableCell><TableCell className="text-right tabular-nums">{row.budget === null ? '—' : formatCurrency(row.budget - row.actual)}</TableCell><TableCell><span className={row.budget !== null && row.actual > row.budget ? 'text-red-700 dark:text-red-400' : 'text-muted-foreground'}>{row.budget === null ? 'Unbudgeted' : row.actual > row.budget ? 'Over budget' : row.actual === row.budget ? 'On budget' : 'Under budget'}</span></TableCell></TableRow>)}</TableBody></Table></CardContent></Card>}
      <p className="text-sm text-muted-foreground mt-4">Negative remaining amounts mean overspending. Unbudgeted categories are included in actual spending. Full-year actuals include only transactions recorded so far.</p>
    </>}
  </AppLayout>;
}
