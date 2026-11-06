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
import { Plus, Pencil, Trash2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

const CATEGORIES = ['social', 'finance', 'shopping', 'work', 'entertainment', 'utilities', 'other'];

type Credential = {
  id: string; name: string; username: string | null; url: string | null;
  category: string; notes: string | null;
};

export function CredentialTracker() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Credential | null>(null);
  const [form, setForm] = useState({ name: '', username: '', url: '', category: 'other', notes: '' });

  const { data: creds = [], isLoading } = useQuery({
    queryKey: ['credential_vault'],
    queryFn: async () => {
      const { data } = await supabase.from('credential_vault').select('*').order('name');
      return (data || []) as Credential[];
    },
    enabled: !!user,
  });

  const upsert = useMutation({
    mutationFn: async () => {
      const payload = {
        user_id: user!.id, name: form.name, username: form.username || null,
        url: form.url || null, category: form.category, notes: form.notes || null,
      };
      if (editing) await supabase.from('credential_vault').update(payload).eq('id', editing.id);
      else await supabase.from('credential_vault').insert(payload);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['credential_vault'] }); setOpen(false); toast.success('Saved'); },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => { await supabase.from('credential_vault').delete().eq('id', id); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['credential_vault'] }); toast.success('Deleted'); },
  });

  const openAdd = () => { setEditing(null); setForm({ name: '', username: '', url: '', category: 'other', notes: '' }); setOpen(true); };
  const openEdit = (c: Credential) => {
    setEditing(c);
    setForm({ name: c.name, username: c.username || '', url: c.url || '', category: c.category, notes: c.notes || '' });
    setOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{creds.length} account{creds.length !== 1 ? 's' : ''} tracked</p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" /> Add</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? 'Edit' : 'Add'} Account Reference</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Input placeholder="Service name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              <Input placeholder="Username / email" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} />
              <Input placeholder="URL" value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} />
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
              <Input placeholder="Notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              <Button className="w-full" onClick={() => upsert.mutate()} disabled={!form.name}>{editing ? 'Update' : 'Add'}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <p className="text-xs text-muted-foreground bg-muted/50 p-2 rounded-md">This is a reference tracker only — no passwords are stored.</p>

      {isLoading ? <p className="text-muted-foreground text-sm">Loading...</p> : (
        <div className="space-y-2">
          {creds.map(c => (
            <Card key={c.id}>
              <CardContent className="flex items-center justify-between py-3 px-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{c.name}</span>
                    <Badge variant="secondary" className="text-xs">{c.category}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {c.username || 'No username'}{c.url && <> • <a href={c.url} target="_blank" rel="noreferrer" className="underline inline-flex items-center gap-0.5">Visit <ExternalLink className="w-3 h-3" /></a></>}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(c)}><Pencil className="w-3.5 h-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => remove.mutate(c.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {creds.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No accounts tracked yet</p>}
        </div>
      )}
    </div>
  );
}
