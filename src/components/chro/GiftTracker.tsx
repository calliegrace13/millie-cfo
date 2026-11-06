import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Gift, Trash2, DollarSign, ArrowUpRight, ArrowDownLeft, Link2, Unlink } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const STATUS_OPTIONS = [
  { value: 'idea', label: '💡 Idea' },
  { value: 'purchased', label: '🛍️ Purchased' },
  { value: 'given', label: '🎁 Given' },
  { value: 'received', label: '📦 Received' },
];

const OCCASION_OPTIONS = ['Birthday', 'Christmas', 'Anniversary', 'Valentine\'s Day', 'Housewarming', 'Thank You', 'Just Because', 'Other'];

export function GiftTracker() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({
    description: '', occasion: '', amount: '', direction: 'given', status: 'idea',
    contact_id: '', gift_date: format(new Date(), 'yyyy-MM-dd'), notes: '',
  });
  const [linkingGiftId, setLinkingGiftId] = useState<string | null>(null);
  const [txSearch, setTxSearch] = useState('');

  const { data: gifts = [], isLoading } = useQuery({
    queryKey: ['chro-gifts', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('gifts')
        .select('*, contacts(display_name), transactions(id, name, amount, date)')
        .order('gift_date', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ['chro-contacts-for-gifts', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('contacts').select('id, display_name').order('display_name');
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const addGift = useMutation({
    mutationFn: async () => {
      if (!user) return;
      const { error } = await supabase.from('gifts').insert({
        user_id: user.id,
        description: form.description,
        occasion: form.occasion || null,
        amount: form.amount ? parseFloat(form.amount) : null,
        direction: form.direction,
        status: form.status,
        contact_id: form.contact_id || null,
        gift_date: form.gift_date,
        notes: form.notes || null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chro-gifts'] });
      setAddOpen(false);
      setForm({ description: '', occasion: '', amount: '', direction: 'given', status: 'idea', contact_id: '', gift_date: format(new Date(), 'yyyy-MM-dd'), notes: '' });
      toast({ title: 'Gift added!' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const deleteGift = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('gifts').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chro-gifts'] });
      toast({ title: 'Gift deleted' });
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from('gifts').update({ status } as any).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['chro-gifts'] }),
  });

  const { data: searchTxns = [] } = useQuery({
    queryKey: ['gift-tx-search', txSearch],
    queryFn: async () => {
      if (!txSearch || txSearch.length < 2) return [];
      const { data, error } = await supabase
        .from('transactions')
        .select('id, name, merchant_name, amount, date')
        .or(`name.ilike.%${txSearch}%,merchant_name.ilike.%${txSearch}%`)
        .order('date', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
    enabled: !!txSearch && txSearch.length >= 2,
  });

  const linkTransaction = useMutation({
    mutationFn: async ({ giftId, transactionId }: { giftId: string; transactionId: string | null }) => {
      const { error } = await supabase.from('gifts').update({ transaction_id: transactionId } as any).eq('id', giftId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chro-gifts'] });
      setLinkingGiftId(null);
      setTxSearch('');
      toast({ title: 'Transaction linked!' });
    },
  });

  const totalSpent = gifts.filter(g => g.direction === 'given' && g.amount).reduce((s, g) => s + (g.amount || 0), 0);
  const ideas = gifts.filter(g => g.status === 'idea');
  const completed = gifts.filter(g => g.status === 'given' || g.status === 'received');

  if (isLoading) return <p className="text-muted-foreground text-sm py-4">Loading gifts...</p>;

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="py-3 px-4 text-center">
          <p className="text-xs text-muted-foreground">Ideas</p>
          <p className="text-lg font-semibold text-foreground">{ideas.length}</p>
        </CardContent></Card>
        <Card><CardContent className="py-3 px-4 text-center">
          <p className="text-xs text-muted-foreground">Given/Received</p>
          <p className="text-lg font-semibold text-foreground">{completed.length}</p>
        </CardContent></Card>
        <Card><CardContent className="py-3 px-4 text-center">
          <p className="text-xs text-muted-foreground">Total Spent</p>
          <p className="text-lg font-semibold text-foreground">${totalSpent.toFixed(0)}</p>
        </CardContent></Card>
      </div>

      {/* Add button */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogTrigger asChild>
          <Button size="sm"><Plus className="w-4 h-4 mr-1" /> Add Gift</Button>
        </DialogTrigger>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New Gift</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Gift description *" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            <Select value={form.contact_id} onValueChange={v => setForm(f => ({ ...f, contact_id: v }))}>
              <SelectTrigger><SelectValue placeholder="For whom? (optional)" /></SelectTrigger>
              <SelectContent>
                {contacts.map(c => <SelectItem key={c.id} value={c.id}>{c.display_name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={form.occasion} onValueChange={v => setForm(f => ({ ...f, occasion: v }))}>
              <SelectTrigger><SelectValue placeholder="Occasion (optional)" /></SelectTrigger>
              <SelectContent>
                {OCCASION_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="grid grid-cols-2 gap-3">
              <Input type="number" placeholder="Amount ($)" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
              <Input type="date" value={form.gift_date} onChange={e => setForm(f => ({ ...f, gift_date: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Select value={form.direction} onValueChange={v => setForm(f => ({ ...f, direction: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="given">Giving</SelectItem>
                  <SelectItem value="received">Receiving</SelectItem>
                </SelectContent>
              </Select>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Textarea placeholder="Notes (optional)" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
            <Button onClick={() => addGift.mutate()} disabled={!form.description} className="w-full">Save Gift</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Gift list */}
      {gifts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Gift className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-50" />
            <p className="text-muted-foreground text-sm">No gifts tracked yet. Add gift ideas or log gifts you've given and received.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {gifts.map(gift => (
            <Card key={gift.id} className="group">
              <CardContent className="py-3 px-4">
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${gift.direction === 'given' ? 'bg-primary/10' : 'bg-accent/15'}`}>
                    {gift.direction === 'given' ? <ArrowUpRight className="w-4 h-4 text-primary" /> : <ArrowDownLeft className="w-4 h-4 text-accent" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground">{gift.description}</span>
                      <Select value={gift.status} onValueChange={v => updateStatus.mutate({ id: gift.id, status: v })}>
                        <SelectTrigger className="h-6 w-auto text-[10px] border-none px-2">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                      {(gift as any).contacts?.display_name && (
                        <span className="text-xs text-muted-foreground">→ {(gift as any).contacts.display_name}</span>
                      )}
                      {gift.occasion && <Badge variant="outline" className="text-[10px]">{gift.occasion}</Badge>}
                      {gift.amount && (
                        <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                          <DollarSign className="w-3 h-3" />{gift.amount}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">{format(new Date(gift.gift_date), 'MMM d, yyyy')}</span>
                    </div>
                    {(gift as any).transactions && (
                      <div className="flex items-center gap-1 mt-1">
                        <Link2 className="w-3 h-3 text-primary" />
                        <span className="text-xs text-primary">{(gift as any).transactions.name} · ${Math.abs((gift as any).transactions.amount).toFixed(2)}</span>
                        <button onClick={() => linkTransaction.mutate({ giftId: gift.id, transactionId: null })} className="ml-1">
                          <Unlink className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                        </button>
                      </div>
                    )}
                    {gift.notes && <p className="text-xs text-muted-foreground mt-1">{gift.notes}</p>}
                  </div>
                  <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Popover open={linkingGiftId === gift.id} onOpenChange={o => { if (!o) { setLinkingGiftId(null); setTxSearch(''); } }}>
                      <PopoverTrigger asChild>
                        <button onClick={() => setLinkingGiftId(gift.id)} title="Link transaction">
                          <Link2 className="w-4 h-4 text-muted-foreground" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-72 p-3" align="end">
                        <p className="text-xs font-medium mb-2">Link a transaction</p>
                        <Input placeholder="Search transactions..." value={txSearch} onChange={e => setTxSearch(e.target.value)} className="h-8 text-xs mb-2" />
                        <div className="max-h-40 overflow-y-auto space-y-1">
                          {searchTxns.map(tx => (
                            <button key={tx.id} onClick={() => linkTransaction.mutate({ giftId: gift.id, transactionId: tx.id })}
                              className="w-full text-left p-1.5 rounded hover:bg-muted text-xs">
                              <span className="font-medium">{tx.merchant_name || tx.name}</span>
                              <span className="text-muted-foreground ml-1">${Math.abs(tx.amount).toFixed(2)} · {format(new Date(tx.date), 'MMM d')}</span>
                            </button>
                          ))}
                          {txSearch.length >= 2 && searchTxns.length === 0 && <p className="text-xs text-muted-foreground py-2">No results</p>}
                        </div>
                      </PopoverContent>
                    </Popover>
                    <button onClick={() => deleteGift.mutate(gift.id)} title="Delete">
                      <Trash2 className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
