import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Loader2, Link2, Unlink } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { format, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns';

export function GoogleCalendarSync({ currentMonth }: { currentMonth: Date }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  const checkStatus = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase.functions.invoke('gcal-sync', {
        body: { action: 'status' },
      });
      if (data?.connected) {
        setConnected(true);
        setLastSynced(data.lastSynced);
      } else {
        setConnected(false);
      }
    } catch {
      setConnected(false);
    }
  }, [user]);

  useEffect(() => { checkStatus(); }, [checkStatus]);

  // Listen for OAuth callback
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.data?.type === 'gcal-oauth-callback' && event.data.code && user) {
        setConnecting(true);
        try {
          const redirectUri = `${window.location.origin}/ceo`;
          const { data, error } = await supabase.functions.invoke('gcal-exchange-token', {
            body: { code: event.data.code, redirectUri },
          });
          if (error || data?.error) throw new Error(data?.error || error.message);
          toast({ title: 'Google Calendar connected!' });
          setConnected(true);
          await syncNow();
        } catch (e: any) {
          toast({ title: 'Connection failed', description: e.message, variant: 'destructive' });
        } finally {
          setConnecting(false);
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [user]);

  // Check URL for OAuth code on load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    if (code && state && user && state === user.id) {
      // Clear URL params
      window.history.replaceState({}, '', window.location.pathname);
      // Exchange token
      (async () => {
        setConnecting(true);
        try {
          const redirectUri = `${window.location.origin}/ceo`;
          const { data, error } = await supabase.functions.invoke('gcal-exchange-token', {
            body: { code, redirectUri },
          });
          if (error || data?.error) throw new Error(data?.error || error.message);
          toast({ title: 'Google Calendar connected!' });
          setConnected(true);
          // Trigger sync
          setSyncing(true);
          const monthStart = startOfMonth(currentMonth);
          const monthEnd = endOfMonth(currentMonth);
          await supabase.functions.invoke('gcal-sync', {
            body: {
              action: 'list',
              timeMin: subMonths(monthStart, 1).toISOString(),
              timeMax: addMonths(monthEnd, 1).toISOString(),
            },
          });
          queryClient.invalidateQueries({ queryKey: ['ceo-calendar-events'] });
          setSyncing(false);
        } catch (e: any) {
          toast({ title: 'Connection failed', description: e.message, variant: 'destructive' });
        } finally {
          setConnecting(false);
        }
      })();
    }
  }, [user]);

  const connectGoogle = async () => {
    if (!user) return;
    setConnecting(true);
    try {
      const redirectUri = `${window.location.origin}/ceo`;
      const { data, error } = await supabase.functions.invoke('gcal-auth-url', {
        body: { redirectUri },
      });
      if (error || data?.error) throw new Error(data?.error || error.message);
      window.location.href = data.url;
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
      setConnecting(false);
    }
  };

  const syncNow = async () => {
    setSyncing(true);
    try {
      const monthStart = startOfMonth(currentMonth);
      const monthEnd = endOfMonth(currentMonth);
      const { data, error } = await supabase.functions.invoke('gcal-sync', {
        body: {
          action: 'list',
          timeMin: subMonths(monthStart, 1).toISOString(),
          timeMax: addMonths(monthEnd, 1).toISOString(),
        },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      toast({ title: `Synced ${data.synced} events from Google Calendar` });
      setLastSynced(new Date().toISOString());
      queryClient.invalidateQueries({ queryKey: ['ceo-calendar-events'] });
    } catch (e: any) {
      toast({ title: 'Sync failed', description: e.message, variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  };

  if (connected === null) return null;

  if (!connected) {
    return (
      <Button variant="outline" size="sm" onClick={connectGoogle} disabled={connecting}>
        {connecting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Link2 className="w-4 h-4 mr-1" />}
        Connect Google Calendar
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Badge variant="secondary" className="text-xs gap-1">
        <div className="w-2 h-2 rounded-full bg-green-500" />
        Google Calendar
      </Badge>
      <Button variant="outline" size="sm" onClick={syncNow} disabled={syncing}>
        {syncing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
        Sync
      </Button>
      {lastSynced && (
        <span className="text-[10px] text-muted-foreground">
          Last: {format(new Date(lastSynced), 'MMM d, h:mm a')}
        </span>
      )}
    </div>
  );
}

