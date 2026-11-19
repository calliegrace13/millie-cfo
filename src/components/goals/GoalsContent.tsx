import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { GoalCard } from './GoalCard';
import { GoalForm } from './GoalForm';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { startOfMonth, subMonths, format } from 'date-fns';

type Goal = {
  id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  deadline: string | null;
  category: string;
  color: string | null;
  is_active: boolean;
  last_milestone_pct: number | null;
};

export function GoalsContent() {
  const { user } = useAuth();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [monthlySavings, setMonthlySavings] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [editGoal, setEditGoal] = useState<Goal | null>(null);
  const [addFundsGoal, setAddFundsGoal] = useState<Goal | null>(null);
  const [addAmount, setAddAmount] = useState('');

  useEffect(() => {
    if (user) {
      fetchGoals();
      calculateMonthlySavings();
    }
  }, [user]);

  async function fetchGoals() {
    setLoading(true);
    const { data } = await supabase
      .from('financial_goals')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    if (data) setGoals(data as Goal[]);
    setLoading(false);
  }

  async function calculateMonthlySavings() {
    if (!user) return;
    const now = new Date();
    const threeMonthsAgo = format(startOfMonth(subMonths(now, 3)), 'yyyy-MM-dd');
    const monthEnd = format(now, 'yyyy-MM-dd');

    const { data: txs } = await supabase
      .from('transactions')
      .select('amount, category')
      .gte('date', threeMonthsAgo)
      .lte('date', monthEnd);

    if (txs) {
      const income = txs.filter(t => t.amount < 0 && t.category === 'Income').reduce((s, t) => s + Math.abs(t.amount), 0);
      const expenses = txs.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
      setMonthlySavings(Math.max((income - expenses) / 3, 0));
    }
  }

  async function handleAddFunds() {
    if (!addFundsGoal || !addAmount) return;
    const newAmount = addFundsGoal.current_amount + parseFloat(addAmount);
    const newPct = Math.floor((newAmount / addFundsGoal.target_amount) * 100);
    const lastMilestone = addFundsGoal.last_milestone_pct || 0;

    const updateData: Record<string, unknown> = { current_amount: newAmount };

    // Check milestones
    const milestones = [25, 50, 75, 100];
    const hitMilestone = milestones.find(m => newPct >= m && lastMilestone < m);
    if (hitMilestone) {
      updateData.last_milestone_pct = hitMilestone;
      const milestoneMsg = hitMilestone === 100
        ? `🎉 You reached your "${addFundsGoal.name}" goal!`
        : `🎯 ${hitMilestone}% milestone reached for "${addFundsGoal.name}"!`;
      toast.success(milestoneMsg);

      // Insert notification
      if (user) {
        await supabase.from('notifications').insert({
          user_id: user.id,
          title: hitMilestone === 100 ? 'Goal Complete!' : `Goal Milestone: ${hitMilestone}%`,
          body: milestoneMsg,
          type: 'goal_milestone',
          reference_type: 'financial_goal',
          reference_id: addFundsGoal.id,
        });
      }
    }

    await supabase.from('financial_goals').update(updateData).eq('id', addFundsGoal.id);
    setAddFundsGoal(null);
    setAddAmount('');
    fetchGoals();
  }

  if (loading) return <div className="py-8 text-center text-muted-foreground">Loading goals...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Avg monthly savings: <span className="font-medium text-foreground">${monthlySavings.toFixed(0)}</span>/mo (last 3 months)
          </p>
        </div>
        <Button onClick={() => { setEditGoal(null); setFormOpen(true); }}>
          <Plus className="w-4 h-4 mr-1" /> New Goal
        </Button>
      </div>

      {goals.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg font-medium mb-2">No goals yet</p>
          <p className="text-sm">Create your first savings goal to start tracking progress.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {goals.map(goal => (
            <GoalCard
              key={goal.id}
              goal={goal}
              monthlySavingsRate={monthlySavings}
              onEdit={g => { setEditGoal(g); setFormOpen(true); }}
              onAddFunds={g => { setAddFundsGoal(g); setAddAmount(''); }}
            />
          ))}
        </div>
      )}

      <GoalForm
        open={formOpen}
        onOpenChange={setFormOpen}
        goal={editGoal}
        onSaved={fetchGoals}
      />

      {/* Add Funds Dialog */}
      <Dialog open={!!addFundsGoal} onOpenChange={() => setAddFundsGoal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Funds to "{addFundsGoal?.name}"</DialogTitle>
          </DialogHeader>
          <div>
            <Label>Amount</Label>
            <Input
              type="number"
              value={addAmount}
              onChange={e => setAddAmount(e.target.value)}
              placeholder="500"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddFundsGoal(null)}>Cancel</Button>
            <Button onClick={handleAddFunds} disabled={!addAmount || parseFloat(addAmount) <= 0}>
              Add Funds
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

