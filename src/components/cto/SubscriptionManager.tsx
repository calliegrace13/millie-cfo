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
import { format, parseISO, differenceInDays } from 'date-fns';
import { toast } from 'sonner';

const CATEGORIES = ['streaming', 'software', 'cloud', 'gaming', 'news', 'other'];
const CYCLES = ['monthly', 'yearly', 'weekly', 'quarterly'];

type Subscription = {
  id: string; name: string; cost: number; billing_cycle: string;
  category: string; url: string | null; next_billing_date: string | null;
  is_active: boolean; notes: string | null;
};

export function SubscriptionManager() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Subscription | null>(null);
  const [form, setForm] = useState({ name: '', cost: '', billing_cycle: 'monthly', category: 'other', url: '', next_billing_date: '', notes: '' });

  const { data: subs = [], isLoading } = useQuery({
    queryKey: ['digital_subscriptions'],
    queryFn: async () => {
      const { data } = await supabase.from('digital_subscriptions').select('*').order('name');
      return (data || []) as Subscription[];
    },
    enabled: !!user,
  });

  const upsert = useMutation({
    mutationFn: async () => {
      const payload = {
        user_id: user!.id,
        name: form.name,
        cost: parseFloat(form.cost) || 0,
        billing_cycle: form.billing_cycle,
        category: form.category,
        url: form.url || null,
        next_billing_date: form.next_billing_date || null,
        notes: form.notes || null,
      };
      if (editing) {
        await supabase.from('digital_subscriptions').update(payload).eq('id', editing.id);
      } else {
        await supabase.from('digital_subscriptions').insert(payload);
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['digital_subscriptions'] }); setOpen(false); toast.success('Saved'); },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => { await supabase.from('digital_subscriptions').delete().eq('id', id); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['digital_subscriptions'] }); toast.success('Deleted'); },
  });

  const openAdd = () => { setEditing(null); setForm({ name: '', cost: '', billing_cycle: 'monthly', category: 'other', url: '', next_billing_date: '', notes: '' }); setOpen(true); };
  const openEdit = (s: Subscription) => {
    setEditing(s);
    setForm({ name: s.name, cost: s.cost.toString(), billing_cycle: s.billing_cycle, category: s.category, url: s.url || '', next_billing_date: s.next_billing_date || '', notes: s.notes || '' });
    setOpen(true);
  };

  const activeSubs = subs.filter(s => s.is_active);
  const monthlyCost = activeSubs.reduce((sum, s) => {
    if (s.billing_cycle === 'yearly') return sum + s.cost / 12;
    if (s.billing_cycle === 'quarterly') return sum + s.cost / 3;
    if (s.billing_cycle === 'weekly') return sum + s.cost * 4.33;
    return sum + s.cost;
  }, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Monthly Cost</p>
          <p className="text-2xl font-bold">{formatCurrency(monthlyCost)}</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" /> Add</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? 'Edit' : 'Add'} Subscription</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Input placeholder="Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              <Input placeholder="Cost" type="number" step="0.01" value={form.cost} onChange={e => setForm(f => ({ ...f, cost: e.target.value }))} />
              <div className="grid grid-cols-2 gap-2">
                <Select value={form.billing_cycle} onValueChange={v => setForm(f => ({ ...f, billing_cycle: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CYCLES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Input placeholder="URL" value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} />
              <Input type="date" value={form.next_billing_date} onChange={e => setForm(f => ({ ...f, next_billing_date: e.target.value }))} />
              <Input placeholder="Notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              <Button className="w-full" onClick={() => upsert.mutate()} disabled={!form.name}>{editing ? 'Update' : 'Add'}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? <p className="text-muted-foreground text-sm">Loading...</p> : (
        <div className="space-y-2">
          {subs.map(s => (
            <Card key={s.id}>
              <CardContent className="flex items-center justify-between py-3 px-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{s.name}</span>
                    <Badge variant="secondary" className="text-xs">{s.category}</Badge>
                    {!s.is_active && <Badge variant="outline" className="text-xs">Inactive</Badge>}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                    <span>{formatCurrency(s.cost)}/{s.billing_cycle}</span>
                    {s.next_billing_date && <span>Next: {format(parseISO(s.next_billing_date), 'MMM d')}</span>}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(s)}><Pencil className="w-3.5 h-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => remove.mutate(s.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {subs.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No subscriptions yet</p>}
        </div>
      )}
    </div>
  );
}

