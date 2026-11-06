import { useLocation, useNavigate, Link } from 'react-router-dom';
import { useEffect, useState, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { Badge } from '@/components/ui/badge';
import { Calendar, CheckSquare, LayoutDashboard, DollarSign, TrendingUp, ChefHat, Dumbbell, Users, ArrowRight, AlertTriangle, X as XIcon, Monitor, LineChart, Megaphone } from 'lucide-react';
import { HIDDEN_ROLES } from '@/lib/constants';
import { CEOCalendar } from '@/components/ceo/CEOCalendar';
import { TaskManager } from '@/components/ceo/TaskManager';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOwnership } from '@/hooks/useOwnership';
import { formatCurrency } from '@/lib/format';
import { Account, Transaction } from '@/lib/types';
import { startOfMonth, endOfMonth, format, parseISO, isToday, isTomorrow, isThisWeek } from 'date-fns';

const SUB_TABS = [
  { value: '/', label: 'Dashboard', icon: LayoutDashboard },
  { value: '/ceo', label: 'Calendar', icon: Calendar },
  { value: '/ceo/tasks', label: 'Tasks', icon: CheckSquare },
];

function CEOOverview() {
  const { user } = useAuth();
  const { getTransactionMultiplier, buildMultiplierMap } = useOwnership();
  const [loading, setLoading] = useState(true);
  const [cfoData, setCfoData] = useState({ netWorth: 0, monthIncome: 0, monthExpenses: 0, accountCount: 0 });
  const [cooData, setCooData] = useState({ workoutsThisWeek: 0, recipesCount: 0, mealPlansCount: 0 });
  const [ceoData, setCeoData] = useState({ todayEvents: 0, upcomingEvents: 0, openTasks: 0, overdueTasks: 0 });
  const [alerts, setAlerts] = useState<Array<{ id: string; title: string; body: string | null; type: string }>>([]);
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    fetchSummaries();
    // Generate alerts on dashboard load
    supabase.functions.invoke('generate-alerts').catch(() => {});
    // Fetch unread alerts for banner
    supabase.from('notifications').select('id, title, body, type')
      .eq('is_read', false).order('created_at', { ascending: false }).limit(5)
      .then(({ data }) => { if (data) setAlerts(data); });
  }, [user]);

  async function fetchSummaries() {
    setLoading(true);
    const now = new Date();
    const monthStart = format(startOfMonth(now), 'yyyy-MM-dd');
    const monthEnd = format(endOfMonth(now), 'yyyy-MM-dd');
    const today = format(now, 'yyyy-MM-dd');

    const [accountsRes, txRes, workoutsRes, recipesRes, mealPlansRes, eventsRes, tasksRes] = await Promise.all([
      supabase.from('accounts').select('*').or('is_deleted.is.null,is_deleted.eq.false'),
      supabase.from('transactions').select('*').gte('date', monthStart).lte('date', monthEnd),
      supabase.from('workouts').select('id').gte('workout_date', format(new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()), 'yyyy-MM-dd')),
      supabase.from('recipes').select('id', { count: 'exact', head: true }),
      supabase.from('meal_plans').select('id', { count: 'exact', head: true }),
      supabase.from('ceo_calendar_events').select('id, event_date').gte('event_date', today).order('event_date').limit(50),
      supabase.from('ceo_tasks').select('id, status, due_date').neq('status', 'done'),
    ]);

    // CFO - use same logic as CFO Dashboard
    const accounts = (accountsRes.data || []) as Account[];
    const multiplierMap = buildMultiplierMap(accounts);
    const scaleBalance = (acc: Account) => (acc.current_balance || 0) * (multiplierMap[acc.id] ?? 1);
    const netWorth = accounts.reduce((sum, a) => {
      const scaled = scaleBalance(a);
      return (a.type === 'credit' || a.type === 'loan') ? sum - scaled : sum + scaled;
    }, 0);
    const txs = (txRes.data || []) as Transaction[];
    const scaleTxAmount = (tx: Transaction) => tx.amount * getTransactionMultiplier(tx, accounts);
    const monthIncome = txs
      .filter(t => t.amount < 0 && t.category === 'Income')
      .reduce((s, t) => s + Math.abs(scaleTxAmount(t)), 0);
    const monthExpenses = txs
      .filter(t => t.amount > 0)
      .reduce((s, t) => s + scaleTxAmount(t), 0);
    setCfoData({ netWorth, monthIncome, monthExpenses, accountCount: accounts.length });

    // COO
    setCooData({
      workoutsThisWeek: (workoutsRes.data || []).length,
      recipesCount: recipesRes.count || 0,
      mealPlansCount: mealPlansRes.count || 0,
    });

    // CEO
    const events = eventsRes.data || [];
    const todayEvents = events.filter(e => e.event_date === today).length;
    const upcomingEvents = events.length;
    const tasks = tasksRes.data || [];
    const overdueTasks = tasks.filter(t => t.due_date && t.due_date < today).length;
    setCeoData({ todayEvents, upcomingEvents, openTasks: tasks.length, overdueTasks });

    setLoading(false);
  }

  if (loading) {
    return <div className="animate-pulse text-muted-foreground py-8">Loading summaries...</div>;
  }

  const visibleAlerts = alerts.filter(a => !dismissedAlerts.has(a.id));

  return (
    <div className="space-y-6">
      {/* Alert Banner */}
      {visibleAlerts.length > 0 && (
        <div className="space-y-2">
          {visibleAlerts.map(alert => (
            <div key={alert.id} className="flex items-center gap-3 px-4 py-3 rounded-lg border bg-muted/50">
              <AlertTriangle className="w-4 h-4 text-orange-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{alert.title}</p>
                {alert.body && <p className="text-xs text-muted-foreground">{alert.body}</p>}
              </div>
              <button onClick={() => {
                setDismissedAlerts(prev => new Set(prev).add(alert.id));
                supabase.from('notifications').update({ is_read: true }).eq('id', alert.id);
              }} className="shrink-0 p-1 hover:bg-secondary rounded">
                <XIcon className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link to="/ceo" className="block">
          <StatCard
            title="Today's Events"
            value={ceoData.todayEvents.toString()}
            icon={<Calendar className="w-5 h-5" />}
          />
        </Link>
        <Link to="/ceo" className="block">
          <StatCard
            title="Upcoming Events"
            value={ceoData.upcomingEvents.toString()}
            subtitle="Next 50 events"
            icon={<Calendar className="w-5 h-5" />}
          />
        </Link>
        <Link to="/ceo/tasks" className="block">
          <StatCard
            title="Open Tasks"
            value={ceoData.openTasks.toString()}
            subtitle={ceoData.overdueTasks > 0 ? `${ceoData.overdueTasks} overdue` : 'All on track'}
            icon={<CheckSquare className="w-5 h-5" />}
          />
        </Link>
        <Link to="/cfo" className="block">
          <StatCard
            title="Net Worth"
            value={formatCurrency(cfoData.netWorth)}
            icon={<DollarSign className="w-5 h-5" />}
          />
        </Link>
      </div>

      {/* Role Summary Cards */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* CFO Summary */}
        <Link to="/cfo" className="block">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[hsl(140_35%_32%)] flex items-center justify-center">
                  <DollarSign className="w-4 h-4 text-white" />
                </div>
                <CardTitle className="text-base">CFO — Finances</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Accounts</span>
                <span className="font-medium">{cfoData.accountCount}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Month Income</span>
                <span className="font-medium text-success">{formatCurrency(cfoData.monthIncome)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Month Expenses</span>
                <span className="font-medium text-destructive">{formatCurrency(cfoData.monthExpenses)}</span>
              </div>
              <div className="pt-2 border-t flex justify-between text-sm">
                <span className="text-muted-foreground">Net Cash Flow</span>
                <span className={`font-semibold ${cfoData.monthIncome - cfoData.monthExpenses >= 0 ? 'text-success' : 'text-destructive'}`}>
                  {formatCurrency(cfoData.monthIncome - cfoData.monthExpenses)}
                </span>
              </div>
            </CardContent>
          </Card>
        </Link>

        {/* COO Summary */}
        {!HIDDEN_ROLES.has('coo') && (
        <Link to="/coo" className="block">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[hsl(340_55%_32%)] flex items-center justify-center">
                  <ChefHat className="w-4 h-4 text-white" />
                </div>
                <CardTitle className="text-base">COO — Operations</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Workouts This Week</span>
                <span className="font-medium">{cooData.workoutsThisWeek}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Recipes</span>
                <span className="font-medium">{cooData.recipesCount}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Meal Plans</span>
                <span className="font-medium">{cooData.mealPlansCount}</span>
              </div>
            </CardContent>
          </Card>
        </Link>
        )}

        {/* CHRO Summary */}
        {!HIDDEN_ROLES.has('chro') && (
        <Link to="/chro" className="block">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[hsl(175_55%_32%)] flex items-center justify-center">
                  <Users className="w-4 h-4 text-white" />
                </div>
                <CardTitle className="text-base">CHRO — People</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Contacts, relationships, and social calendar.</p>
            </CardContent>
          </Card>
        </Link>
        )}

        {/* CTO Summary */}
        {!HIDDEN_ROLES.has('cto') && (
        <Link to="/cto" className="block">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[hsl(270_45%_40%)] flex items-center justify-center">
                  <Monitor className="w-4 h-4 text-white" />
                </div>
                <CardTitle className="text-base">CTO — Technology</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Subscriptions, devices, and credentials.</p>
            </CardContent>
          </Card>
        </Link>
        )}

        {/* CIO Summary */}
        {!HIDDEN_ROLES.has('cio') && (
        <Link to="/cio" className="block">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[hsl(35_65%_38%)] flex items-center justify-center">
                  <LineChart className="w-4 h-4 text-white" />
                </div>
                <CardTitle className="text-base">CIO — Investments</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Portfolio allocation and watchlists.</p>
            </CardContent>
          </Card>
        </Link>
        )}

        {/* CMO Summary */}
        {!HIDDEN_ROLES.has('cmo') && (
        <Link to="/cmo" className="block">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[hsl(330_55%_42%)] flex items-center justify-center">
                  <Megaphone className="w-4 h-4 text-white" />
                </div>
                <CardTitle className="text-base">CMO — Marketing</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Personal brand, content, and networking.</p>
            </CardContent>
          </Card>
        </Link>
        )}
      </div>
    </div>
  );
}

export default function CEODashboard() {
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab = SUB_TABS.find(t => t.value === location.pathname)?.value || '/';

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Millie</h1>
            <p className="text-muted-foreground mt-1">Run Your Life Like a Business</p>
          </div>
          <ToggleGroup type="single" value={activeTab} onValueChange={v => v && navigate(v)} className="bg-muted rounded-lg p-1">
            {SUB_TABS.map(tab => (
              <ToggleGroupItem key={tab.value} value={tab.value} className="gap-1.5 text-sm data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        {activeTab === '/' && <CEOOverview />}
        {activeTab === '/ceo' && <CEOCalendar />}
        {activeTab === '/ceo/tasks' && <TaskManager />}
      </div>
    </AppLayout>
  );
}
