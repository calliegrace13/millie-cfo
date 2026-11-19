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
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';

const PLATFORMS = ['linkedin', 'twitter', 'instagram', 'youtube', 'tiktok', 'blog', 'other'];
const STATUSES = ['draft', 'scheduled', 'published'];
const CONTENT_TYPES = ['post', 'video', 'article', 'story', 'reel'];

const statusColors: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  scheduled: 'bg-primary/10 text-primary',
  published: 'bg-success/10 text-success',
};

type ContentItem = {
  id: string; title: string; platform: string | null; scheduled_date: string | null;
  status: string; content_type: string; notes: string | null;
};

export function ContentCalendar() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ContentItem | null>(null);
  const [form, setForm] = useState({ title: '', platform: 'linkedin', scheduled_date: '', status: 'draft', content_type: 'post', notes: '' });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['content_calendar'],
    queryFn: async () => {
      const { data } = await supabase.from('content_calendar').select('*').order('scheduled_date', { ascending: true });
      return (data || []) as ContentItem[];
    },
    enabled: !!user,
  });

  const upsert = useMutation({
    mutationFn: async () => {
      const payload = {
        user_id: user!.id, title: form.title, platform: form.platform || null,
        scheduled_date: form.scheduled_date || null, status: form.status,
        content_type: form.content_type, notes: form.notes || null,
      };
      if (editing) await supabase.from('content_calendar').update(payload).eq('id', editing.id);
      else await supabase.from('content_calendar').insert(payload);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['content_calendar'] }); setOpen(false); toast.success('Saved'); },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => { await supabase.from('content_calendar').delete().eq('id', id); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['content_calendar'] }); toast.success('Deleted'); },
  });

  const openAdd = () => { setEditing(null); setForm({ title: '', platform: 'linkedin', scheduled_date: '', status: 'draft', content_type: 'post', notes: '' }); setOpen(true); };
  const openEdit = (c: ContentItem) => {
    setEditing(c);
    setForm({ title: c.title, platform: c.platform || 'linkedin', scheduled_date: c.scheduled_date || '', status: c.status, content_type: c.content_type, notes: c.notes || '' });
    setOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{items.length} content item{items.length !== 1 ? 's' : ''}</p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" /> Add</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? 'Edit' : 'Add'} Content</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Input placeholder="Title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              <div className="grid grid-cols-2 gap-2">
                <Select value={form.platform} onValueChange={v => setForm(f => ({ ...f, platform: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PLATFORMS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={form.content_type} onValueChange={v => setForm(f => ({ ...f, content_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CONTENT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input type="date" value={form.scheduled_date} onChange={e => setForm(f => ({ ...f, scheduled_date: e.target.value }))} />
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Input placeholder="Notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              <Button className="w-full" onClick={() => upsert.mutate()} disabled={!form.title}>{editing ? 'Update' : 'Add'}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? <p className="text-muted-foreground text-sm">Loading...</p> : (
        <div className="space-y-2">
          {items.map(c => (
            <Card key={c.id}>
              <CardContent className="flex items-center justify-between py-3 px-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{c.title}</span>
                    {c.platform && <Badge variant="secondary" className="text-xs">{c.platform}</Badge>}
                    <Badge className={`text-xs ${statusColors[c.status] || ''}`}>{c.status}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {c.content_type}{c.scheduled_date && ` • ${format(parseISO(c.scheduled_date), 'MMM d, yyyy')}`}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(c)}><Pencil className="w-3.5 h-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => remove.mutate(c.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {items.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No content planned yet</p>}
        </div>
      )}
    </div>
  );
}

