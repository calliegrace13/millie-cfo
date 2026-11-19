import { useEffect, useState } from 'react';
import { logError } from '@/lib/logging';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOwnership } from '@/hooks/useOwnership';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { formatCurrency } from '@/lib/format';
import { Plus, Trash2, TrendingUp, TrendingDown, Calendar } from 'lucide-react';
import { Asset, Account } from '@/lib/types';
import { toast } from 'sonner';
import { Navigate } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, parseISO } from 'date-fns';

type BalanceSheetSnapshot = {
  id: string;
  snapshot_date: string;
  total_equity: number;
  total_assets: number;
  total_liabilities: number;
};

export function NetWorthContent() {
  const { user, loading: authLoading } = useAuth();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [snapshots, setSnapshots] = useState<BalanceSheetSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [form, setForm] = useState({
    name: '',
    type: 'other' as Asset['type'],
    value: '',
    is_liability: false,
    notes: '',
  });

  const { buildMultiplierMap } = useOwnership();

  useEffect(() => {
    if (user) fetchData();
  }, [user]);

  async function fetchData() {
    setLoading(true);

    try {
      const [assetRes, accRes, snapshotRes] = await Promise.all([
        supabase.from('assets').select('*').order('created_at', { ascending: false }),
        supabase.from('accounts').select('*').eq('is_deleted', false),
        supabase
          .from('balance_sheet_snapshots')
          .select('id, snapshot_date, total_equity, total_assets, total_liabilities')
          .order('snapshot_date', { ascending: true }),
      ]);

      if (assetRes.error) throw assetRes.error;
      if (accRes.error) throw accRes.error;
      if (snapshotRes.error) throw snapshotRes.error;

      if (assetRes.data) setAssets(assetRes.data as Asset[]);
      if (accRes.data) setAccounts(accRes.data as Account[]);

      if (snapshotRes.data && snapshotRes.data.length > 0) {
        setSnapshots(snapshotRes.data as BalanceSheetSnapshot[]);
        setStartDate(snapshotRes.data[0].snapshot_date);
      }
    } catch (err) {
      logError('NetWorth fetchData', err);
      toast.error('Failed to load net worth data');
    } finally {
      setLoading(false);
    }
  }


  async function createAsset(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    const { error } = await supabase.from('assets').insert({
      user_id: user.id,
      name: form.name,
      type: form.type,
      value: parseFloat(form.value),
      is_liability: form.is_liability,
      notes: form.notes,
    });

    if (error) {
      toast.error('Failed to add asset');
    } else {
      toast.success('Asset added');
      setDialogOpen(false);
      setForm({ name: '', type: 'other', value: '', is_liability: false, notes: '' });
      fetchData();
    }
  }

  async function deleteAsset(id: string) {
    const { error } = await supabase.from('assets').delete().eq('id', id);
    if (!error) {
      toast.success('Asset removed');
      fetchData();
    }
  }

  if (authLoading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-pulse">Loading...</div></div>;
  if (!user) return <Navigate to="/auth" replace />;

  const multiplierMap = buildMultiplierMap(accounts);
  const scaleBalance = (acc: Account) => (acc.current_balance || 0) * (multiplierMap[acc.id] ?? 1);

  // Calculate totals from accounts (scaled by ownership)
  const accountAssets = accounts
    .filter(a => a.type !== 'credit' && a.type !== 'loan')
    .reduce((sum, a) => sum + scaleBalance(a), 0);
  
  const accountLiabilities = accounts
    .filter(a => a.type === 'credit' || a.type === 'loan')
    .reduce((sum, a) => sum + Math.abs(scaleBalance(a)), 0);

  // Manual assets are always 100% yours
  const manualAssets = assets.filter(a => !a.is_liability).reduce((sum, a) => sum + a.value, 0);
  const manualLiabilities = assets.filter(a => a.is_liability).reduce((sum, a) => sum + a.value, 0);

  const totalAssets = accountAssets + manualAssets;
  const totalLiabilities = accountLiabilities + manualLiabilities;
  const netWorth = totalAssets - totalLiabilities;

  const hasHistoricalData = snapshots.length > 0;
  const earliestDate = snapshots.length > 0 ? snapshots[0].snapshot_date : null;

  // Build chart data from actual snapshots only
  let chartData: { date: string; netWorth: number; assets: number; liabilities: number }[] = [];

  if (hasHistoricalData) {
    const filteredSnapshots = snapshots.filter(s => {
      const date = s.snapshot_date;
      return (!startDate || date >= startDate) && (!endDate || date <= endDate);
    });

    chartData = filteredSnapshots.map(s => ({
      date: format(parseISO(s.snapshot_date), 'MMM d, yyyy'),
      netWorth: s.total_equity,
      assets: s.total_assets,
      liabilities: s.total_liabilities,
    }));

    // Add current values as the last point
    const today = format(new Date(), 'yyyy-MM-dd');
    const lastSnapshotDate = filteredSnapshots.length > 0 ? filteredSnapshots[filteredSnapshots.length - 1]?.snapshot_date : null;
    if (endDate >= today && lastSnapshotDate !== today) {
      chartData.push({
        date: 'Today',
        netWorth: netWorth,
        assets: totalAssets,
        liabilities: totalLiabilities,
      });
    }
  }

  // Show chart if we have current data
  const hasCurrentData = totalAssets > 0 || totalLiabilities > 0;

  return (
    <>
      <PageHeader
        title="Net Worth"
        description="Track your total assets minus liabilities"
        actions={
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="w-4 h-4 mr-2" />Add Asset</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Asset or Liability</DialogTitle></DialogHeader>
              <form onSubmit={createAsset} className="space-y-4">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input placeholder="e.g., Primary Home" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as Asset['type'] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="property">Property</SelectItem>
                      <SelectItem value="vehicle">Vehicle</SelectItem>
                      <SelectItem value="investment">Investment</SelectItem>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Value</Label>
                  <Input type="number" step="0.01" placeholder="100000.00" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} required />
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox checked={form.is_liability} onCheckedChange={(c) => setForm({ ...form, is_liability: !!c })} />
                  <Label className="cursor-pointer">This is a liability (debt/mortgage)</Label>
                </div>
                <Button type="submit" className="w-full">Add</Button>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      {loading ? (
        <div className="animate-pulse text-muted-foreground">Loading net worth...</div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid gap-4 md:grid-cols-3 mb-8">
            <Card>
              <CardContent className="py-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-success/10 flex items-center justify-center">
                    <TrendingUp className="w-6 h-6 text-success" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Assets</p>
                    <p className="text-2xl font-bold">{formatCurrency(totalAssets)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-destructive/10 flex items-center justify-center">
                    <TrendingDown className="w-6 h-6 text-destructive" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Liabilities</p>
                    <p className="text-2xl font-bold">{formatCurrency(totalLiabilities)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-primary text-primary-foreground">
              <CardContent className="py-6">
                <div>
                  <p className="text-sm opacity-80">Net Worth</p>
                  <p className="text-3xl font-bold">{formatCurrency(netWorth)}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Chart with Date Range */}
          <Card className="mb-8">
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <CardTitle>Net Worth Trend</CardTitle>
                <div className="flex items-center gap-2 flex-wrap">
                  {hasHistoricalData && (
                    <>
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <Input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-[140px] h-8 text-sm"
                        min={earliestDate || undefined}
                        max={endDate}
                      />
                      <span className="text-muted-foreground">to</span>
                      <Input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-[140px] h-8 text-sm"
                        min={startDate}
                        max={format(new Date(), 'yyyy-MM-dd')}
                      />
                    </>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {!hasHistoricalData ? (
                <div className="h-64 flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p className="mb-2">No historical data yet.</p>
                    <p className="text-sm">Snapshots save automatically at month-end from the Balance Sheet page.</p>
                  </div>
                </div>
              ) : chartData.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-muted-foreground">
                  <p>No data in selected date range.</p>
                </div>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                      <YAxis stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                      <Tooltip 
                        formatter={(value: number, name: string) => [formatCurrency(value), name === 'netWorth' ? 'Net Worth' : name === 'assets' ? 'Assets' : 'Liabilities']}
                        contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                      />
                      <Line type="monotone" dataKey="netWorth" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ fill: 'hsl(var(--primary))' }} name="netWorth" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
              {hasHistoricalData && earliestDate && (
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  Historical data from {format(parseISO(earliestDate), 'MMMM d, yyyy')} ({snapshots.length} snapshots)
                </p>
              )}
            </CardContent>
          </Card>

          {/* Asset/Liability List */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Assets</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Account-based assets */}
                {accounts.filter(a => a.type !== 'credit' && a.type !== 'loan').map(acc => (
                  <div key={acc.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50">
                    <div>
                      <p className="font-medium">{acc.name}</p>
                      <p className="text-sm text-muted-foreground capitalize">
                        {acc.type} Account
                        {acc.is_joint && ` · ${multiplierMap[acc.id] * 100}% yours`}
                      </p>
                    </div>
                    <span className="font-mono font-medium">{formatCurrency(scaleBalance(acc))}</span>
                  </div>
                ))}
                {/* Manual assets */}
                {assets.filter(a => !a.is_liability).map(asset => (
                  <div key={asset.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50 group">
                    <div>
                      <p className="font-medium">{asset.name}</p>
                      <p className="text-sm text-muted-foreground capitalize">{asset.type}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-medium">{formatCurrency(asset.value)}</span>
                      <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 h-8 w-8" onClick={() => deleteAsset(asset.id)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Liabilities</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Account-based liabilities */}
                {accounts.filter(a => a.type === 'credit' || a.type === 'loan').map(acc => (
                  <div key={acc.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-destructive/5">
                    <div>
                      <p className="font-medium">{acc.name}</p>
                      <p className="text-sm text-muted-foreground capitalize">
                        {acc.type}
                        {acc.is_joint && ` · ${multiplierMap[acc.id] * 100}% yours`}
                      </p>
                    </div>
                    <span className="font-mono font-medium text-destructive">-{formatCurrency(Math.abs(scaleBalance(acc)))}</span>
                  </div>
                ))}
                {/* Manual liabilities */}
                {assets.filter(a => a.is_liability).map(asset => (
                  <div key={asset.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-destructive/5 group">
                    <div>
                      <p className="font-medium">{asset.name}</p>
                      <p className="text-sm text-muted-foreground capitalize">{asset.type}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-medium text-destructive">-{formatCurrency(asset.value)}</span>
                      <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 h-8 w-8" onClick={() => deleteAsset(asset.id)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
                {accounts.filter(a => a.type === 'credit' || a.type === 'loan').length === 0 && assets.filter(a => a.is_liability).length === 0 && (
                  <p className="text-muted-foreground text-center py-4">No liabilities recorded</p>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </>
  );
}

export default function NetWorth() {
  return (
    <AppLayout>
      <NetWorthContent />
    </AppLayout>
  );
}

