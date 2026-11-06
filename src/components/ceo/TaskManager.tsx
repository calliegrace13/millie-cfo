import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, GripVertical, Calendar, Users } from 'lucide-react';
import { format, isPast, isToday, parseISO } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useSettings } from '@/hooks/useSettings';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';

type Task = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  completed_at: string | null;
  sort_order: number;
  created_at: string;
  is_joint?: boolean;
};

const PRIORITIES = [
  { value: 'low', label: 'Low', class: 'bg-muted text-muted-foreground' },
  { value: 'medium', label: 'Medium', class: 'bg-blue-500/10 text-blue-600' },
  { value: 'high', label: 'High', class: 'bg-orange-500/10 text-orange-600' },
  { value: 'urgent', label: 'Urgent', class: 'bg-red-500/10 text-red-600' },
];

const STATUS_TABS = [
  { value: 'todo', label: 'To Do' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
];

export function TaskManager() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('todo');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium', due_date: '', is_joint: false });
  const { showPartnerMode } = useSettings();

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['ceo-tasks', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ceo_tasks')
        .select('*')
        .order('sort_order')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Task[];
    },
    enabled: !!user,
  });

  const addTask = useMutation({
    mutationFn: async () => {
      if (!user || !form.title.trim()) return;
      // Put new tasks at the top
      const maxOrder = tasks.filter(t => t.status === 'todo').reduce((max, t) => Math.max(max, t.sort_order ?? 0), 0);
      const { error } = await supabase.from('ceo_tasks').insert({
        user_id: user.id,
        title: form.title.trim(),
        description: form.description || null,
        priority: form.priority,
        due_date: form.due_date || null,
        status: 'todo',
        is_joint: form.is_joint,
        sort_order: maxOrder + 1,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ceo-tasks'] });
      setOpen(false);
      setForm({ title: '', description: '', priority: 'medium', due_date: '', is_joint: false });
      toast({ title: 'Task added!' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const toggleDone = useMutation({
    mutationFn: async (task: Task) => {
      const newStatus = task.status === 'done' ? 'todo' : 'done';
      const { error } = await supabase.from('ceo_tasks').update({
        status: newStatus,
        completed_at: newStatus === 'done' ? new Date().toISOString() : null,
      } as any).eq('id', task.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ceo-tasks'] }),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from('ceo_tasks').update({
        status,
        completed_at: status === 'done' ? new Date().toISOString() : null,
      } as any).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ceo-tasks'] }),
  });

  const deleteTask = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ceo_tasks').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ceo-tasks'] }),
  });

  const reorderTasks = useMutation({
    mutationFn: async (updates: { id: string; sort_order: number }[]) => {
      // Batch update sort orders
      await Promise.all(
        updates.map(u =>
          supabase.from('ceo_tasks').update({ sort_order: u.sort_order } as any).eq('id', u.id)
        )
      );
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ceo-tasks'] }),
  });

  const filteredTasks = tasks.filter(t => t.status === activeTab);
  // Sort by sort_order (user-defined drag order)
  const sortedTasks = [...filteredTasks].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  const todoCnt = tasks.filter(t => t.status === 'todo').length;
  const inProgressCnt = tasks.filter(t => t.status === 'in_progress').length;
  const doneCnt = tasks.filter(t => t.status === 'done').length;

  function handleDragEnd(result: DropResult) {
    if (!result.destination) return;
    const srcIdx = result.source.index;
    const destIdx = result.destination.index;
    if (srcIdx === destIdx) return;

    const reordered = Array.from(sortedTasks);
    const [moved] = reordered.splice(srcIdx, 1);
    reordered.splice(destIdx, 0, moved);

    // Optimistic update
    const updates = reordered.map((t, i) => ({ id: t.id, sort_order: i }));
    queryClient.setQueryData(['ceo-tasks', user?.id], (old: Task[] | undefined) => {
      if (!old) return old;
      const orderMap = new Map(updates.map(u => [u.id, u.sort_order]));
      return old.map(t => orderMap.has(t.id) ? { ...t, sort_order: orderMap.get(t.id)! } : t);
    });

    reorderTasks.mutate(updates);
  }

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="pt-4 pb-4 text-center"><p className="text-2xl font-bold text-foreground">{todoCnt}</p><p className="text-xs text-muted-foreground">To Do</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-4 text-center"><p className="text-2xl font-bold text-foreground">{inProgressCnt}</p><p className="text-xs text-muted-foreground">In Progress</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-4 text-center"><p className="text-2xl font-bold text-foreground">{doneCnt}</p><p className="text-xs text-muted-foreground">Done</p></CardContent></Card>
      </div>

      {/* Tabs + Add */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          {STATUS_TABS.map(tab => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={cn(
                "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                activeTab === tab.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="w-4 h-4 mr-1" /> Add Task</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>New Task</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Input placeholder="Task title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              <div className="grid grid-cols-2 gap-3">
                <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} placeholder="Due date" />
              </div>
              <Textarea placeholder="Description (optional)" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} />
              {showPartnerMode && (
                <div className="flex items-center gap-2">
                  <Switch checked={form.is_joint} onCheckedChange={c => setForm(f => ({ ...f, is_joint: c }))} id="task-joint" />
                  <Label htmlFor="task-joint" className="text-sm flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" /> Joint task (visible to partner)
                  </Label>
                </div>
              )}
              <Button onClick={() => addTask.mutate()} disabled={!form.title.trim()} className="w-full">Add Task</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Task list with drag and drop */}
      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading...</p>
      ) : sortedTasks.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            No tasks in this column.
          </CardContent>
        </Card>
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId={activeTab}>
            {(provided) => (
              <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
                {sortedTasks.map((task, index) => {
                  const pri = PRIORITIES.find(p => p.value === task.priority);
                  const overdue = task.due_date && !task.completed_at && isPast(parseISO(task.due_date)) && !isToday(parseISO(task.due_date));
                  return (
                    <Draggable key={task.id} draggableId={task.id} index={index}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className={cn(snapshot.isDragging && "opacity-90")}
                        >
                          <Card className={cn("group", snapshot.isDragging && "shadow-lg ring-2 ring-primary/20")}>
                            <CardContent className="py-3 px-4">
                              <div className="flex items-start gap-3">
                                <div
                                  {...provided.dragHandleProps}
                                  className="mt-0.5 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground transition-colors"
                                >
                                  <GripVertical className="w-4 h-4" />
                                </div>
                                <Checkbox
                                  checked={task.status === 'done'}
                                  onCheckedChange={() => toggleDone.mutate(task)}
                                  className="mt-0.5"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                                    <span className={cn("text-sm font-medium", task.status === 'done' && "line-through text-muted-foreground")}>{task.title}</span>
                                    <Badge variant="secondary" className={cn("text-[10px]", pri?.class)}>{pri?.label}</Badge>
                                    {task.is_joint && <Badge variant="outline" className="text-[10px] gap-0.5"><Users className="w-2.5 h-2.5" />Joint</Badge>}
                                  </div>
                                  {task.description && <p className="text-xs text-muted-foreground">{task.description}</p>}
                                  {task.due_date && (
                                    <p className={cn("text-xs flex items-center gap-1 mt-1", overdue ? "text-destructive font-medium" : "text-muted-foreground")}>
                                      <Calendar className="w-3 h-3" />
                                      {overdue ? 'Overdue: ' : 'Due: '}{format(parseISO(task.due_date), 'MMM d')}
                                    </p>
                                  )}
                                </div>
                                {task.status !== 'done' && (
                                  <Select value={task.status} onValueChange={v => updateStatus.mutate({ id: task.id, status: v })}>
                                    <SelectTrigger className="h-7 w-[100px] text-xs"><SelectValue /></SelectTrigger>
                                    <SelectContent>{STATUS_TABS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                                  </Select>
                                )}
                                <button onClick={() => deleteTask.mutate(task.id)} className="opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Trash2 className="w-4 h-4 text-muted-foreground" />
                                </button>
                              </div>
                            </CardContent>
                          </Card>
                        </div>
                      )}
                    </Draggable>
                  );
                })}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      )}
    </div>
  );
}
