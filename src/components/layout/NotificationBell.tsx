import { useState, useEffect } from 'react';
import { Bell, Check, Trash2, AlertTriangle, TrendingUp, Calendar, CreditCard, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

type AppNotification = {
  id: string;
  user_id: string;
  title: string;
  body: string | null;
  type: string;
  is_read: boolean;
  link: string | null;
  created_at: string;
};

const typeIcons: Record<string, typeof Bell> = {
  budget_warning: AlertTriangle,
  budget_danger: AlertTriangle,
  budget_exceeded: AlertTriangle,
  missed_bill: CreditCard,
  unusual_spending: TrendingUp,
  birthday: Calendar,
  goal_milestone: TrendingUp,
  info: Info,
};

const typeColors: Record<string, string> = {
  budget_warning: 'text-yellow-500',
  budget_danger: 'text-orange-500',
  budget_exceeded: 'text-destructive',
  missed_bill: 'text-destructive',
  unusual_spending: 'text-orange-500',
  birthday: 'text-primary',
  goal_milestone: 'text-green-500',
  info: 'text-muted-foreground',
};

export function NotificationBell() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetchNotifications();

    const channel = supabase
      .channel(`notifications:${user.id}`, { config: { private: true } })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, (payload) => {
        const n = payload.new as AppNotification;
        setNotifications(prev => [n, ...prev]);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  async function fetchNotifications() {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (data) setNotifications(data as AppNotification[]);
  }

  async function markAsRead(id: string) {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  }

  async function markAllRead() {
    await supabase.from('notifications').update({ is_read: true }).eq('is_read', false);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  }

  async function clearAll() {
    await supabase.from('notifications').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    setNotifications([]);
  }

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs bg-destructive text-destructive-foreground">
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h4 className="font-semibold text-sm">Notifications</h4>
          <div className="flex gap-1">
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={markAllRead}>
                <Check className="w-3 h-3 mr-1" /> Read all
              </Button>
            )}
            {notifications.length > 0 && (
              <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive" onClick={clearAll}>
                <Trash2 className="w-3 h-3 mr-1" /> Clear
              </Button>
            )}
          </div>
        </div>
        <ScrollArea className="max-h-80">
          {notifications.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">No notifications</div>
          ) : (
            notifications.map(n => {
              const Icon = typeIcons[n.type] || Bell;
              const color = typeColors[n.type] || 'text-muted-foreground';
              return (
                <div
                  key={n.id}
                  className={cn(
                    "flex gap-3 px-4 py-3 border-b last:border-0 cursor-pointer hover:bg-muted/50 transition-colors",
                    !n.is_read && "bg-muted/30"
                  )}
                  onClick={() => markAsRead(n.id)}
                >
                  <Icon className={cn("w-4 h-4 mt-0.5 shrink-0", color)} />
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-sm leading-tight", !n.is_read && "font-medium")}>{n.title}</p>
                    {n.body && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>}
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                    </p>
                  </div>
                  {!n.is_read && <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />}
                </div>
              );
            })
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
