import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Search, Phone, Mail, Building2, Cake, Trash2, Users } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const CONTACT_TYPES = [
  { value: 'personal', label: 'Personal' },
  { value: 'family', label: 'Family' },
  { value: 'friend', label: 'Friend' },
  { value: 'professional', label: 'Professional' },
];

export function ContactsList() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({
    first_name: '', last_name: '', phone: '', email: '',
    birthday: '', organization: '', notes: '', contact_type: 'personal',
  });

  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ['chro-contacts', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .order('display_name');
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const addContact = useMutation({
    mutationFn: async () => {
      if (!user) return;
      const displayName = [form.first_name, form.last_name].filter(Boolean).join(' ') || 'Unknown';
      const { error } = await supabase.from('contacts').insert({
        user_id: user.id,
        first_name: form.first_name || null,
        last_name: form.last_name || null,
        display_name: displayName,
        phone: form.phone || null,
        email: form.email || null,
        birthday: form.birthday || null,
        organization: form.organization || null,
        notes: form.notes || null,
        contact_type: form.contact_type,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chro-contacts'] });
      setAddOpen(false);
      setForm({ first_name: '', last_name: '', phone: '', email: '', birthday: '', organization: '', notes: '', contact_type: 'personal' });
      toast({ title: 'Contact added!' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const deleteContact = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('contacts').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chro-contacts'] });
      toast({ title: 'Contact deleted' });
    },
  });

  const filtered = contacts.filter(c => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      c.display_name?.toLowerCase().includes(s) ||
      c.phone?.toLowerCase().includes(s) ||
      c.email?.toLowerCase().includes(s) ||
      c.organization?.toLowerCase().includes(s)
    );
  });

  return (
    <div className="space-y-4">
      {/* Actions bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search contacts..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="w-4 h-4 mr-1" /> Add Contact</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>New Contact</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Input placeholder="First name" value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} />
                <Input placeholder="Last name" value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} />
              </div>
              <Input placeholder="Phone" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              <Input placeholder="Email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              <Input type="date" placeholder="Birthday" value={form.birthday} onChange={e => setForm(f => ({ ...f, birthday: e.target.value }))} />
              <Input placeholder="Organization" value={form.organization} onChange={e => setForm(f => ({ ...f, organization: e.target.value }))} />
              <Select value={form.contact_type} onValueChange={v => setForm(f => ({ ...f, contact_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONTACT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Textarea placeholder="Notes (optional)" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
              <Button onClick={() => addContact.mutate()} disabled={!form.first_name && !form.last_name} className="w-full">
                Save Contact
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="flex gap-2 text-sm text-muted-foreground">
        <Badge variant="secondary">{contacts.length} contacts</Badge>
        {search && <Badge variant="outline">{filtered.length} results</Badge>}
      </div>

      {/* Contact list */}
      {isLoading ? (
        <p className="text-muted-foreground text-sm py-4">Loading contacts...</p>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-50" />
            <p className="text-muted-foreground text-sm">
              {contacts.length === 0
                ? 'No contacts yet. Add your first contact manually.'
                : 'No contacts match your search.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(contact => (
            <Card key={contact.id} className="group">
              <CardContent className="py-3 px-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-sm font-semibold text-primary">
                      {(contact.first_name?.[0] || contact.display_name?.[0] || '?').toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground">{contact.display_name}</span>
                      <Badge variant="secondary" className="text-[10px]">
                        {CONTACT_TYPES.find(t => t.value === contact.contact_type)?.label || contact.contact_type}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                      {contact.phone && (
                        <a href={`tel:${contact.phone}`} className="text-xs text-muted-foreground flex items-center gap-1 hover:text-primary">
                          <Phone className="w-3 h-3" /> {contact.phone}
                        </a>
                      )}
                      {contact.email && (
                        <a href={`mailto:${contact.email}`} className="text-xs text-muted-foreground flex items-center gap-1 hover:text-primary">
                          <Mail className="w-3 h-3" /> {contact.email}
                        </a>
                      )}
                      {contact.organization && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Building2 className="w-3 h-3" /> {contact.organization}
                        </span>
                      )}
                      {contact.birthday && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Cake className="w-3 h-3" /> {contact.birthday}
                        </span>
                      )}
                    </div>
                    {contact.notes && <p className="text-xs text-muted-foreground mt-1">{contact.notes}</p>}
                  </div>
                  <button
                    onClick={() => deleteContact.mutate(contact.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
