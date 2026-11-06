import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useSettings } from '@/hooks/useSettings';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatCurrency, formatDate } from '@/lib/format';
import { CalendarDays, Pencil, Users, CalendarPlus } from 'lucide-react';
import { Plus, Trash2, Tag, ChevronDown, ChevronRight, Search } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Event, Transaction, TransactionEvent } from '@/lib/types';
import { toast } from 'sonner';
import { Navigate } from 'react-router-dom';

type CalendarEvent = {
  id: string;
  title: string;
  event_date: string;
  description: string | null;
  is_joint: boolean | null;
};

const EVENT_COLORS = ['#3b82f6', '#8b5cf6', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#f97316'];

export function EventsContent() {
  const { user, loading: authLoading } = useAuth();
  const { showPartnerMode } = useSettings();
  const [events, setEvents] = useState<(Event & { is_joint?: boolean })[]>([]);
  const [transactionEvents, setTransactionEvents] = useState<TransactionEvent[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; is_joint: boolean }[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [calendarSearch, setCalendarSearch] = useState('');
  const [loadingCalendar, setLoadingCalendar] = useState(false);
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  const [tagDialogEvent, setTagDialogEvent] = useState<(Event & { is_joint?: boolean }) | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [form, setForm] = useState({ name: '', description: '', event_date: '', end_date: '', is_joint: false });
  const [editEvent, setEditEvent] = useState<(Event & { is_joint?: boolean }) | null>(null);
  const [editForm, setEditForm] = useState({ name: '', description: '', event_date: '', end_date: '', is_joint: false });

  useEffect(() => {
    if (user) fetchData();
  }, [user]);

  async function fetchData() {
    setLoading(true);
    const [eventsRes, teRes, txRes, acctRes] = await Promise.all([
      supabase.from('events').select('*').order('created_at', { ascending: false }),
      supabase.from('transaction_events').select('*'),
      supabase.from('transactions').select('*').order('date', { ascending: false }),
      supabase.from('accounts').select('id, is_joint'),
    ]);
    if (eventsRes.data) setEvents(eventsRes.data as Event[]);
    if (teRes.data) setTransactionEvents(teRes.data as TransactionEvent[]);
    if (txRes.data) setTransactions(txRes.data as Transaction[]);
    if (acctRes.data) setAccounts(acctRes.data);
    setLoading(false);
  }

  async function fetchCalendarEvents() {
    setLoadingCalendar(true);
    const { data } = await supabase
      .from('ceo_calendar_events')
      .select('id, title, event_date, description, is_joint')
      .order('event_date', { ascending: false })
      .limit(200);
    setCalendarEvents((data as CalendarEvent[]) || []);
    setLoadingCalendar(false);
  }

  function openImportDialog() {
    setImportDialogOpen(true);
    setCalendarSearch('');
    fetchCalendarEvents();
  }

  async function importFromCalendar(calEvent: CalendarEvent) {
    if (!user) return;
    const { error } = await supabase.from('events').insert({
      user_id: user.id,
      name: calEvent.title,
      description: calEvent.description || null,
      event_date: calEvent.event_date || null,
      color: EVENT_COLORS[events.length % EVENT_COLORS.length],
      is_joint: calEvent.is_joint || false,
    } as any);
    if (error) { toast.error('Failed to import event'); return; }
    toast.success(`Imported "${calEvent.title}"`);
    fetchData();
  }

  const filteredCalendarEvents = useMemo(() => {
    const q = calendarSearch.toLowerCase();
    if (!q) return calendarEvents;
    return calendarEvents.filter(e =>
      e.title.toLowerCase().includes(q) ||
      e.description?.toLowerCase().includes(q) ||
      e.event_date?.includes(q)
    );
  }, [calendarEvents, calendarSearch]);

  async function createEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const { error } = await supabase.from('events').insert({
      user_id: user.id,
      name: form.name,
      description: form.description || null,
      event_date: form.event_date || null,
      end_date: form.end_date || null,
      color: EVENT_COLORS[events.length % EVENT_COLORS.length],
      is_joint: form.is_joint,
    } as any);
    if (error) { toast.error('Failed to create event'); return; }
    toast.success('Event created');
    setDialogOpen(false);
    setForm({ name: '', description: '', event_date: '', end_date: '', is_joint: false });
    fetchData();
  }

  async function deleteEvent(id: string) {
    const { error } = await supabase.from('events').delete().eq('id', id);
    if (!error) { toast.success('Event deleted'); fetchData(); }
  }

  function openEditDialog(ev: Event) {
    setEditEvent(ev);
    setEditForm({
      name: ev.name,
      description: ev.description || '',
      event_date: ev.event_date || '',
      end_date: ev.end_date || '',
      is_joint: (ev as any).is_joint || false,
    });
  }

  async function updateEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!editEvent) return;
    const { error } = await supabase.from('events').update({
      name: editForm.name,
      description: editForm.description || null,
      event_date: editForm.event_date || null,
      end_date: editForm.end_date || null,
      is_joint: editForm.is_joint,
    } as any).eq('id', editEvent.id);
    if (error) { toast.error('Failed to update event'); return; }
    toast.success('Event updated');
    setEditEvent(null);
    fetchData();
  }

  async function tagTransaction(eventId: string, txId: string) {
    // Prevent duplicate tagging
    const alreadyTagged = transactionEvents.some(te => te.event_id === eventId && te.transaction_id === txId);
    if (alreadyTagged) { toast.info('Transaction already tagged to this event'); return; }
    // Any transaction can be tagged to any event (including joint events)
    const { error } = await supabase.from('transaction_events').insert({ event_id: eventId, transaction_id: txId });
    if (error) {
      if (error.code === '23505') { toast.info('Transaction already tagged'); return; }
      toast.error('Failed to tag transaction'); return;
    }
    setTransactionEvents(prev => [...prev, { id: '', event_id: eventId, transaction_id: txId, created_at: '' }]);
    toast.success('Transaction tagged');
  }

  async function untagTransaction(eventId: string, txId: string) {
    const { error } = await supabase.from('transaction_events').delete().eq('event_id', eventId).eq('transaction_id', txId);
    if (!error) {
      setTransactionEvents(prev => prev.filter(te => !(te.event_id === eventId && te.transaction_id === txId)));
      toast.success('Transaction untagged');
    }
  }

  const getEventTransactions = (eventId: string) => {
    // Deduplicate transaction IDs in case of existing duplicates
    const txIds = new Set(transactionEvents.filter(te => te.event_id === eventId).map(te => te.transaction_id));
    const event = events.find(e => e.id === eventId);
    const isPartnerEvent = event?.is_joint && event?.user_id !== user?.id;
    return transactions
      .filter(tx => {
        if (!txIds.has(tx.id)) return false;
        // Partner viewing a joint event only sees transactions from joint accounts
        if (isPartnerEvent) {
          const acct = tx.account_id ? accounts.find(a => a.id === tx.account_id) : null;
          return acct?.is_joint === true;
        }
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  };

  const getEventTotal = (eventId: string) => {
    return getEventTransactions(eventId)
      .filter(tx => tx.amount > 0)
      .reduce((sum, tx) => sum + tx.amount, 0);
  };

  if (authLoading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-pulse">Loading...</div></div>;
  if (!user) return <Navigate to="/auth" replace />;

  return (
    <>
      <PageHeader
        title="Events"
        description="Tag transactions to track spending on specific events"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={openImportDialog}>
              <CalendarPlus className="w-4 h-4 mr-2" />From Calendar
            </Button>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="w-4 h-4 mr-2" />New Event</Button>
              </DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader><DialogTitle>Create Event</DialogTitle></DialogHeader>
              <form onSubmit={createEvent} className="space-y-4">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input placeholder="e.g., Vacation to Italy" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label>Description (optional)</Label>
                  <Input placeholder="Notes about this event" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Start Date (optional)</Label>
                    <Input type="date" value={form.event_date} onChange={e => setForm({ ...form, event_date: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>End Date (optional)</Label>
                    <Input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} />
                  </div>
                </div>
                {showPartnerMode && (
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2"><Users className="w-4 h-4" />Joint Event</Label>
                    <Switch checked={form.is_joint} onCheckedChange={v => setForm({ ...form, is_joint: v })} />
                  </div>
                )}
                <Button type="submit" className="w-full">Create Event</Button>
              </form>
            </DialogContent>
          </Dialog>
          </div>
        }
      />

      {loading ? (
        <div className="animate-pulse text-muted-foreground">Loading events...</div>
      ) : events.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Tag className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-medium mb-2">No events yet</h3>
            <p>Create an event to start tracking spending for trips, projects, or any occasion.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {events.map(event => {
            const eventTxs = getEventTransactions(event.id);
            const total = getEventTotal(event.id);
            const isExpanded = expandedEvent === event.id;

            return (
              <Card key={event.id} className="group">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: event.color }} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <CardTitle className="text-base">{event.name}</CardTitle>
                        <Badge variant="secondary">{eventTxs.length} transaction{eventTxs.length !== 1 ? 's' : ''}</Badge>
                        {(event as any).is_joint && <Badge variant="outline" className="gap-1"><Users className="w-3 h-3" />Joint</Badge>}
                      </div>
                      {event.description && <p className="text-sm text-muted-foreground mt-0.5">{event.description}</p>}
                      {event.event_date && (
                        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                          <CalendarDays className="w-3 h-3" />
                          {formatDate(event.event_date)}{event.end_date ? ` – ${formatDate(event.end_date)}` : ''}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-lg font-semibold">{formatCurrency(total)}</span>
                    <Button variant="outline" size="sm" onClick={() => openEditDialog(event)}>
                      <Pencil className="w-3 h-3 mr-1" />Edit
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setTagDialogEvent(event)}>
                      <Tag className="w-3 h-3 mr-1" />Tag
                    </Button>
                    <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100" onClick={() => deleteEvent(event.id)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </CardHeader>
                {eventTxs.length > 0 && (
                  <CardContent className="pt-0">
                    <button
                      onClick={() => setExpandedEvent(isExpanded ? null : event.id)}
                      className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      {isExpanded ? 'Hide' : 'Show'} transactions
                    </button>
                    {isExpanded && (
                      <Table className="mt-2">
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead>Category</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead className="w-10" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {eventTxs.map(tx => (
                            <TableRow key={tx.id}>
                              <TableCell className="text-muted-foreground whitespace-nowrap">{formatDate(tx.date)}</TableCell>
                              <TableCell>
                                <div>{tx.merchant_name || tx.name}</div>
                                {tx.account_name && <div className="text-xs text-muted-foreground">{tx.account_name}</div>}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">{tx.category || '—'}</TableCell>
                              <TableCell className={`text-right font-medium ${tx.amount > 0 ? '' : 'text-success'}`}>
                                {formatCurrency(tx.amount)}
                              </TableCell>
                              <TableCell>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => untagTransaction(event.id, tx.id)}>
                                  <Trash2 className="w-3 h-3 text-destructive" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Tag transactions dialog */}
      <Dialog open={!!tagDialogEvent} onOpenChange={open => !open && setTagDialogEvent(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Tag Transactions to "{tagDialogEvent?.name}"</DialogTitle>
          </DialogHeader>
          {tagDialogEvent && (
            <TagTransactionsPanel
              event={tagDialogEvent}
              transactions={transactions}
              accounts={accounts}
              taggedTxIds={new Set(transactionEvents.filter(te => te.event_id === tagDialogEvent.id).map(te => te.transaction_id))}
              onTag={tagTransaction}
              onUntag={untagTransaction}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Edit event dialog */}
      <Dialog open={!!editEvent} onOpenChange={open => !open && setEditEvent(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Edit Event</DialogTitle></DialogHeader>
          <form onSubmit={updateEvent} className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Input value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input type="date" value={editForm.event_date} onChange={e => setEditForm({ ...editForm, event_date: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>End Date</Label>
                <Input type="date" value={editForm.end_date} onChange={e => setEditForm({ ...editForm, end_date: e.target.value })} />
              </div>
            </div>
            {showPartnerMode && (
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2"><Users className="w-4 h-4" />Joint Event</Label>
                <Switch checked={editForm.is_joint} onCheckedChange={v => setEditForm({ ...editForm, is_joint: v })} />
              </div>
            )}
            <Button type="submit" className="w-full">Save Changes</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Import from Calendar dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Import from Calendar</DialogTitle>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search calendar events..."
              value={calendarSearch}
              onChange={e => setCalendarSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <ScrollArea className="flex-1 max-h-[50vh]">
            {loadingCalendar ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Loading calendar events...</p>
            ) : filteredCalendarEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No calendar events found.</p>
            ) : (
              <div className="space-y-1 pr-3">
                {filteredCalendarEvents.map(calEvent => {
                  const alreadyImported = events.some(
                    e => e.name === calEvent.title && e.event_date === calEvent.event_date
                  );
                  return (
                    <div
                      key={calEvent.id}
                      className="flex items-center justify-between gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{calEvent.title}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <CalendarDays className="w-3 h-3" />
                          {formatDate(calEvent.event_date)}
                          {calEvent.is_joint && (
                            <Badge variant="outline" className="text-[10px] ml-1 gap-0.5">
                              <Users className="w-2.5 h-2.5" />Joint
                            </Badge>
                          )}
                        </p>
                        {calEvent.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">{calEvent.description}</p>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant={alreadyImported ? "secondary" : "default"}
                        disabled={alreadyImported}
                        onClick={() => importFromCalendar(calEvent)}
                      >
                        {alreadyImported ? 'Added' : 'Import'}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}

function TagTransactionsPanel({ event, transactions, accounts, taggedTxIds, onTag, onUntag, searchQuery, setSearchQuery }: {
  event: Event & { is_joint?: boolean };
  transactions: Transaction[];
  accounts: { id: string; is_joint: boolean }[];
  taggedTxIds: Set<string>;
  onTag: (eventId: string, txId: string) => void;
  onUntag: (eventId: string, txId: string) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
}) {
  // Build a set of joint account IDs for filtering
  const jointAccountIds = useMemo(() => new Set(accounts.filter(a => a.is_joint).map(a => a.id)), [accounts]);

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase();
    const isJointEvent = !!(event as any).is_joint;
    return transactions
      .filter(tx => tx.amount > 0) // expenses only
      .filter(tx => {
        // If event is joint, only show transactions from joint accounts
        if (isJointEvent && tx.account_id && !jointAccountIds.has(tx.account_id)) return false;
        return true;
      })
      .filter(tx => {
        if (!q) return true;
        return (tx.merchant_name?.toLowerCase().includes(q) ||
          tx.name.toLowerCase().includes(q) ||
          tx.category?.toLowerCase().includes(q) ||
          tx.account_name?.toLowerCase().includes(q) ||
          String(tx.amount).includes(q));
      })
      .slice(0, 200);
  }, [transactions, searchQuery, event, jointAccountIds]);

  return (
    <div className="flex flex-col gap-3 overflow-hidden flex-1">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search transactions..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>
      <div className="overflow-y-auto flex-1">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10" />
              <TableHead>Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(tx => {
              const isTagged = taggedTxIds.has(tx.id);
              return (
                <TableRow key={tx.id} className="cursor-pointer" onClick={() => isTagged ? onUntag(event.id, tx.id) : onTag(event.id, tx.id)}>
                  <TableCell>
                    <Checkbox checked={isTagged} />
                  </TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">{formatDate(tx.date)}</TableCell>
                  <TableCell>
                    <div>{tx.merchant_name || tx.name}</div>
                    {tx.account_name && <div className="text-xs text-muted-foreground">{tx.account_name}</div>}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{tx.category || '—'}</TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(tx.amount)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
