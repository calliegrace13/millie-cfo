import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { format, parseISO, isPast, isToday } from 'date-fns';
import { toast } from 'sonner';

const STATUSES = ['new', 'followed_up', 'connected'];
const statusColors: Record<string, string> = {
  new: 'bg-primary/10 text-primary',
  followed_up: 'bg-accent/10 text-accent-foreground',
  connected: 'bg-success/10 text-success',
};

type Contact = {
  id: string; contact_name: string; company: string | null; met_at: string | null;
  meeting_date: string; follow_up_date: string | null; notes: string | null; status: string;
};

export function NetworkingLog() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [form, setForm] = useState({ contact_name: '', company: '', met_at: '', meeting_date: '', follow_up_date: '', notes: '', status: 'new' });

  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ['networking_log'],
    queryFn: async () => {
      const { data } = await supabase.from('networking_log').select('*').order('meeting_date', { ascending: false });
      return (data || []) as Contact[];
    },
    enabled: !!user,
  });

  const upsert = useMutation({
    mutationFn: async () => {
      const payload = {
        user_id: user!.id, contact_name: form.contact_name, company: form.company || null,
        met_at: form.met_at || null, meeting_date: form.meeting_date || format(new Date(), 'yyyy-MM-dd'),
        follow_up_date: form.follow_up_date || null, notes: form.notes || null, status: form.status,
      };
      if (editing) await supabase.from('networking_log').update(payload).eq('id', editing.id);
      else await supabase.from('networking_log').insert(payload);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['networking_log'] }); setOpen(false); toast.success('Saved'); },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => { await supabase.from('networking_log').delete().eq('id', id); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['networking_log'] }); toast.success('Deleted'); },
  });

  const openAdd = () => { setEditing(null); setForm({ contact_name: '', company: '', met_at: '', meeting_date: format(new Date(), 'yyyy-MM-dd'), follow_up_date: '', notes: '', status: 'new' }); setOpen(true); };
  const openEdit = (c: Contact) => {
    setEditing(c);
    setForm({ contact_name: c.contact_name, company: c.company || '', met_at: c.met_at || '', meeting_date: c.meeting_date, follow_up_date: c.follow_up_date || '', notes: c.notes || '', status: c.status });
    setOpen(true);
  };

  const needsFollowUp = contacts.filter(c => c.follow_up_date && (isPast(parseISO(c.follow_up_date)) || isToday(parseISO(c.follow_up_date))) && c.status !== 'connected');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{contacts.length} contact{contacts.length !== 1 ? 's' : ''}</p>
          {needsFollowUp.length > 0 && <p className="text-xs text-destructive">{needsFollowUp.length} need follow-up</p>}
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" /> Add</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? 'Edit' : 'Log'} Contact</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Input placeholder="Contact name" value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} />
              <Input placeholder="Company" value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} />
              <Input placeholder="Where you met" value={form.met_at} onChange={e => setForm(f => ({ ...f, met_at: e.target.value }))} />
              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-xs text-muted-foreground">Meeting Date</label><Input type="date" value={form.meeting_date} onChange={e => setForm(f => ({ ...f, meeting_date: e.target.value }))} /></div>
                <div><label className="text-xs text-muted-foreground">Follow-up Date</label><Input type="date" value={form.follow_up_date} onChange={e => setForm(f => ({ ...f, follow_up_date: e.target.value }))} /></div>
              </div>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s.replace('_', ' ')}</SelectItem>)}</SelectContent>
              </Select>
              <Input placeholder="Notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              <Button className="w-full" onClick={() => upsert.mutate()} disabled={!form.contact_name}>{editing ? 'Update' : 'Log'}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? <p className="text-muted-foreground text-sm">Loading...</p> : (
        <div className="space-y-2">
          {contacts.map(c => {
            const overdue = c.follow_up_date && isPast(parseISO(c.follow_up_date)) && c.status !== 'connected';
            return (
              <Card key={c.id} className={overdue ? 'border-destructive/50' : ''}>
                <CardContent className="flex items-center justify-between py-3 px-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{c.contact_name}</span>
                      <Badge className={`text-xs ${statusColors[c.status] || ''}`}>{c.status.replace('_', ' ')}</Badge>
                      {overdue && <Badge variant="destructive" className="text-xs">Follow up!</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {c.company && `${c.company} • `}{c.met_at && `Met at ${c.met_at} • `}{format(parseISO(c.meeting_date), 'MMM d, yyyy')}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(c)}><Pencil className="w-3.5 h-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => remove.mutate(c.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {contacts.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No contacts logged yet</p>}
        </div>
      )}
    </div>
  );
}
