import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import { toast } from 'sonner';

type WatchlistItem = {
  id: string; ticker: string; name: string; target_price: number | null;
  notes: string | null; is_active: boolean;
};

export function Watchlist() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<WatchlistItem | null>(null);
  const [form, setForm] = useState({ ticker: '', name: '', target_price: '', notes: '' });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['watchlist_items'],
    queryFn: async () => {
      const { data } = await supabase.from('watchlist_items').select('*').eq('is_active', true).order('ticker');
      return (data || []) as WatchlistItem[];
    },
    enabled: !!user,
  });

  const upsert = useMutation({
    mutationFn: async () => {
      const payload = {
        user_id: user!.id, ticker: form.ticker, name: form.name,
        target_price: form.target_price ? parseFloat(form.target_price) : null,
        notes: form.notes || null,
      };
      if (editing) await supabase.from('watchlist_items').update(payload).eq('id', editing.id);
      else await supabase.from('watchlist_items').insert(payload);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['watchlist_items'] }); setOpen(false); toast.success('Saved'); },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => { await supabase.from('watchlist_items').delete().eq('id', id); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['watchlist_items'] }); toast.success('Removed'); },
  });

  const openAdd = () => { setEditing(null); setForm({ ticker: '', name: '', target_price: '', notes: '' }); setOpen(true); };
  const openEdit = (w: WatchlistItem) => {
    setEditing(w);
    setForm({ ticker: w.ticker, name: w.name, target_price: w.target_price?.toString() || '', notes: w.notes || '' });
    setOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{items.length} item{items.length !== 1 ? 's' : ''} on watchlist</p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" /> Add</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? 'Edit' : 'Add to'} Watchlist</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Ticker (e.g. AAPL)" value={form.ticker} onChange={e => setForm(f => ({ ...f, ticker: e.target.value.toUpperCase() }))} />
                <Input placeholder="Company name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <Input placeholder="Target price" type="number" value={form.target_price} onChange={e => setForm(f => ({ ...f, target_price: e.target.value }))} />
              <Input placeholder="Notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              <Button className="w-full" onClick={() => upsert.mutate()} disabled={!form.ticker || !form.name}>{editing ? 'Update' : 'Add'}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? <p className="text-muted-foreground text-sm">Loading...</p> : (
        <div className="space-y-2">
          {items.map(w => (
            <Card key={w.id}>
              <CardContent className="flex items-center justify-between py-3 px-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs font-mono">{w.ticker}</Badge>
                    <span className="font-medium text-sm">{w.name}</span>
                  </div>
                  {w.target_price && <p className="text-xs text-muted-foreground mt-1">Target: {formatCurrency(w.target_price)}</p>}
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(w)}><Pencil className="w-3.5 h-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => remove.mutate(w.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {items.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No watchlist items yet</p>}
        </div>
      )}
    </div>
  );
}

