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
import { format, parseISO, isPast } from 'date-fns';
import { toast } from 'sonner';

const TYPES = ['phone', 'laptop', 'tablet', 'watch', 'desktop', 'other'];

type Device = {
  id: string; name: string; type: string; brand: string | null; model: string | null;
  purchase_date: string | null; warranty_end: string | null; serial_number: string | null; notes: string | null;
};

export function DeviceInventory() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Device | null>(null);
  const [form, setForm] = useState({ name: '', type: 'other', brand: '', model: '', purchase_date: '', warranty_end: '', serial_number: '', notes: '' });

  const { data: devices = [], isLoading } = useQuery({
    queryKey: ['device_inventory'],
    queryFn: async () => {
      const { data } = await supabase.from('device_inventory').select('*').order('name');
      return (data || []) as Device[];
    },
    enabled: !!user,
  });

  const upsert = useMutation({
    mutationFn: async () => {
      const payload = {
        user_id: user!.id, name: form.name, type: form.type,
        brand: form.brand || null, model: form.model || null,
        purchase_date: form.purchase_date || null, warranty_end: form.warranty_end || null,
        serial_number: form.serial_number || null, notes: form.notes || null,
      };
      if (editing) await supabase.from('device_inventory').update(payload).eq('id', editing.id);
      else await supabase.from('device_inventory').insert(payload);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['device_inventory'] }); setOpen(false); toast.success('Saved'); },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => { await supabase.from('device_inventory').delete().eq('id', id); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['device_inventory'] }); toast.success('Deleted'); },
  });

  const openAdd = () => { setEditing(null); setForm({ name: '', type: 'other', brand: '', model: '', purchase_date: '', warranty_end: '', serial_number: '', notes: '' }); setOpen(true); };
  const openEdit = (d: Device) => {
    setEditing(d);
    setForm({ name: d.name, type: d.type, brand: d.brand || '', model: d.model || '', purchase_date: d.purchase_date || '', warranty_end: d.warranty_end || '', serial_number: d.serial_number || '', notes: d.notes || '' });
    setOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{devices.length} device{devices.length !== 1 ? 's' : ''}</p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" /> Add</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? 'Edit' : 'Add'} Device</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Input placeholder="Device name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Brand" value={form.brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))} />
                <Input placeholder="Model" value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-xs text-muted-foreground">Purchase Date</label><Input type="date" value={form.purchase_date} onChange={e => setForm(f => ({ ...f, purchase_date: e.target.value }))} /></div>
                <div><label className="text-xs text-muted-foreground">Warranty End</label><Input type="date" value={form.warranty_end} onChange={e => setForm(f => ({ ...f, warranty_end: e.target.value }))} /></div>
              </div>
              <Input placeholder="Serial number" value={form.serial_number} onChange={e => setForm(f => ({ ...f, serial_number: e.target.value }))} />
              <Input placeholder="Notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              <Button className="w-full" onClick={() => upsert.mutate()} disabled={!form.name}>{editing ? 'Update' : 'Add'}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? <p className="text-muted-foreground text-sm">Loading...</p> : (
        <div className="space-y-2">
          {devices.map(d => {
            const warrantyExpired = d.warranty_end && isPast(parseISO(d.warranty_end));
            return (
              <Card key={d.id}>
                <CardContent className="flex items-center justify-between py-3 px-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{d.name}</span>
                      <Badge variant="secondary" className="text-xs">{d.type}</Badge>
                      {warrantyExpired && <Badge variant="destructive" className="text-xs">Warranty Expired</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {[d.brand, d.model].filter(Boolean).join(' ') || 'No details'}
                      {d.warranty_end && !warrantyExpired && ` • Warranty until ${format(parseISO(d.warranty_end), 'MMM d, yyyy')}`}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(d)}><Pencil className="w-3.5 h-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => remove.mutate(d.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {devices.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No devices yet</p>}
        </div>
      )}
    </div>
  );
}
