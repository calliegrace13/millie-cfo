import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Target, Palmtree, Home, CreditCard, Pencil, Trophy, Plus, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import { format, differenceInMonths, addMonths } from 'date-fns';

const categoryIcons: Record<string, typeof Target> = {
  emergency_fund: Target,
  vacation: Palmtree,
  down_payment: Home,
  debt_payoff: CreditCard,
  custom: Target,
};

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

type Props = {
  goal: Goal;
  monthlySavingsRate: number;
  onEdit: (goal: Goal) => void;
  onAddFunds: (goal: Goal) => void;
};

export function GoalCard({ goal, monthlySavingsRate, onEdit, onAddFunds }: Props) {
  const pct = goal.target_amount > 0 ? Math.min((goal.current_amount / goal.target_amount) * 100, 100) : 0;
  const remaining = Math.max(goal.target_amount - goal.current_amount, 0);
  const isComplete = pct >= 100;

  // Projected completion
  let projectedDate: Date | null = null;
  let status: 'on_track' | 'behind' | 'ahead' | 'complete' = 'on_track';

  if (isComplete) {
    status = 'complete';
  } else if (monthlySavingsRate > 0 && remaining > 0) {
    const monthsNeeded = Math.ceil(remaining / monthlySavingsRate);
    projectedDate = addMonths(new Date(), monthsNeeded);
    if (goal.deadline) {
      const deadlineDate = new Date(goal.deadline);
      if (projectedDate <= deadlineDate) status = 'ahead';
      else status = 'behind';
    }
  } else if (remaining > 0) {
    status = 'behind';
  }

  const Icon = categoryIcons[goal.category] || Target;
  const statusColors = {
    on_track: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
    ahead: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
    behind: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
    complete: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  };
  const statusLabels = { on_track: 'On Track', ahead: 'Ahead', behind: 'Behind', complete: 'Complete!' };
  const StatusIcon = status === 'ahead' ? TrendingUp : status === 'behind' ? TrendingDown : status === 'complete' ? Trophy : Minus;

  return (
    <Card className="relative overflow-hidden">
      {isComplete && (
        <div className="absolute top-3 right-3">
          <Trophy className="w-6 h-6 text-yellow-500" />
        </div>
      )}
      <CardHeader className="pb-2">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: goal.color || 'hsl(var(--primary))' }}
          >
            <Icon className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm truncate">{goal.name}</h3>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge variant="outline" className={statusColors[status]}>
                <StatusIcon className="w-3 h-3 mr-1" />
                {statusLabels[status]}
              </Badge>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-muted-foreground">{formatCurrency(goal.current_amount)}</span>
            <span className="font-medium">{formatCurrency(goal.target_amount)}</span>
          </div>
          <Progress value={pct} className="h-2.5" />
          <p className="text-xs text-muted-foreground mt-1">{pct.toFixed(0)}% complete</p>
        </div>

        {goal.deadline && (
          <div className="text-xs text-muted-foreground">
            Deadline: {format(new Date(goal.deadline), 'MMM d, yyyy')}
          </div>
        )}

        {projectedDate && !isComplete && (
          <div className="text-xs text-muted-foreground">
            Projected: {format(projectedDate, 'MMM yyyy')} at {formatCurrency(monthlySavingsRate)}/mo savings
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <Button variant="outline" size="sm" className="flex-1" onClick={() => onAddFunds(goal)}>
            <Plus className="w-3 h-3 mr-1" /> Add Funds
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onEdit(goal)}>
            <Pencil className="w-3 h-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
