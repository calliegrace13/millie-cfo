import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

const CATEGORIES = [
  { value: 'emergency_fund', label: 'Emergency Fund' },
  { value: 'vacation', label: 'Vacation' },
  { value: 'down_payment', label: 'Down Payment' },
  { value: 'debt_payoff', label: 'Debt Payoff' },
  { value: 'custom', label: 'Custom' },
];

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

type Goal = {
  id?: string;
  name: string;
  target_amount: number;
  current_amount: number;
  deadline: string | null;
  category: string;
  color: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goal?: Goal | null;
  onSaved: () => void;
};

export function GoalForm({ open, onOpenChange, goal, onSaved }: Props) {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [currentAmount, setCurrentAmount] = useState('');
  const [deadline, setDeadline] = useState('');
  const [category, setCategory] = useState('custom');
  const [color, setColor] = useState('#6366f1');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (goal) {
      setName(goal.name);
      setTargetAmount(goal.target_amount.toString());
      setCurrentAmount(goal.current_amount.toString());
      setDeadline(goal.deadline || '');
      setCategory(goal.category);
      setColor(goal.color || '#6366f1');
    } else {
      setName('');
      setTargetAmount('');
      setCurrentAmount('0');
      setDeadline('');
      setCategory('custom');
      setColor('#6366f1');
    }
  }, [goal, open]);

  async function handleSave() {
    if (!user || !name || !targetAmount) return;
    setSaving(true);

    const data = {
      name,
      target_amount: parseFloat(targetAmount),
      current_amount: parseFloat(currentAmount) || 0,
      deadline: deadline || null,
      category,
      color,
      user_id: user.id,
    };

    if (goal?.id) {
      const { error } = await supabase.from('financial_goals').update(data).eq('id', goal.id);
      if (error) toast.error(error.message);
      else toast.success('Goal updated');
    } else {
      const { error } = await supabase.from('financial_goals').insert(data);
      if (error) toast.error(error.message);
      else toast.success('Goal created');
    }

    setSaving(false);
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{goal?.id ? 'Edit Goal' : 'New Goal'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Emergency Fund" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Target Amount</Label>
              <Input type="number" value={targetAmount} onChange={e => setTargetAmount(e.target.value)} placeholder="10000" />
            </div>
            <div>
              <Label>Current Amount</Label>
              <Input type="number" value={currentAmount} onChange={e => setCurrentAmount(e.target.value)} placeholder="0" />
            </div>
          </div>
          <div>
            <Label>Deadline (optional)</Label>
            <Input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} />
          </div>
          <div>
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Color</Label>
            <div className="flex gap-2 mt-1">
              {COLORS.map(c => (
                <button
                  key={c}
                  className={`w-7 h-7 rounded-full border-2 transition-all ${color === c ? 'border-foreground scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !name || !targetAmount}>
            {saving ? 'Saving...' : goal?.id ? 'Update' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
