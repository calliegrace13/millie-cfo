import {confirmAction} from '@/components/ui/confirm-action';
import {RuleReview} from '@/components/RuleReview';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Edit2, Zap, Sparkles, Check } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { TransactionRule, CashFlowCategory, AmortizationType, IncomeType } from '@/lib/types';
import { toast } from 'sonner';
import { Navigate } from 'react-router-dom';

const DEFAULT_CATEGORIES = [
  'Food & Dining', 'Shopping', 'Transportation', 'Bills & Utilities',
  'Entertainment', 'Healthcare', 'Travel', 'Income', 'Transfer', 'Other'
];

export function TransactionRulesContent() {
  const { user, loading: authLoading } = useAuth();
  const [rules, setRules] = useState<TransactionRule[]>([]);
  const [customCategories, setCustomCategories] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<TransactionRule | null>(null);
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<Array<{
    match_text: string;
    category: string;
    cash_flow_type: string;
    is_one_time_expense: boolean;
    income_type: string | null;
    count: number;
    overrideCount: number;
    selected: boolean;
  }>>([]);
  const [generatingRules, setGeneratingRules] = useState(false);
  const [form, setForm] = useState({
    name: '',
    match_text: '',
    match_type: 'contains' as 'contains' | 'starts_with' | 'exact',
    category: '',
    cash_flow_type: '' as CashFlowCategory | '',
    is_one_time_expense: false,
    amortize_months: '',
    amortize_type: '' as AmortizationType | '',
    income_type: '' as IncomeType | '',
    priority: '0',
  });

  useEffect(() => {
    if (user) fetchData();
  }, [user]);

  const allCategories = [...DEFAULT_CATEGORIES, ...customCategories.map(c => c.name)];

  async function fetchData() {
    const [rulesRes, catRes] = await Promise.all([
      supabase.from('transaction_rules').select('*').order('priority', { ascending: false }),
      supabase.from('transaction_categories').select('id, name')
    ]);
    if (rulesRes.data) setRules(rulesRes.data as TransactionRule[]);
    if (catRes.data) setCustomCategories(catRes.data);
    setLoading(false);
  }

  function resetForm() {
    setForm({
      name: '',
      match_text: '',
      match_type: 'contains',
      category: '',
      cash_flow_type: '',
      is_one_time_expense: false,
      amortize_months: '',
      amortize_type: '',
      income_type: '',
      priority: '0',
    });
    setEditingRule(null);
  }

  function openEdit(rule: TransactionRule) {
    setEditingRule(rule);
    setForm({
      name: rule.name,
      match_text: rule.match_text,
      match_type: rule.match_type,
      category: rule.category || '',
      cash_flow_type: rule.cash_flow_type || '',
      is_one_time_expense: rule.is_one_time_expense,
      amortize_months: rule.amortize_months?.toString() || '',
      amortize_type: rule.amortize_type || '',
      income_type: rule.income_type || '',
      priority: rule.priority.toString(),
    });
    setDialogOpen(true);
  }

  async function saveRule(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    const ruleData = {
      user_id: user.id,
      name: form.name.trim(),
      match_text: form.match_text.trim().toLowerCase(),
      match_type: form.match_type,
      category: form.category || null,
      cash_flow_type: form.cash_flow_type || null,
      is_one_time_expense: form.is_one_time_expense,
      amortize_months: form.amortize_months ? parseInt(form.amortize_months) : null,
      amortize_type: form.amortize_type || null,
      income_type: form.income_type || null,
      priority: parseInt(form.priority) || 0,
    };

    if (editingRule) {
      const { error } = await supabase
        .from('transaction_rules')
        .update(ruleData)
        .eq('id', editingRule.id);

      if (error) {
        toast.error('Failed to update rule');
      } else {
        toast.success('Rule updated');
        setDialogOpen(false);
        resetForm();
        fetchData();
      }
    } else {
      const { error } = await supabase
        .from('transaction_rules')
        .insert(ruleData);

      if (error) {
        toast.error('Failed to create rule');
      } else {
        toast.success('Rule created');
        setDialogOpen(false);
        resetForm();
        fetchData();
      }
    }
  }

  async function deleteRule(id: string) {
    if (!await confirmAction('Delete this rule?')) return;
    const { error } = await supabase.from('transaction_rules').delete().eq('id', id);
    if (error) {
      toast.error('Failed to delete rule');
    } else {
      toast.success('Rule deleted');
      fetchData();
    }
  }

  async function toggleActive(rule: TransactionRule) {
    const { error } = await supabase
      .from('transaction_rules')
      .update({ is_active: !rule.is_active })
      .eq('id', rule.id);

    if (!error) {
      setRules(prev => prev.map(r => r.id === rule.id ? { ...r, is_active: !r.is_active } : r));
    }
  }

  async function generateSuggestionsFromTransactions() {
    if (!user) return;
    setGeneratingRules(true);
    setGenerateDialogOpen(true);

    // Fetch transactions with categories assigned
    const { data: transactions, error } = await supabase
      .from('transactions')
      .select('name, merchant_name, category, cash_flow_type, is_one_time_expense, income_type')
      .not('category', 'is', null);

    if (error || !transactions) {
      toast.error('Failed to fetch transactions');
      setGeneratingRules(false);
      return;
    }

    // Group by merchant_name or cleaned transaction name
    type PatternData = {
      category: string;
      cash_flow_type: string;
      is_one_time_expense: boolean;
      income_type: string | null;
      count: number;
      overrideCount: number; // how many had non-default settings
    };
    const patterns = new Map<string, PatternData>();
    
    for (const tx of transactions) {
      // Prefer merchant_name, fall back to cleaned transaction name
      let key = tx.merchant_name?.toLowerCase().trim();
      if (!key) {
        // Clean transaction name - remove numbers, dates, IDs
        key = tx.name
          .toLowerCase()
          .replace(/\d{2,}/g, '') // Remove numbers with 2+ digits
          .replace(/[#*]/g, '')
          .trim()
          .split(/\s+/)
          .slice(0, 3) // Take first 3 words
          .join(' ')
          .trim();
      }
      
      if (!key || key.length < 3) continue;

      // Detect if user has overridden the category
      const hasOverride = !!tx.category && tx.category.trim() !== '';

      const existing = patterns.get(key);
      if (existing) {
        existing.count++;
        if (hasOverride) {
          existing.overrideCount++;
          // Prefer the overridden category
          existing.category = tx.category || existing.category;
        }
      } else {
        patterns.set(key, {
          category: tx.category || '',
          cash_flow_type: tx.cash_flow_type || '',
          is_one_time_expense: tx.is_one_time_expense || false,
          income_type: tx.income_type || null,
          count: 1,
          overrideCount: hasOverride ? 1 : 0,
        });
      }
    }

    // Filter to patterns with 2+ occurrences and not already covered by existing rules
    // Prioritize patterns where user has overridden defaults (indicating incorrect auto-classification)
    const existingMatchTexts = new Set(rules.map(r => r.match_text.toLowerCase()));
    
    const suggestedRules = Array.from(patterns.entries())
      .filter(([key, data]) => data.count >= 2 && !existingMatchTexts.has(key))
      .map(([key, data]) => ({
        match_text: key,
        category: data.category,
        cash_flow_type: data.cash_flow_type,
        is_one_time_expense: data.is_one_time_expense,
        income_type: data.income_type,
        count: data.count,
        overrideCount: data.overrideCount,
        selected: data.overrideCount > 0, // Auto-select ones with overrides
      }))
      .sort((a, b) => {
        // Sort overridden patterns first, then by count
        if (b.overrideCount !== a.overrideCount) return b.overrideCount - a.overrideCount;
        return b.count - a.count;
      })
      .slice(0, 30);

    setSuggestions(suggestedRules);
    setGeneratingRules(false);
  }

  function toggleSuggestion(index: number) {
    setSuggestions(prev => prev.map((s, i) => 
      i === index ? { ...s, selected: !s.selected } : s
    ));
  }

  async function createSelectedRules() {
    if (!user) return;
    
    const selected = suggestions.filter(s => s.selected);
    if (selected.length === 0) {
      toast.error('No rules selected');
      return;
    }

    const rulesToCreate = selected.map((s, i) => ({
      user_id: user.id,
      name: s.match_text.charAt(0).toUpperCase() + s.match_text.slice(1),
      match_text: s.match_text,
      match_type: 'contains',
      category: s.category || null,
      cash_flow_type: s.cash_flow_type || null,
      is_one_time_expense: s.is_one_time_expense || false,
      income_type: s.income_type || null,
      priority: selected.length - i,
    }));

    const { error } = await supabase.from('transaction_rules').insert(rulesToCreate);
    
    if (error) {
      toast.error('Failed to create rules');
    } else {
      toast.success(`Created ${selected.length} rules`);
      setGenerateDialogOpen(false);
      setSuggestions([]);
      fetchData();
    }
  }

  if (authLoading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-pulse">Loading...</div></div>;
  if (!user) return <Navigate to="/auth" replace />;

  return (
    <>
      <PageHeader
        title="Transaction Rules"
        description="Automatically categorize and classify transactions"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={generateSuggestionsFromTransactions}>
              <Sparkles className="w-4 h-4 mr-2" />
              Generate from Transactions
            </Button>

            <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
              <DialogTrigger asChild>
                <Button><Plus className="w-4 h-4 mr-2" />Add Rule</Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>{editingRule ? 'Edit Rule' : 'Create Rule'}</DialogTitle>
                </DialogHeader>
                <form onSubmit={saveRule} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Rule Name</Label>
                    <Input 
                      placeholder="e.g., Amazon purchases" 
                      value={form.name} 
                      onChange={(e) => setForm({ ...form, name: e.target.value })} 
                      required 
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Match Text(s)</Label>
                      <Input 
                        placeholder="e.g., amazon, amzn, prime" 
                        value={form.match_text} 
                        onChange={(e) => setForm({ ...form, match_text: e.target.value })} 
                        required 
                      />
                      <p className="text-xs text-muted-foreground">Separate multiple phrases with commas</p>
                    </div>
                    <div className="space-y-2">
                      <Label>Match Type</Label>
                      <Select value={form.match_type} onValueChange={(v) => setForm({ ...form, match_type: v as typeof form.match_type })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="contains">Contains</SelectItem>
                          <SelectItem value="starts_with">Starts with</SelectItem>
                          <SelectItem value="exact">Exact match</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Assign Category</Label>
                    <Select value={form.category || '__none__'} onValueChange={(v) => setForm({ ...form, category: v === '__none__' ? '' : v })}>
                      <SelectTrigger><SelectValue placeholder="No change" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">No change</SelectItem>
                        {allCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Cash Flow Type</Label>
                      <Select value={form.cash_flow_type || '__none__'} onValueChange={(v) => setForm({ ...form, cash_flow_type: v === '__none__' ? '' : v as CashFlowCategory | '' })}>
                        <SelectTrigger><SelectValue placeholder="No change" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">No change</SelectItem>
                          <SelectItem value="operating">Operating</SelectItem>
                          <SelectItem value="investing">Investing</SelectItem>
                          <SelectItem value="financing">Financing</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Income Type</Label>
                      <Select value={form.income_type || '__none__'} onValueChange={(v) => setForm({ ...form, income_type: v === '__none__' ? '' : v as IncomeType | '' })}>
                        <SelectTrigger><SelectValue placeholder="No change" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">No change</SelectItem>
                          <SelectItem value="salary">Salary</SelectItem>
                          <SelectItem value="other">Other Income</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch 
                      checked={form.is_one_time_expense} 
                      onCheckedChange={(c) => setForm({ ...form, is_one_time_expense: c })} 
                    />
                    <Label>Mark as one-time expense</Label>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Amortize (months)</Label>
                      <Input 
                        type="number" 
                        min="2" 
                        max="120" 
                        placeholder="None"
                        value={form.amortize_months} 
                        onChange={(e) => setForm({ ...form, amortize_months: e.target.value })} 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Amortize Type</Label>
                      <Select value={form.amortize_type || '__none__'} onValueChange={(v) => setForm({ ...form, amortize_type: v === '__none__' ? '' : v as AmortizationType | '' })}>
                        <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">None</SelectItem>
                          <SelectItem value="prepaid_expense">Prepaid Expense</SelectItem>
                          <SelectItem value="capital_expenditure">Capital Expenditure</SelectItem>
                          <SelectItem value="intangible_asset">Intangible Asset</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {/* Only show priority if there's potential overlap with existing rules */}
                  {(() => {
                    const matchText = form.match_text.trim().toLowerCase();
                    if (!matchText) return null;
                    const hasOverlap = rules.some(r => {
                      if (editingRule && r.id === editingRule.id) return false;
                      return r.match_text.includes(matchText) || matchText.includes(r.match_text);
                    });
                    if (!hasOverlap) return null;
                    return (
                      <div className="space-y-2">
                        <Label>Priority (higher runs first)</Label>
                        <Input 
                          type="number" 
                          value={form.priority} 
                          onChange={(e) => setForm({ ...form, priority: e.target.value })} 
                        />
                        <p className="text-xs text-muted-foreground">Multiple rules may match the same transaction</p>
                      </div>
                    );
                  })()}
                  <Button type="submit" className="w-full">
                    {editingRule ? 'Update Rule' : 'Create Rule'}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        }
      />
      <RuleReview rules={rules}/>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Loading rules...</div>
      ) : rules.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Zap className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No rules yet</h3>
            <p className="text-muted-foreground mb-4">Create rules to automatically categorize transactions</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rules.map(rule => (
            <Card key={rule.id} className={!rule.is_active ? 'opacity-50' : ''}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-medium">{rule.name}</h3>
                      <Badge variant="outline">{rule.match_type}: "{rule.match_text}"</Badge>
                      {!rule.is_active && <Badge variant="secondary">Disabled</Badge>}
                    </div>
                    <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                      {rule.category && <Badge variant="secondary">→ {rule.category}</Badge>}
                      {rule.cash_flow_type && <Badge variant="secondary">→ {rule.cash_flow_type}</Badge>}
                      {rule.is_one_time_expense && <Badge variant="secondary">One-time</Badge>}
                      {rule.amortize_months && (
                        <Badge variant="secondary">
                          Amortize {rule.amortize_months}mo ({rule.amortize_type})
                        </Badge>
                      )}
                      <span className="text-xs">Priority: {rule.priority}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={rule.is_active} onCheckedChange={() => toggleActive(rule)} />
                    <Button variant="ghost" size="icon" onClick={() => openEdit(rule)}>
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteRule(rule.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Generate Rules Dialog */}
      <Dialog open={generateDialogOpen} onOpenChange={setGenerateDialogOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Generate Rules from Transactions</DialogTitle>
          </DialogHeader>
          {generatingRules ? (
            <div className="py-8 text-center text-muted-foreground">
              Analyzing transactions...
            </div>
          ) : suggestions.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              No patterns found. Categorize more transactions first.
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                {suggestions.map((s, i) => (
                  <div 
                    key={i}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      s.selected ? 'bg-primary/5 border-primary/30' : 'hover:bg-muted/50'
                    }`}
                    onClick={() => toggleSuggestion(i)}
                  >
                    <Checkbox checked={s.selected} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate flex items-center gap-2">
                        "{s.match_text}"
                        {s.overrideCount > 0 && (
                          <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                            {s.overrideCount} override{s.overrideCount > 1 ? 's' : ''}
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground flex gap-2 flex-wrap">
                        {s.category && <Badge variant="secondary">{s.category}</Badge>}
                        {s.cash_flow_type && s.cash_flow_type !== 'operating' && <Badge variant="outline">{s.cash_flow_type}</Badge>}
                        {s.is_one_time_expense && <Badge variant="outline">One-time</Badge>}
                        {s.income_type && <Badge variant="outline">{s.income_type}</Badge>}
                        <span>{s.count} transactions</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-between items-center pt-4 border-t">
                <span className="text-sm text-muted-foreground">
                  {suggestions.filter(s => s.selected).length} of {suggestions.length} selected
                </span>
                <Button onClick={createSelectedRules} disabled={!suggestions.some(s => s.selected)}>
                  <Check className="w-4 h-4 mr-2" />
                  Create Rules
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function TransactionRules() {
  return (
    <AppLayout>
      <TransactionRulesContent />
    </AppLayout>
  );
}

