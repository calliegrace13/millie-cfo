import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { formatCurrency, formatDate, getMonthsBetween } from '@/lib/format';
import { Plus, Trash2, Calendar, Zap, Settings2, X, ChevronDown, ChevronRight } from 'lucide-react';
import { AmortizationSchedule, AmortizationType, Transaction } from '@/lib/types';
import { toast } from 'sonner';
import { Navigate } from 'react-router-dom';

const TYPE_LABELS: Record<AmortizationType, string> = {
  prepaid_expense: 'Prepaid Expense',
  capital_expenditure: 'Capital Expenditure',
  intangible_asset: 'Intangible Asset',
  deferred_income: 'Deferred Income',
};

// Default categories to suggest for auto-amortization
const DEFAULT_AUTO_AMORTIZE_SUGGESTIONS = ['Healthcare', 'Travel', 'Shopping'];

export function AmortizationContent() {
  const { user, loading: authLoading } = useAuth();
  const [schedules, setSchedules] = useState<AmortizationSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [showAutoSchedules, setShowAutoSchedules] = useState(false);
  const [autoAmortizeCategories, setAutoAmortizeCategories] = useState<string[]>([]);
  const [allExpenseCategories, setAllExpenseCategories] = useState<string[]>([]);
  const [form, setForm] = useState({
    name: '',
    description: '',
    type: 'prepaid_expense' as AmortizationType,
    total_amount: '',
    start_date: '',
    end_date: '',
    category: '',
  });

  useEffect(() => {
    if (user) fetchData();
  }, [user]);

  async function fetchData() {
    setLoading(true);
    const [schedRes, autoRes, catRes, txCatRes] = await Promise.all([
      supabase.from('amortization_schedules').select('*').order('created_at', { ascending: false }),
      supabase.from('auto_amortize_categories').select('category_name'),
      supabase.from('transaction_categories').select('name'),
      supabase.from('transactions').select('category').gt('amount', 0).not('category', 'is', null),
    ]);

    if (schedRes.data) setSchedules(schedRes.data as AmortizationSchedule[]);
    if (autoRes.data) setAutoAmortizeCategories(autoRes.data.map((r: any) => r.category_name));

    // Build unique expense categories list
    const customCats = catRes.data?.map((c: any) => c.name) || [];
    const txCats = [...new Set((txCatRes.data || []).map((t: any) => t.category).filter(Boolean))];
    const allCats = [...new Set([...customCats, ...txCats, ...DEFAULT_AUTO_AMORTIZE_SUGGESTIONS])].sort();
    setAllExpenseCategories(allCats);
    setLoading(false);
  }

  async function createSchedule(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    const months = getMonthsBetween(new Date(form.start_date), new Date(form.end_date));
    const monthlyAmount = parseFloat(form.total_amount) / months;

    const { error } = await supabase.from('amortization_schedules').insert({
      user_id: user.id,
      name: form.name,
      description: form.description,
      type: form.type,
      total_amount: parseFloat(form.total_amount),
      start_date: form.start_date,
      end_date: form.end_date,
      monthly_amount: monthlyAmount,
      category: form.category,
    });

    if (error) {
      toast.error('Failed to create schedule');
    } else {
      toast.success('Amortization schedule created');
      setDialogOpen(false);
      setForm({ name: '', description: '', type: 'prepaid_expense', total_amount: '', start_date: '', end_date: '', category: '' });
      fetchData();
    }
  }

  async function deleteSchedule(id: string) {
    const { error } = await supabase.from('amortization_schedules').delete().eq('id', id);
    if (!error) {
      toast.success('Schedule deleted');
      fetchData();
    }
  }

  async function addAutoAmortizeCategory(cat: string) {
    if (!user) return;
    const { error } = await supabase.from('auto_amortize_categories').insert({ user_id: user.id, category_name: cat });
    if (error) { toast.error('Failed to add category'); return; }
    setAutoAmortizeCategories(prev => [...prev, cat]);

    // Also add to COGS categories if not already there
    const { data: existing } = await supabase.from('cogs_categories').select('id').eq('user_id', user.id).eq('category_name', cat).maybeSingle();
    if (!existing) {
      await supabase.from('cogs_categories').insert({ user_id: user.id, category_name: cat });
    }

    toast.success(`"${cat}" added to auto-amortize & COGS`);
  }

  async function removeAutoAmortizeCategory(cat: string) {
    if (!user) return;
    const { error } = await supabase.from('auto_amortize_categories').delete().eq('user_id', user.id).eq('category_name', cat);
    if (error) { toast.error('Failed to remove category'); return; }
    setAutoAmortizeCategories(prev => prev.filter(c => c !== cat));
    toast.success(`"${cat}" removed from auto-amortize`);
  }

  async function runAutoAmortize() {
    if (!user || autoAmortizeCategories.length === 0) return;
    setProcessing(true);

    try {
      // Fetch all non-amortized transactions in auto-amortize categories
      const PAGE_SIZE = 1000;
      const catsLower = new Set(autoAmortizeCategories.map(c => c.toLowerCase()));
      let allTx: Transaction[] = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data } = await supabase.from('transactions').select('*')
          .eq('user_id', user.id)
          .gte('amount', 50)
          .eq('is_amortized', false)
          .is('linked_transfer_id', null)
          .order('date', { ascending: true })
          .range(from, from + PAGE_SIZE - 1);
        const rows = (data ?? []) as Transaction[];
        allTx = allTx.concat(rows.filter(t => t.category && catsLower.has(t.category.toLowerCase())));
        if (rows.length < PAGE_SIZE) break;
      }

      // Get existing schedules to avoid duplicates
      const { data: existingSchedules } = await supabase.from('amortization_schedules').select('transaction_id');
      const existingTxIds = new Set((existingSchedules || []).map((s: any) => s.transaction_id).filter(Boolean));
      const toProcess = allTx.filter(t => !existingTxIds.has(t.id));

      if (toProcess.length === 0) {
        toast.info('No new transactions to auto-amortize');
        setProcessing(false);
        return;
      }

      // Build all schedules in memory, then batch insert
      const BATCH_SIZE = 200;
      const scheduleRows = toProcess.map(tx => {
        const txDate = new Date(tx.recognition_date || tx.date);
        const startDate = new Date(txDate.getFullYear(), txDate.getMonth(), 1);
        const endDate = new Date(txDate.getFullYear(), txDate.getMonth() + 12, 0);
        return {
          user_id: user.id,
          transaction_id: tx.id,
          name: `${tx.merchant_name || tx.name} (Auto)`,
          description: `Auto-amortized ${tx.category} expense`,
          type: 'prepaid_expense' as AmortizationType,
          total_amount: tx.amount,
          start_date: `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-01`,
          end_date: `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`,
          monthly_amount: tx.amount / 12,
          category: tx.category || undefined,
        };
      });

      let created = 0;
      for (let i = 0; i < scheduleRows.length; i += BATCH_SIZE) {
        const batch = scheduleRows.slice(i, i + BATCH_SIZE);
        const { error } = await supabase.from('amortization_schedules').insert(batch);
        if (!error) {
          const txIds = batch.map(s => s.transaction_id).filter(Boolean) as string[];
          await supabase.from('transactions').update({ is_amortized: true }).in('id', txIds);
          created += batch.length;
        }
      }

      toast.success(`Auto-amortized ${created} transaction${created !== 1 ? 's' : ''} over 12 months`);
      await ensureYearlyBudgets();
      fetchData();
    } catch (err) {
      console.error('Auto-amortize failed', err);
      toast.error('Auto-amortize failed');
    } finally {
      setProcessing(false);
    }
  }

  async function ensureYearlyBudgets() {
    if (!user || autoAmortizeCategories.length === 0) return;

    // Check existing budgets
    const { data: existingBudgets } = await supabase.from('budgets').select('category, period');
    const existingYearly = new Set(
      (existingBudgets || [])
        .filter((b: any) => b.period === 'yearly')
        .map((b: any) => b.category.toLowerCase())
    );

    const COLORS = ['#3b82f6', '#8b5cf6', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899'];

    // Get last 12 months of spending to calculate suggested limits
    const yearAgo = new Date();
    yearAgo.setFullYear(yearAgo.getFullYear() - 1);
    const yearAgoStr = `${yearAgo.getFullYear()}-${String(yearAgo.getMonth() + 1).padStart(2, '0')}-01`;

    const { data: yearTx } = await supabase.from('transactions').select('category, amount')
      .eq('user_id', user.id)
      .gt('amount', 0)
      .gte('date', yearAgoStr);

    let budgetsCreated = 0;
    for (const cat of autoAmortizeCategories) {
      if (existingYearly.has(cat.toLowerCase())) continue;

      // Also skip if a monthly budget exists for this category
      const hasExisting = (existingBudgets || []).some(
        (b: any) => b.category.toLowerCase() === cat.toLowerCase()
      );
      if (hasExisting) continue;

      // Calculate yearly spend
      const catSpend = (yearTx || [])
        .filter((t: any) => t.category?.toLowerCase() === cat.toLowerCase())
        .reduce((sum: number, t: any) => sum + t.amount, 0);

      // Set budget at 15% above actual spend, rounded to nearest $100, minimum $500
      const suggestedLimit = Math.max(500, Math.ceil((catSpend * 1.15) / 100) * 100);

      const { error } = await supabase.from('budgets').insert({
        user_id: user.id,
        category: cat,
        monthly_limit: suggestedLimit,
        period: 'yearly',
        color: COLORS[budgetsCreated % COLORS.length],
      });

      if (!error) budgetsCreated++;
    }

    if (budgetsCreated > 0) {
      toast.success(`Created ${budgetsCreated} yearly budget${budgetsCreated !== 1 ? 's' : ''}`);
    }
  }

  if (authLoading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-pulse">Loading...</div></div>;
  if (!user) return <Navigate to="/auth" replace />;

  const getCurrentMonthAmortization = () => {
    const now = new Date();
    return schedules
      .filter(s => s.is_active && new Date(s.start_date) <= now && new Date(s.end_date) >= now)
      .reduce((sum, s) => sum + s.monthly_amount, 0);
  };

  const autoSchedules = schedules.filter(s => s.description?.includes('Auto-amortized'));
  const manualSchedules = schedules.filter(s => !s.description?.includes('Auto-amortized'));

  return (
    <>
      <PageHeader
        title="Expense Amortization"
        description="Spread large expenses over time for accurate monthly costs"
        actions={
          <div className="flex gap-2">
            <Dialog open={configOpen} onOpenChange={setConfigOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Settings2 className="w-4 h-4 mr-2" />Auto-Amortize
                  {autoAmortizeCategories.length > 0 && (
                    <Badge variant="secondary" className="ml-2">{autoAmortizeCategories.length}</Badge>
                  )}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Auto-Amortize Categories</DialogTitle>
                </DialogHeader>
                <p className="text-sm text-muted-foreground mb-2">
                  Transactions in selected categories will be automatically amortized over 12 months and assigned yearly budgets.
                </p>
                {autoAmortizeCategories.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-4">
                    {autoAmortizeCategories.map(cat => (
                      <Badge key={cat} variant="default" className="gap-1 pr-1">
                        {cat}
                        <button onClick={() => removeAutoAmortizeCategory(cat)} className="ml-1 hover:bg-primary-foreground/20 rounded-full p-0.5">
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {allExpenseCategories
                    .filter(cat => !autoAmortizeCategories.some(c => c.toLowerCase() === cat.toLowerCase()))
                    .map(cat => (
                      <label key={cat} className="flex items-center gap-2 p-2 rounded hover:bg-muted cursor-pointer">
                        <Checkbox
                          checked={false}
                          onCheckedChange={() => addAutoAmortizeCategory(cat)}
                        />
                        <span className="text-sm">{cat}</span>
                      </label>
                    ))}
                </div>
                <Button onClick={runAutoAmortize} disabled={processing || autoAmortizeCategories.length === 0} className="w-full mt-4">
                  <Zap className="w-4 h-4 mr-2" />
                  {processing ? 'Processing...' : 'Run Auto-Amortize Now'}
                </Button>
              </DialogContent>
            </Dialog>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="w-4 h-4 mr-2" />New Schedule</Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>Create Amortization Schedule</DialogTitle></DialogHeader>
                <form onSubmit={createSchedule} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input placeholder="e.g., Annual Insurance Premium" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea placeholder="Optional notes..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as AmortizationType })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="prepaid_expense">Prepaid Expense</SelectItem>
                        <SelectItem value="capital_expenditure">Capital Expenditure</SelectItem>
                        <SelectItem value="intangible_asset">Intangible Asset</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Total Amount</Label>
                    <Input type="number" step="0.01" placeholder="1200.00" value={form.total_amount} onChange={(e) => setForm({ ...form, total_amount: e.target.value })} required />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Start Date</Label>
                      <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} required />
                    </div>
                    <div className="space-y-2">
                      <Label>End Date</Label>
                      <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} required />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Category (optional)</Label>
                    <Input placeholder="e.g., Insurance" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
                  </div>
                  <Button type="submit" className="w-full">Create Schedule</Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      <Card className="mb-6">
        <CardContent className="py-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">This Month's Amortized Expense</p>
              <p className="text-3xl font-bold">{formatCurrency(getCurrentMonthAmortization())}</p>
            </div>
            <Calendar className="w-10 h-10 text-primary opacity-50" />
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="animate-pulse text-muted-foreground">Loading schedules...</div>
      ) : schedules.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No amortization schedules. Create one to spread large expenses over time.</CardContent></Card>
      ) : (
        <div className="space-y-6">
          {manualSchedules.length > 0 && (
            <div>
              <div className="grid gap-4 md:grid-cols-2">
                {manualSchedules.map((schedule) => (
                  <ScheduleCard key={schedule.id} schedule={schedule} onDelete={deleteSchedule} />
                ))}
              </div>
            </div>
          )}
          {autoSchedules.length > 0 && (
            <div>
              <button
                onClick={() => setShowAutoSchedules(prev => !prev)}
                className="flex items-center gap-2 text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider hover:text-foreground transition-colors"
              >
                {showAutoSchedules ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                Auto-Amortized ({autoSchedules.length})
              </button>
              {showAutoSchedules && (
                <div className="grid gap-4 md:grid-cols-2">
                  {autoSchedules.map((schedule) => (
                    <ScheduleCard key={schedule.id} schedule={schedule} onDelete={deleteSchedule} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}

function ScheduleCard({ schedule, onDelete }: { schedule: AmortizationSchedule; onDelete: (id: string) => void }) {
  const now = new Date();
  const isActive = new Date(schedule.start_date) <= now && new Date(schedule.end_date) >= now;

  return (
    <Card className="group">
      <CardHeader className="flex flex-row items-start justify-between pb-2">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <CardTitle className="text-base">{schedule.name}</CardTitle>
            <Badge variant={isActive ? 'default' : 'secondary'}>
              {isActive ? 'Active' : 'Inactive'}
            </Badge>
          </div>
          <div className="flex gap-1">
            <Badge variant="outline">{TYPE_LABELS[schedule.type]}</Badge>
            {schedule.category && <Badge variant="outline">{schedule.category}</Badge>}
          </div>
        </div>
        <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100" onClick={() => onDelete(schedule.id)}>
          <Trash2 className="w-4 h-4 text-destructive" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Total Amount</p>
            <p className="font-medium">{formatCurrency(schedule.total_amount)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Monthly Amount</p>
            <p className="font-medium text-primary">{formatCurrency(schedule.monthly_amount)}</p>
          </div>
        </div>
        <div className="text-sm text-muted-foreground">
          {formatDate(schedule.start_date)} → {formatDate(schedule.end_date)}
        </div>
        {schedule.description && (
          <p className="text-sm text-muted-foreground">{schedule.description}</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function Amortization() {
  return (
    <AppLayout>
      <AmortizationContent />
    </AppLayout>
  );
}
