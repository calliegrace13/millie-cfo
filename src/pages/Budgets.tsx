import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOwnership } from '@/hooks/useOwnership';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency, formatDate } from '@/lib/format';
import { Plus, Trash2, Lightbulb, TrendingUp, Check, Calendar, CalendarDays, Users, User } from 'lucide-react';
import { Budget, Transaction, BudgetPeriod, BudgetScope, Account } from '@/lib/types';
import { toast } from 'sonner';
import { Navigate } from 'react-router-dom';

const COLORS = ['#3b82f6', '#8b5cf6', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899'];

type CategorySpend = {
  category: string;
  totalSpent: number;
  monthCount: number;
  avgMonthly: number;
  suggestedLimit: number;
  suggestedPeriod: BudgetPeriod;
  varianceRatio: number; // coefficient of variation
};

export function BudgetsContent() {
  const { user, loading: authLoading } = useAuth();
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [yearTransactions, setYearTransactions] = useState<Transaction[]>([]);
  const [historicalTransactions, setHistoricalTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [newBudget, setNewBudget] = useState({ category: '', monthly_limit: '', period: 'monthly' as BudgetPeriod, budget_scope: 'all' as BudgetScope });
  const [categories, setCategories] = useState<string[]>([]);
  const [drillCategory, setDrillCategory] = useState<{ category: string; period: BudgetPeriod; scope: BudgetScope } | null>(null);
  const { buildMultiplierMap } = useOwnership();
  useEffect(() => {
    if (user) fetchData();
  }, [user]);

  async function fetchData() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString();
    const startOfYear = new Date(now.getFullYear(), 0, 1).toISOString();
    
    // Get last 3 months for suggestions
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString();

    const [budgetRes, txRes, yearTxRes, historicalRes, categoriesRes, accRes] = await Promise.all([
      supabase.from('budgets').select('*').order('created_at', { ascending: false }),
      supabase.from('transactions').select('*').gte('date', startOfMonth).lte('date', endOfMonth),
      supabase.from('transactions').select('*').gte('date', startOfYear).lte('date', endOfMonth),
      supabase.from('transactions').select('*').gte('date', threeMonthsAgo).lt('date', startOfMonth),
      supabase.from('transaction_categories').select('name').order('name'),
      supabase.from('accounts').select('*').or('is_deleted.is.null,is_deleted.eq.false'),
    ]);

    if (budgetRes.data) setBudgets(budgetRes.data as Budget[]);
    if (txRes.data) setTransactions(txRes.data as Transaction[]);
    if (yearTxRes.data) setYearTransactions(yearTxRes.data as Transaction[]);
    if (accRes.data) setAccounts(accRes.data as Account[]);
    if (historicalRes.data) setHistoricalTransactions(historicalRes.data as Transaction[]);
    
    // Get unique categories from both custom categories and transaction history
    const customCategories = categoriesRes.data?.map(c => c.name) || [];
    const txCategories = [...new Set([
      ...(txRes.data || []).filter(tx => tx.category).map(tx => tx.category!),
      ...(historicalRes.data || []).filter(tx => tx.category).map(tx => tx.category!)
    ])];
    const allCategories = [...new Set([...customCategories, ...txCategories])].sort();
    setCategories(allCategories);
    
    setLoading(false);
  }

  // Calculate spending suggestions based on last 3 months
  const spendingSuggestions = useMemo((): CategorySpend[] => {
    const existingBudgetCategories = new Set(budgets.map(b => b.category.toLowerCase()));
    
    // Group spending by category and by month
    // Exclude transfers as they're not real expenses to budget
    const excludedCategories = new Set(['transfer', 'transfers', 'payment', 'credit card payment']);
    const categorySpending: Record<string, { total: number; monthlyAmounts: Record<string, number> }> = {};
    
    historicalTransactions
      .filter(tx => tx.category && tx.amount > 0 && !excludedCategories.has(tx.category.toLowerCase()))
      .forEach(tx => {
        const cat = tx.category!;
        const monthKey = tx.date.substring(0, 7); // YYYY-MM
        
        if (!categorySpending[cat]) {
          categorySpending[cat] = { total: 0, monthlyAmounts: {} };
        }
        categorySpending[cat].total += tx.amount;
        categorySpending[cat].monthlyAmounts[monthKey] = 
          (categorySpending[cat].monthlyAmounts[monthKey] || 0) + tx.amount;
      });
    
    // Always use 3 months as the baseline for averaging
    const analysisMonths = 3;
    
    // Convert to suggestions, excluding categories that already have budgets
    return Object.entries(categorySpending)
      .filter(([cat]) => !existingBudgetCategories.has(cat.toLowerCase()))
      .map(([category, data]) => {
        const monthlyValues = Object.values(data.monthlyAmounts);
        const monthsWithSpending = monthlyValues.length;
        // Average over full 3-month period, not just months with spending
        const avgMonthly = data.total / analysisMonths;
        
        // Calculate coefficient of variation (std dev / mean)
        // Higher values indicate more variable spending
        // Include zero months in variance calculation
        let varianceRatio = 0;
        if (avgMonthly > 0) {
          // Pad with zeros for months without spending
          const paddedValues = [...monthlyValues];
          for (let i = monthlyValues.length; i < analysisMonths; i++) {
            paddedValues.push(0);
          }
          const variance = paddedValues.reduce((sum, val) => 
            sum + Math.pow(val - avgMonthly, 2), 0) / analysisMonths;
          const stdDev = Math.sqrt(variance);
          varianceRatio = stdDev / avgMonthly;
        }
        
        // If variance is high (>0.5 = std dev is half the mean), suggest yearly
        // This catches irregular spending like travel, gifts, subscriptions
        const suggestedPeriod: BudgetPeriod = varianceRatio > 0.5 ? 'yearly' : 'monthly';
        
        // For yearly, suggest 12x monthly with buffer; for monthly, 10% buffer
        const baseLimit = suggestedPeriod === 'yearly' 
          ? avgMonthly * 12 * 1.15 // 15% buffer for yearly
          : avgMonthly * 1.1; // 10% buffer for monthly
        const suggestedLimit = Math.ceil(baseLimit / 50) * 50;
        
        return {
          category,
          totalSpent: data.total,
          monthCount: monthsWithSpending,
          avgMonthly,
          suggestedLimit: Math.max(suggestedLimit, suggestedPeriod === 'yearly' ? 200 : 50),
          suggestedPeriod,
          varianceRatio
        };
      })
      .filter(s => s.avgMonthly >= 25) // Only suggest for categories with meaningful spend
      .sort((a, b) => b.avgMonthly - a.avgMonthly)
      .slice(0, 8); // Top 8 suggestions
  }, [historicalTransactions, budgets]);

  async function createBudget(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    const { error } = await supabase.from('budgets').insert({
      user_id: user.id,
      category: newBudget.category,
      monthly_limit: parseFloat(newBudget.monthly_limit),
      period: newBudget.period,
      budget_scope: newBudget.budget_scope,
      color: COLORS[budgets.length % COLORS.length],
    });

    if (error) {
      if (error.code === '23505') toast.error('Budget for this category already exists');
      else toast.error('Failed to create budget');
    } else {
      toast.success('Budget created');
      setDialogOpen(false);
      setNewBudget({ category: '', monthly_limit: '', period: 'monthly', budget_scope: 'all' });
      fetchData();
    }
  }

  async function createBudgetFromSuggestion(suggestion: CategorySpend, period: BudgetPeriod) {
    if (!user) return;

    const { error } = await supabase.from('budgets').insert({
      user_id: user.id,
      category: suggestion.category,
      monthly_limit: suggestion.suggestedLimit,
      period,
      color: COLORS[budgets.length % COLORS.length],
    });

    if (error) {
      if (error.code === '23505') toast.error('Budget for this category already exists');
      else toast.error('Failed to create budget');
    } else {
      toast.success(`Budget created for ${suggestion.category}`);
      fetchData();
    }
  }

  async function deleteBudget(id: string) {
    const { error } = await supabase.from('budgets').delete().eq('id', id);
    if (!error) {
      toast.success('Budget deleted');
      fetchData();
    }
  }

  if (authLoading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-pulse">Loading...</div></div>;
  if (!user) return <Navigate to="/auth" replace />;

  const multiplierMap = buildMultiplierMap(accounts);
  const scaledAmount = (tx: Transaction) => tx.amount * (tx.account_id ? (multiplierMap[tx.account_id] ?? 1) : 1);

  // Build a set of joint account IDs for filtering
  const jointAccountIds = new Set(accounts.filter(a => a.is_joint).map(a => a.id));

  const getSpentAmount = (category: string, period: BudgetPeriod, scope: BudgetScope = 'all') => {
    const txList = period === 'yearly' ? yearTransactions : transactions;
    return txList
      .filter(tx => {
        if (tx.category !== category || tx.amount <= 0) return false;
        if (scope === 'joint') return tx.account_id ? jointAccountIds.has(tx.account_id) : false;
        if (scope === 'personal') return tx.account_id ? !jointAccountIds.has(tx.account_id) : true;
        return true;
      })
      .reduce((sum, tx) => sum + scaledAmount(tx), 0);
  };

  // Filter out categories that already have budgets
  const availableCategories = categories.filter(
    cat => !budgets.some(b => b.category.toLowerCase() === cat.toLowerCase())
  );

  return (
    <>
      <PageHeader
        title="Budgets"
        description="Set and track monthly spending limits"
        actions={
          <div className="flex gap-2">
            {spendingSuggestions.length > 0 && (
              <Dialog open={suggestionsOpen} onOpenChange={setSuggestionsOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <Lightbulb className="w-4 h-4 mr-2" />
                    Suggestions
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-primary" />
                      Budget Suggestions
                    </DialogTitle>
                  </DialogHeader>
                  <p className="text-sm text-muted-foreground mb-4">
                    Based on your spending over the last 3 months, we suggest these budgets:
                  </p>
                  <div className="space-y-3 max-h-[400px] overflow-y-auto">
                    {spendingSuggestions.map((suggestion) => (
                      <Card key={suggestion.category} className="p-4">
                        <div className="flex items-center justify-between gap-4">
                          <div className="space-y-1 flex-1">
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium">{suggestion.category}</h4>
                              <Badge variant={suggestion.suggestedPeriod === 'yearly' ? 'secondary' : 'outline'} className="text-xs">
                                {suggestion.suggestedPeriod === 'yearly' ? (
                                  <><CalendarDays className="w-3 h-3 mr-1" />Yearly</>
                                ) : (
                                  <><Calendar className="w-3 h-3 mr-1" />Monthly</>
                                )}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              Avg: {formatCurrency(suggestion.avgMonthly)}/mo over {suggestion.monthCount} month{suggestion.monthCount > 1 ? 's' : ''}
                              {suggestion.suggestedPeriod === 'yearly' && (
                                <span className="block text-xs mt-0.5">Variable spending — yearly budget recommended</span>
                              )}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <p className="font-semibold text-primary">
                                {formatCurrency(suggestion.suggestedLimit)}/{suggestion.suggestedPeriod === 'yearly' ? 'yr' : 'mo'}
                              </p>
                            </div>
                            <Button 
                              size="sm"
                              onClick={() => createBudgetFromSuggestion(suggestion, suggestion.suggestedPeriod)}
                            >
                              <Check className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </DialogContent>
              </Dialog>
            )}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="w-4 h-4 mr-2" />Add Budget</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Create Budget</DialogTitle></DialogHeader>
                <form onSubmit={createBudget} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Category</Label>
                    {availableCategories.length > 0 ? (
                      <Select 
                        value={newBudget.category} 
                        onValueChange={(v) => setNewBudget({ ...newBudget, category: v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select a category" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableCategories.map(cat => (
                            <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input 
                        placeholder="e.g., Food & Dining" 
                        value={newBudget.category} 
                        onChange={(e) => setNewBudget({ ...newBudget, category: e.target.value })} 
                        required 
                      />
                    )}
                    {availableCategories.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Or <button 
                          type="button" 
                          className="text-primary underline" 
                          onClick={() => setNewBudget({ ...newBudget, category: '' })}
                        >
                          enter a custom category
                        </button>
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Budget Period</Label>
                    <Select 
                      value={newBudget.period} 
                      onValueChange={(v) => setNewBudget({ ...newBudget, period: v as BudgetPeriod })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monthly">
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4" />
                            Monthly
                          </div>
                        </SelectItem>
                        <SelectItem value="yearly">
                          <div className="flex items-center gap-2">
                            <CalendarDays className="w-4 h-4" />
                            Yearly
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Use yearly for categories with variable monthly spending (travel, gifts, etc.)
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Scope</Label>
                    <Select 
                      value={newBudget.budget_scope} 
                      onValueChange={(v) => setNewBudget({ ...newBudget, budget_scope: v as BudgetScope })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">
                          <div className="flex items-center gap-2">
                            <Users className="w-4 h-4" />
                            All Accounts
                          </div>
                        </SelectItem>
                        <SelectItem value="personal">
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4" />
                            Personal Only
                          </div>
                        </SelectItem>
                        <SelectItem value="joint">
                          <div className="flex items-center gap-2">
                            <Users className="w-4 h-4" />
                            Joint Only
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Track spending from all accounts, personal only, or joint only
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>{newBudget.period === 'yearly' ? 'Yearly' : 'Monthly'} Limit</Label>
                    <Input 
                      type="number" 
                      step="0.01" 
                      placeholder={newBudget.period === 'yearly' ? '2000.00' : '500.00'} 
                      value={newBudget.monthly_limit} 
                      onChange={(e) => setNewBudget({ ...newBudget, monthly_limit: e.target.value })} 
                      required 
                    />
                  </div>
                  <Button type="submit" className="w-full">Create Budget</Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      {loading ? (
        <div className="animate-pulse text-muted-foreground">Loading budgets...</div>
      ) : budgets.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Lightbulb className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No budgets set</h3>
            <p className="text-muted-foreground mb-6">
              Create budgets to track your spending limits by category.
              {spendingSuggestions.length > 0 && " We have suggestions based on your spending history!"}
            </p>
            <div className="flex gap-3 justify-center">
              {spendingSuggestions.length > 0 && (
                <Button variant="outline" onClick={() => setSuggestionsOpen(true)}>
                  <Lightbulb className="w-4 h-4 mr-2" />
                  View Suggestions
                </Button>
              )}
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create Budget
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {budgets.map((budget) => {
            const period = budget.period || 'monthly';
            const scope = (budget as any).budget_scope || 'all';
            const spent = getSpentAmount(budget.category, period, scope);
            const percentage = Math.min((spent / budget.monthly_limit) * 100, 100);
            const isOverBudget = spent > budget.monthly_limit;
            const periodLabel = period === 'yearly' ? 'this year' : 'this month';
            const limitLabel = period === 'yearly' ? '/yr' : '/mo';
            const scopeLabel = scope === 'joint' ? 'Joint' : scope === 'personal' ? 'Personal' : null;

            return (
              <Card key={budget.id} className="group">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: budget.color }} />
                    <div className="flex items-center gap-2 flex-wrap">
                      <CardTitle 
                        className="text-base cursor-pointer hover:text-primary transition-colors underline decoration-dotted underline-offset-4"
                        onClick={() => setDrillCategory({ category: budget.category, period, scope })}
                      >
                        {budget.category}
                      </CardTitle>
                      <Badge variant="outline" className="text-xs">
                        {period === 'yearly' ? <CalendarDays className="w-3 h-3 mr-1" /> : <Calendar className="w-3 h-3 mr-1" />}
                        {period}
                      </Badge>
                      {scopeLabel && (
                        <Badge variant="secondary" className="text-xs">
                          {scope === 'joint' ? <Users className="w-3 h-3 mr-1" /> : <User className="w-3 h-3 mr-1" />}
                          {scopeLabel}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100" onClick={() => deleteBudget(budget.id)}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between text-sm">
                    <span className={isOverBudget ? 'text-destructive font-medium' : ''}>
                      {formatCurrency(spent)} spent {periodLabel}
                    </span>
                    <span className="text-muted-foreground">
                      {formatCurrency(budget.monthly_limit)}{limitLabel} limit
                    </span>
                  </div>
                  <Progress 
                    value={percentage} 
                    className={`h-2 ${isOverBudget ? '[&>div]:bg-destructive' : ''}`}
                  />
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{percentage.toFixed(0)}% used</span>
                    {isOverBudget ? (
                      <span className="text-destructive font-medium">
                        {formatCurrency(spent - budget.monthly_limit)} over budget
                      </span>
                    ) : (
                      <span className="text-success">
                        {formatCurrency(budget.monthly_limit - spent)} remaining
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      {/* Category drill-down dialog */}
      <Dialog open={!!drillCategory} onOpenChange={(open) => !open && setDrillCategory(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{drillCategory?.category} Transactions</DialogTitle>
          </DialogHeader>
          {drillCategory && (
            <CategoryTransactionList
              category={drillCategory.category}
              period={drillCategory.period}
              scope={drillCategory.scope}
              transactions={drillCategory.period === 'yearly' ? yearTransactions : transactions}
              jointAccountIds={jointAccountIds}
              scaledAmount={scaledAmount}
              allCategories={categories}
              onTransactionUpdated={fetchData}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function CategoryTransactionList({ category, period, scope, transactions, jointAccountIds, scaledAmount, allCategories, onTransactionUpdated }: {
  category: string;
  period: BudgetPeriod;
  scope: BudgetScope;
  transactions: Transaction[];
  jointAccountIds: Set<string>;
  scaledAmount: (tx: Transaction) => number;
  allCategories: string[];
  onTransactionUpdated: () => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ category: '', notes: '', merchant_name: '' });

  const filtered = transactions
    .filter(tx => {
      if (tx.category !== category || tx.amount <= 0) return false;
      if (scope === 'joint') return tx.account_id ? jointAccountIds.has(tx.account_id) : false;
      if (scope === 'personal') return tx.account_id ? !jointAccountIds.has(tx.account_id) : true;
      return true;
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  if (filtered.length === 0) {
    return <p className="text-sm text-muted-foreground py-4 text-center">No transactions found for this {period === 'yearly' ? 'year' : 'month'}.</p>;
  }

  const total = filtered.reduce((sum, tx) => sum + scaledAmount(tx), 0);

  function startEdit(tx: Transaction) {
    setEditingId(tx.id);
    setEditForm({ category: tx.category || '', notes: tx.notes || '', merchant_name: tx.merchant_name || '' });
  }

  async function saveEdit(id: string) {
    const updates: Record<string, any> = {};
    const tx = filtered.find(t => t.id === id);
    if (!tx) return;
    if (editForm.category !== (tx.category || '')) updates.category = editForm.category;
    if (editForm.notes !== (tx.notes || '')) updates.notes = editForm.notes || null;
    if (editForm.merchant_name !== (tx.merchant_name || '')) updates.merchant_name = editForm.merchant_name || null;

    if (Object.keys(updates).length > 0) {
      const { error } = await supabase.from('transactions').update(updates).eq('id', id);
      if (error) { toast.error('Failed to update'); return; }
      toast.success('Transaction updated');
      onTransactionUpdated();
    }
    setEditingId(null);
  }

  return (
    <div className="overflow-y-auto flex-1">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Notes</TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map(tx => (
            <TableRow
              key={tx.id}
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => editingId !== tx.id && startEdit(tx)}
            >
              <TableCell className="text-muted-foreground whitespace-nowrap">{formatDate(tx.date)}</TableCell>
              <TableCell>
                {editingId === tx.id ? (
                  <Input
                    value={editForm.merchant_name}
                    onChange={e => setEditForm(f => ({ ...f, merchant_name: e.target.value }))}
                    className="h-7 text-sm"
                    onClick={e => e.stopPropagation()}
                  />
                ) : (
                  <div>
                    <div>{tx.merchant_name || tx.name}</div>
                    {tx.account_name && <div className="text-xs text-muted-foreground">{tx.account_name}</div>}
                  </div>
                )}
              </TableCell>
              <TableCell>
                {editingId === tx.id ? (
                  <Select value={editForm.category} onValueChange={v => setEditForm(f => ({ ...f, category: v }))}>
                    <SelectTrigger className="h-7 text-sm w-32" onClick={e => e.stopPropagation()}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {allCategories.map(c => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="text-sm text-muted-foreground">{tx.category}</span>
                )}
              </TableCell>
              <TableCell>
                {editingId === tx.id ? (
                  <Input
                    value={editForm.notes}
                    onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="Add note..."
                    className="h-7 text-sm"
                    onClick={e => e.stopPropagation()}
                  />
                ) : (
                  <span className="text-xs text-muted-foreground">{tx.notes || '—'}</span>
                )}
              </TableCell>
              <TableCell className="text-right font-medium">{formatCurrency(scaledAmount(tx))}</TableCell>
            </TableRow>
          ))}
          <TableRow className="font-semibold border-t-2">
            <TableCell colSpan={4}>Total ({filtered.length} transaction{filtered.length !== 1 ? 's' : ''})</TableCell>
            <TableCell className="text-right">{formatCurrency(total)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
      {editingId && (
        <div className="flex justify-end gap-2 p-3 border-t">
          <Button variant="outline" size="sm" onClick={() => setEditingId(null)}>Cancel</Button>
          <Button size="sm" onClick={() => saveEdit(editingId)}>Save</Button>
        </div>
      )}
    </div>
  );
}

export default function Budgets() {
  return (
    <AppLayout>
      <BudgetsContent />
    </AppLayout>
  );
}

