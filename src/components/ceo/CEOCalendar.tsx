import { useState } from 'react';
import { GoogleCalendarSync } from './GoogleCalendarSync';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Plus, ChevronLeft, ChevronRight, Trash2, Clock, Users, CheckSquare } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek, parseISO, isToday } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useSettings } from '@/hooks/useSettings';

type CalendarEvent = {
  id: string;
  title: string;
  description: string | null;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  color: string | null;
  is_all_day: boolean;
  recurrence: string | null;
};

const EVENT_COLORS = [
  { label: 'Indigo', value: '#6366f1' },
  { label: 'Rose', value: '#f43f5e' },
  { label: 'Emerald', value: '#10b981' },
  { label: 'Amber', value: '#f59e0b' },
  { label: 'Sky', value: '#0ea5e9' },
  { label: 'Purple', value: '#a855f7' },
];

export function CEOCalendar() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: '', description: '', event_date: format(new Date(), 'yyyy-MM-dd'),
    start_time: '', end_time: '', color: '#6366f1', is_all_day: true, is_joint: false,
  });
  const { showPartnerMode } = useSettings();

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['ceo-calendar-events', user?.id, format(monthStart, 'yyyy-MM')],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ceo_calendar_events')
        .select('*')
        .gte('event_date', format(calStart, 'yyyy-MM-dd'))
        .lte('event_date', format(calEnd, 'yyyy-MM-dd'))
        .order('event_date')
        .order('start_time');
      if (error) throw error;
      return data as CalendarEvent[];
    },
    enabled: !!user,
  });

  // Fetch CFO events that have dates, to show on the calendar
  const { data: cfoEvents = [] } = useQuery({
    queryKey: ['cfo-events-for-calendar', user?.id, format(monthStart, 'yyyy-MM')],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select('id, name, color, event_date, end_date, description')
        .not('event_date', 'is', null);
      if (error) throw error;
      return (data || []) as { id: string; name: string; color: string | null; event_date: string; end_date: string | null; description: string | null }[];
    },
    enabled: !!user,
  });

  // Fetch tasks with due dates to show on the calendar
  const { data: tasks = [] } = useQuery({
    queryKey: ['ceo-tasks-for-calendar', user?.id, format(monthStart, 'yyyy-MM')],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ceo_tasks')
        .select('id, title, due_date, status, priority')
        .not('due_date', 'is', null)
        .gte('due_date', format(calStart, 'yyyy-MM-dd'))
        .lte('due_date', format(calEnd, 'yyyy-MM-dd'));
      if (error) throw error;
      return (data || []) as { id: string; title: string; due_date: string; status: string; priority: string }[];
    },
    enabled: !!user,
  });

  // Convert CFO events into calendar-compatible items for display
  const cfoCalendarItems: CalendarEvent[] = cfoEvents.flatMap(ev => {
    const start = parseISO(ev.event_date);
    const end = ev.end_date ? parseISO(ev.end_date) : start;
    const days = eachDayOfInterval({ start, end });
    return days
      .filter(d => d >= calStart && d <= calEnd)
      .map(d => ({
        id: `cfo-${ev.id}-${format(d, 'yyyy-MM-dd')}`,
        title: `💰 ${ev.name}`,
        description: ev.description,
        event_date: format(d, 'yyyy-MM-dd'),
        start_time: null,
        end_time: null,
        color: ev.color || '#f59e0b',
        is_all_day: true,
        recurrence: null,
      }));
  });

  // Convert tasks into calendar-compatible items
  const TASK_PRIORITY_COLORS: Record<string, string> = {
    urgent: '#ef4444',
    high: '#f97316',
    medium: '#3b82f6',
    low: '#6b7280',
  };

  const taskCalendarItems: CalendarEvent[] = tasks.map(task => ({
    id: `task-${task.id}`,
    title: `${task.status === 'done' ? '✅' : '☐'} ${task.title}`,
    description: null,
    event_date: task.due_date,
    start_time: null,
    end_time: null,
    color: TASK_PRIORITY_COLORS[task.priority] || '#3b82f6',
    is_all_day: true,
    recurrence: null,
  }));

  const allEvents = [...events, ...cfoCalendarItems, ...taskCalendarItems];

  const addEvent = useMutation({
    mutationFn: async () => {
      if (!user || !form.title.trim()) return;
      const { error } = await supabase.from('ceo_calendar_events').insert({
        user_id: user.id,
        title: form.title.trim(),
        description: form.description || null,
        event_date: form.event_date,
        start_time: form.is_all_day ? null : form.start_time || null,
        end_time: form.is_all_day ? null : form.end_time || null,
        color: form.color,
        is_all_day: form.is_all_day,
        is_joint: form.is_joint,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ceo-calendar-events'] });
      setOpen(false);
      setForm({ title: '', description: '', event_date: format(new Date(), 'yyyy-MM-dd'), start_time: '', end_time: '', color: '#6366f1', is_all_day: true, is_joint: false });
      toast({ title: 'Event added!' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const deleteEvent = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ceo_calendar_events').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ceo-calendar-events'] }),
  });

  const eventsForDay = (day: Date) => allEvents.filter(e => isSameDay(parseISO(e.event_date), day));
  const selectedDayEvents = selectedDate ? eventsForDay(selectedDate) : [];

  const openNewEventForDate = (date: Date) => {
    setForm(f => ({ ...f, event_date: format(date, 'yyyy-MM-dd') }));
    setOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <GoogleCalendarSync currentMonth={currentMonth} />
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setCurrentMonth(m => subMonths(m, 1))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <h2 className="text-lg font-semibold text-foreground min-w-[160px] text-center">
            {format(currentMonth, 'MMMM yyyy')}
          </h2>
          <Button variant="outline" size="icon" onClick={() => setCurrentMonth(m => addMonths(m, 1))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="w-4 h-4 mr-1" /> Add Event</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>New Event</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Input placeholder="Event title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              <Input type="date" value={form.event_date} onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))} />
              <div className="flex items-center gap-2">
                <Checkbox checked={form.is_all_day} onCheckedChange={c => setForm(f => ({ ...f, is_all_day: !!c }))} />
                <span className="text-sm text-muted-foreground">All day</span>
              </div>
              {!form.is_all_day && (
                <div className="grid grid-cols-2 gap-3">
                  <Input type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} />
                  <Input type="time" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} />
                </div>
              )}
              <Select value={form.color} onValueChange={v => setForm(f => ({ ...f, color: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EVENT_COLORS.map(c => (
                    <SelectItem key={c.value} value={c.value}>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: c.value }} />
                        {c.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Textarea placeholder="Description (optional)" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} />
              {showPartnerMode && (
                <div className="flex items-center gap-2">
                  <Switch checked={form.is_joint} onCheckedChange={c => setForm(f => ({ ...f, is_joint: c }))} id="event-joint" />
                  <Label htmlFor="event-joint" className="text-sm flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" /> Joint event (visible to partner)
                  </Label>
                </div>
              )}
              <Button onClick={() => addEvent.mutate()} disabled={!form.title.trim()} className="w-full">Save Event</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Calendar Grid */}
      <Card>
        <CardContent className="p-2 sm:p-4">
          <div className="grid grid-cols-7 gap-px">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
              <div key={d} className="text-xs font-medium text-muted-foreground text-center py-2">{d}</div>
            ))}
            {days.map((day, i) => {
              const dayEvents = eventsForDay(day);
              const isSelected = selectedDate && isSameDay(day, selectedDate);
              return (
                <button
                  key={i}
                  onClick={() => setSelectedDate(day)}
                  onDoubleClick={() => openNewEventForDate(day)}
                  className={cn(
                    "min-h-[72px] sm:min-h-[90px] p-1 text-left rounded-md transition-colors border border-transparent",
                    !isSameMonth(day, currentMonth) && "opacity-40",
                    isToday(day) && "bg-primary/10 border-primary/30",
                    isSelected && "ring-2 ring-primary",
                    "hover:bg-muted/50"
                  )}
                >
                  <span className={cn(
                    "text-xs font-medium inline-flex items-center justify-center w-6 h-6 rounded-full",
                    isToday(day) && "bg-primary text-primary-foreground"
                  )}>
                    {format(day, 'd')}
                  </span>
                  <div className="space-y-0.5 mt-0.5">
                    {dayEvents.slice(0, 3).map(ev => (
                      <div
                        key={ev.id}
                        className="text-[10px] leading-tight truncate rounded px-1 py-px text-white"
                        style={{ backgroundColor: ev.color || '#6366f1' }}
                      >
                        {ev.title}
                      </div>
                    ))}
                    {dayEvents.length > 3 && (
                      <span className="text-[10px] text-muted-foreground">+{dayEvents.length - 3} more</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Selected Day Detail */}
      {selectedDate && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{format(selectedDate, 'EEEE, MMMM d')}</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => openNewEventForDate(selectedDate)}>
                <Plus className="w-4 h-4 mr-1" /> Add
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {selectedDayEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No events. Double-click a day to add one.</p>
            ) : (
              <div className="space-y-2">
                {selectedDayEvents.map(ev => {
                  const isTask = ev.id.startsWith('task-');
                  const isCfo = ev.id.startsWith('cfo-');
                  return (
                    <div key={ev.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 group">
                      {isTask ? (
                        <CheckSquare className="w-4 h-4 mt-0.5 shrink-0" style={{ color: ev.color || '#3b82f6' }} />
                      ) : (
                        <div className="w-3 h-3 rounded-full mt-1 shrink-0" style={{ backgroundColor: ev.color || '#6366f1' }} />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{ev.title}</p>
                        {isTask && (
                          <Badge variant="secondary" className="text-[10px] mt-0.5">Task</Badge>
                        )}
                        {!isTask && !ev.is_all_day && ev.start_time && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <Clock className="w-3 h-3" />
                            {ev.start_time?.slice(0, 5)}{ev.end_time && ` – ${ev.end_time.slice(0, 5)}`}
                          </p>
                        )}
                        {!isTask && ev.is_all_day && <Badge variant="secondary" className="text-[10px] mt-0.5">All day</Badge>}
                        {ev.description && <p className="text-xs text-muted-foreground mt-1">{ev.description}</p>}
                      </div>
                      {!isCfo && !isTask && (
                        <button onClick={() => deleteEvent.mutate(ev.id)} className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <Trash2 className="w-4 h-4 text-muted-foreground" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
