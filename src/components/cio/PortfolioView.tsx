import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { toast } from 'sonner';

const ASSET_CLASSES = ['stocks', 'bonds', 'crypto', 'real_estate', 'cash', 'other'];
const COLORS = ['hsl(220, 55%, 50%)', 'hsl(140, 45%, 45%)', 'hsl(35, 65%, 50%)', 'hsl(330, 50%, 50%)', 'hsl(200, 40%, 55%)', 'hsl(270, 40%, 55%)'];

type Holding = {
  id: string; name: string; ticker: string | null; asset_class: string;
  quantity: number; cost_basis: number; current_value: number;
  account_id: string | null; notes: string | null;
};

export function PortfolioView() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Holding | null>(null);
  const [form, setForm] = useState({ name: '', ticker: '', asset_class: 'stocks', quantity: '', cost_basis: '', current_value: '', notes: '' });

  const { data: holdings = [], isLoading } = useQuery({
    queryKey: ['investment_holdings'],
    queryFn: async () => {
      const { data } = await supabase.from('investment_holdings').select('*').order('current_value', { ascending: false });
      return (data || []) as Holding[];
    },
    enabled: !!user,
  });

  const upsert = useMutation({
    mutationFn: async () => {
      const payload = {
        user_id: user!.id, name: form.name, ticker: form.ticker || null,
        asset_class: form.asset_class, quantity: parseFloat(form.quantity) || 0,
        cost_basis: parseFloat(form.cost_basis) || 0, current_value: parseFloat(form.current_value) || 0,
        notes: form.notes || null,
      };
      if (editing) await supabase.from('investment_holdings').update(payload).eq('id', editing.id);
      else await supabase.from('investment_holdings').insert(payload);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['investment_holdings'] }); setOpen(false); toast.success('Saved'); },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => { await supabase.from('investment_holdings').delete().eq('id', id); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['investment_holdings'] }); toast.success('Deleted'); },
  });

  const openAdd = () => { setEditing(null); setForm({ name: '', ticker: '', asset_class: 'stocks', quantity: '', cost_basis: '', current_value: '', notes: '' }); setOpen(true); };
  const openEdit = (h: Holding) => {
    setEditing(h);
    setForm({ name: h.name, ticker: h.ticker || '', asset_class: h.asset_class, quantity: h.quantity.toString(), cost_basis: h.cost_basis.toString(), current_value: h.current_value.toString(), notes: h.notes || '' });
    setOpen(true);
  };

  const totalValue = holdings.reduce((s, h) => s + h.current_value, 0);
  const totalCost = holdings.reduce((s, h) => s + h.cost_basis, 0);
  const totalGain = totalValue - totalCost;

  const allocationData = ASSET_CLASSES.map(ac => ({
    name: ac, value: holdings.filter(h => h.asset_class === ac).reduce((s, h) => s + h.current_value, 0),
  })).filter(d => d.value > 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Total Value</p><p className="text-xl font-bold">{formatCurrency(totalValue)}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Total Cost Basis</p><p className="text-xl font-bold">{formatCurrency(totalCost)}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Total Gain/Loss</p><p className={`text-xl font-bold ${totalGain >= 0 ? 'text-success' : 'text-destructive'}`}>{formatCurrency(totalGain)}</p></CardContent></Card>
      </div>

      {allocationData.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Allocation</CardTitle></CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={allocationData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {allocationData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{holdings.length} holding{holdings.length !== 1 ? 's' : ''}</p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" /> Add</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? 'Edit' : 'Add'} Holding</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Input placeholder="Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Ticker" value={form.ticker} onChange={e => setForm(f => ({ ...f, ticker: e.target.value }))} />
                <Select value={form.asset_class} onValueChange={v => setForm(f => ({ ...f, asset_class: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ASSET_CLASSES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Input placeholder="Quantity" type="number" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} />
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Cost basis" type="number" value={form.cost_basis} onChange={e => setForm(f => ({ ...f, cost_basis: e.target.value }))} />
                <Input placeholder="Current value" type="number" value={form.current_value} onChange={e => setForm(f => ({ ...f, current_value: e.target.value }))} />
              </div>
              <Input placeholder="Notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              <Button className="w-full" onClick={() => upsert.mutate()} disabled={!form.name}>{editing ? 'Update' : 'Add'}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? <p className="text-muted-foreground text-sm">Loading...</p> : (
        <div className="space-y-2">
          {holdings.map(h => {
            const gain = h.current_value - h.cost_basis;
            return (
              <Card key={h.id}>
                <CardContent className="flex items-center justify-between py-3 px-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{h.name}</span>
                      {h.ticker && <Badge variant="outline" className="text-xs">{h.ticker}</Badge>}
                      <Badge variant="secondary" className="text-xs">{h.asset_class}</Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                      <span>{formatCurrency(h.current_value)}</span>
                      <span className={gain >= 0 ? 'text-success' : 'text-destructive'}>{gain >= 0 ? '+' : ''}{formatCurrency(gain)}</span>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(h)}><Pencil className="w-3.5 h-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => remove.mutate(h.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {holdings.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No holdings yet</p>}
        </div>
      )}
    </div>
  );
}
