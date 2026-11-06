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

const PLATFORMS = ['linkedin', 'twitter', 'instagram', 'youtube', 'tiktok', 'github', 'other'];

type SocialAccount = {
  id: string; platform: string; handle: string | null; url: string | null;
  follower_count: number; notes?: string | null;
};

export function SocialAccounts() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SocialAccount | null>(null);
  const [form, setForm] = useState({ platform: 'linkedin', handle: '', url: '', follower_count: '' });

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['social_accounts'],
    queryFn: async () => {
      const { data } = await supabase.from('social_accounts').select('*').order('platform');
      return (data || []) as SocialAccount[];
    },
    enabled: !!user,
  });

  const upsert = useMutation({
    mutationFn: async () => {
      const payload = {
        user_id: user!.id, platform: form.platform, handle: form.handle || null,
        url: form.url || null, follower_count: parseInt(form.follower_count) || 0,
      };
      if (editing) await supabase.from('social_accounts').update(payload).eq('id', editing.id);
      else await supabase.from('social_accounts').insert(payload);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['social_accounts'] }); setOpen(false); toast.success('Saved'); },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => { await supabase.from('social_accounts').delete().eq('id', id); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['social_accounts'] }); toast.success('Deleted'); },
  });

  const openAdd = () => { setEditing(null); setForm({ platform: 'linkedin', handle: '', url: '', follower_count: '' }); setOpen(true); };
  const openEdit = (a: SocialAccount) => {
    setEditing(a);
    setForm({ platform: a.platform, handle: a.handle || '', url: a.url || '', follower_count: a.follower_count.toString() });
    setOpen(true);
  };

  const totalFollowers = accounts.reduce((s, a) => s + a.follower_count, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Total Followers</p>
          <p className="text-2xl font-bold">{totalFollowers.toLocaleString()}</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" /> Add</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? 'Edit' : 'Add'} Social Account</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Select value={form.platform} onValueChange={v => setForm(f => ({ ...f, platform: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PLATFORMS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
              <Input placeholder="Handle (e.g. @yourname)" value={form.handle} onChange={e => setForm(f => ({ ...f, handle: e.target.value }))} />
              <Input placeholder="Profile URL" value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} />
              <Input placeholder="Follower count" type="number" value={form.follower_count} onChange={e => setForm(f => ({ ...f, follower_count: e.target.value }))} />
              <Button className="w-full" onClick={() => upsert.mutate()} disabled={!form.platform}>{editing ? 'Update' : 'Add'}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? <p className="text-muted-foreground text-sm">Loading...</p> : (
        <div className="space-y-2">
          {accounts.map(a => (
            <Card key={a.id}>
              <CardContent className="flex items-center justify-between py-3 px-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">{a.platform}</Badge>
                    <span className="font-medium text-sm">{a.handle || 'No handle'}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                    <span>{a.follower_count.toLocaleString()} followers</span>
                    {a.url && <a href={a.url} target="_blank" rel="noreferrer" className="underline inline-flex items-center gap-0.5">Visit <ExternalLink className="w-3 h-3" /></a>}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(a)}><Pencil className="w-3.5 h-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => remove.mutate(a.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {accounts.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No social accounts yet</p>}
        </div>
      )}
    </div>
  );
}
