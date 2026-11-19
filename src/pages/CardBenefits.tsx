import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Navigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { formatCurrency } from '@/lib/format';
import { POPULAR_CARDS, CardTemplate, BenefitTemplate, getBenefitTypeLabel, formatBenefitValue, findCardTemplate } from '@/lib/credit-card-data';
import { Plus, CreditCard, Gift, ChevronDown, ChevronRight, Trash2, Check, AlertCircle, TrendingUp, DollarSign, Calendar, Sparkles, RefreshCw, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { format, startOfYear, endOfYear, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, isWithinInterval, parseISO, addMonths } from 'date-fns';

type LinkedAccount = {
  id: string;
  name: string;
  official_name: string | null;
  type: string;
  subtype: string | null;
};

type CreditCard = {
  id: string;
  user_id: string;
  account_id: string | null;
  card_name: string;
  card_issuer: string | null;
  annual_fee: number;
  annual_fee_due_date: string | null;
  created_at: string;
};

type Benefit = {
  id: string;
  credit_card_id: string;
  user_id: string;
  benefit_name: string;
  benefit_type: string;
  benefit_value: number;
  benefit_period: string;
  merchant_keywords: string[] | null;
  category_match: string | null;
  reset_date: string | null;
  notes: string | null;
  is_active: boolean;
};

type BenefitUsage = {
  id: string;
  benefit_id: string;
  transaction_id: string | null;
  amount_used: number;
  usage_date: string;
  period_start: string;
  period_end: string;
};

type Transaction = {
  id: string;
  name: string;
  merchant_name: string | null;
  amount: number;
  date: string;
  category: string | null;
  account_id: string | null;
};

export function CardBenefitsContent() {
  const { user, loading: authLoading } = useAuth();
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [benefits, setBenefits] = useState<Benefit[]>([]);
  const [usage, setUsage] = useState<BenefitUsage[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [linkedAccounts, setLinkedAccounts] = useState<LinkedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoDetecting, setAutoDetecting] = useState(false);
  const [addCardOpen, setAddCardOpen] = useState(false);
  const [addBenefitOpen, setAddBenefitOpen] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  
  // New card form
  const [newCard, setNewCard] = useState({
    card_name: '',
    card_issuer: '',
    annual_fee: '',
    template: '',
  });
  
  // New benefit form
  const [newBenefit, setNewBenefit] = useState({
    benefit_name: '',
    benefit_type: 'credit',
    benefit_value: '',
    benefit_period: 'yearly',
    merchant_keywords: '',
    category_match: '',
    notes: '',
  });

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  async function fetchData() {
    setLoading(true);
    
    const [cardsRes, benefitsRes, usageRes, txRes, accountsRes] = await Promise.all([
      supabase.from('credit_cards').select('*').order('created_at', { ascending: false }),
      supabase.from('credit_card_benefits').select('*').eq('is_active', true),
      supabase.from('benefit_usage').select('*'),
      supabase.from('transactions').select('id, name, merchant_name, amount, date, category, account_id').order('date', { ascending: false }).limit(1000),
      supabase.from('accounts').select('id, name, official_name, type, subtype').eq('type', 'credit').or('is_deleted.is.null,is_deleted.eq.false'),
    ]);
    
    if (cardsRes.data) setCards(cardsRes.data);
    if (benefitsRes.data) setBenefits(benefitsRes.data);
    if (usageRes.data) setUsage(usageRes.data);
    if (txRes.data) setTransactions(txRes.data);
    if (accountsRes.data) setLinkedAccounts(accountsRes.data);
    
    // Auto-expand first card
    if (cardsRes.data && cardsRes.data.length > 0) {
      setExpandedCards(new Set([cardsRes.data[0].id]));
    }
    
    setLoading(false);
  }

  // Find untracked credit card accounts
  const untrackedAccounts = useMemo(() => {
    const trackedAccountIds = new Set(cards.map(c => c.account_id).filter(Boolean));
    return linkedAccounts.filter(acc => !trackedAccountIds.has(acc.id));
  }, [cards, linkedAccounts]);

  // Auto-detect cards from linked accounts
  async function autoDetectCards() {
    if (!user || untrackedAccounts.length === 0) return;
    
    setAutoDetecting(true);
    let addedCount = 0;
    
    for (const account of untrackedAccounts) {
      // Try to match the account name/official_name to a known card template
      const searchName = account.official_name || account.name;
      const template = findCardTemplate(searchName);
      
      // Create the card entry
      const { data: cardData, error: cardError } = await supabase
        .from('credit_cards')
        .insert({
          user_id: user.id,
          account_id: account.id,
          card_name: account.official_name || account.name,
          card_issuer: template?.issuer || null,
          annual_fee: template?.annualFee || 0,
        })
        .select()
        .single();
      
      if (cardError) {
        console.error('Failed to add card for account:', account.name, cardError);
        continue;
      }
      
      // If we found a matching template, add the benefits
      if (template && cardData) {
        const benefitsToInsert = template.benefits.map(b => ({
          credit_card_id: cardData.id,
          user_id: user.id,
          benefit_name: b.name,
          benefit_type: b.type,
          benefit_value: b.value,
          benefit_period: b.period,
          merchant_keywords: b.merchantKeywords || null,
          category_match: b.categoryMatch || null,
          notes: b.description || null,
        }));
        
        await supabase.from('credit_card_benefits').insert(benefitsToInsert);
      }
      
      addedCount++;
    }
    
    setAutoDetecting(false);
    
    if (addedCount > 0) {
      toast.success(`Added ${addedCount} card${addedCount > 1 ? 's' : ''} from your linked accounts`);
      fetchData();
    } else {
      toast.info('No new cards to add');
    }
  }

  // Calculate benefit usage from transactions
  const benefitAnalysis = useMemo(() => {
    const now = new Date();
    const yearStart = startOfYear(now);
    const yearEnd = endOfYear(now);
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);
    
    return benefits.map(benefit => {
      const periodStart = benefit.benefit_period === 'monthly' ? monthStart : yearStart;
      const periodEnd = benefit.benefit_period === 'monthly' ? monthEnd : yearEnd;
      
      // Find matching transactions
      const matchingTxs = transactions.filter(tx => {
        const txDate = parseISO(tx.date);
        if (!isWithinInterval(txDate, { start: periodStart, end: periodEnd })) {
          return false;
        }
        
        // Match by category
        if (benefit.category_match && tx.category) {
          if (tx.category.toLowerCase().includes(benefit.category_match.toLowerCase())) {
            return true;
          }
        }
        
        // Match by merchant keywords
        if (benefit.merchant_keywords && benefit.merchant_keywords.length > 0) {
          const txName = (tx.name + ' ' + (tx.merchant_name || '')).toLowerCase();
          return benefit.merchant_keywords.some(keyword => 
            txName.includes(keyword.toLowerCase())
          );
        }
        
        return false;
      });
      
      // Calculate used amount for credits
      let usedAmount = 0;
      if (benefit.benefit_type === 'credit') {
        usedAmount = matchingTxs.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
        usedAmount = Math.min(usedAmount, benefit.benefit_value); // Cap at benefit value
      }
      
      // Get manually tracked usage
      const manualUsage = usage
        .filter(u => u.benefit_id === benefit.id && 
          isWithinInterval(parseISO(u.usage_date), { start: periodStart, end: periodEnd }))
        .reduce((sum, u) => sum + u.amount_used, 0);
      
      const totalUsed = Math.max(usedAmount, manualUsage);
      const percentUsed = benefit.benefit_type === 'credit' && benefit.benefit_value > 0
        ? Math.min((totalUsed / benefit.benefit_value) * 100, 100)
        : 0;
      
      return {
        benefit,
        matchingTxs,
        usedAmount: totalUsed,
        remainingAmount: benefit.benefit_type === 'credit' ? Math.max(0, benefit.benefit_value - totalUsed) : 0,
        percentUsed,
        periodStart,
        periodEnd,
      };
    });
  }, [benefits, transactions, usage]);

  // Per-period view: each benefit uses its own period (monthly, quarterly, semiannual, yearly)
  const periodBenefitAnalysis = useMemo(() => {
    const now = new Date();

    function getPeriodRange(period: string): { start: Date; end: Date; label: string } {
      switch (period) {
        case 'monthly':
          return { start: startOfMonth(now), end: endOfMonth(now), label: 'This Month' };
        case 'quarterly':
          return { start: startOfQuarter(now), end: endOfQuarter(now), label: 'This Quarter' };
        case 'semiannual': {
          const month = now.getMonth();
          const half = month < 6 ? 0 : 1;
          const start = new Date(now.getFullYear(), half * 6, 1);
          const end = new Date(now.getFullYear(), half * 6 + 6, 0, 23, 59, 59);
          return { start, end, label: half === 0 ? 'Jan–Jun' : 'Jul–Dec' };
        }
        default: // yearly
          return { start: startOfYear(now), end: endOfYear(now), label: 'This Year' };
      }
    }

    return benefits
      .filter(b => b.benefit_type === 'credit')
      .map(benefit => {
        const { start: periodStart, end: periodEnd, label: periodLabel } = getPeriodRange(benefit.benefit_period);

        const matchingTxs = transactions.filter(tx => {
          const txDate = parseISO(tx.date);
          if (!isWithinInterval(txDate, { start: periodStart, end: periodEnd })) return false;
          if (benefit.category_match && tx.category) {
            if (tx.category.toLowerCase().includes(benefit.category_match.toLowerCase())) return true;
          }
          if (benefit.merchant_keywords && benefit.merchant_keywords.length > 0) {
            const txName = (tx.name + ' ' + (tx.merchant_name || '')).toLowerCase();
            return benefit.merchant_keywords.some(kw => txName.includes(kw.toLowerCase()));
          }
          return false;
        });

        let usedAmount = matchingTxs.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
        usedAmount = Math.min(usedAmount, benefit.benefit_value);

        const manualUsage = usage
          .filter(u => u.benefit_id === benefit.id &&
            isWithinInterval(parseISO(u.usage_date), { start: periodStart, end: periodEnd }))
          .reduce((sum, u) => sum + u.amount_used, 0);

        const totalUsed = Math.max(usedAmount, manualUsage);
        const percentUsed = benefit.benefit_value > 0 ? Math.min((totalUsed / benefit.benefit_value) * 100, 100) : 0;

        return { benefit, matchingTxs, usedAmount: totalUsed, remainingAmount: Math.max(0, benefit.benefit_value - totalUsed), percentUsed, periodLabel };
      });
  }, [benefits, transactions, usage]);

  // Summary stats
  const stats = useMemo(() => {
    const creditBenefits = benefitAnalysis.filter(b => b.benefit.benefit_type === 'credit');
    const totalCreditValue = creditBenefits.reduce((sum, b) => sum + b.benefit.benefit_value, 0);
    const totalCreditUsed = creditBenefits.reduce((sum, b) => sum + b.usedAmount, 0);
    const unusedCredits = creditBenefits.filter(b => b.percentUsed < 50);
    const totalAnnualFees = cards.reduce((sum, c) => sum + (c.annual_fee || 0), 0);
    
    return {
      totalCreditValue,
      totalCreditUsed,
      totalRemaining: totalCreditValue - totalCreditUsed,
      unusedCount: unusedCredits.length,
      totalAnnualFees,
      netValue: totalCreditUsed - totalAnnualFees,
    };
  }, [benefitAnalysis, cards]);

  async function handleAddCard(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    
    // Create the card
    const { data: cardData, error: cardError } = await supabase
      .from('credit_cards')
      .insert({
        user_id: user.id,
        card_name: newCard.card_name,
        card_issuer: newCard.card_issuer || null,
        annual_fee: parseFloat(newCard.annual_fee) || 0,
      })
      .select()
      .single();
    
    if (cardError) {
      toast.error('Failed to add card');
      return;
    }
    
    // If template selected, add benefits
    if (newCard.template) {
      const template = POPULAR_CARDS.find(c => c.name === newCard.template);
      if (template) {
        const benefitsToInsert = template.benefits.map(b => ({
          credit_card_id: cardData.id,
          user_id: user.id,
          benefit_name: b.name,
          benefit_type: b.type,
          benefit_value: b.value,
          benefit_period: b.period,
          merchant_keywords: b.merchantKeywords || null,
          category_match: b.categoryMatch || null,
          notes: b.description || null,
        }));
        
        await supabase.from('credit_card_benefits').insert(benefitsToInsert);
      }
    }
    
    toast.success('Card added successfully');
    setAddCardOpen(false);
    setNewCard({ card_name: '', card_issuer: '', annual_fee: '', template: '' });
    fetchData();
  }

  async function handleAddBenefit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !selectedCardId) return;
    
    const keywords = newBenefit.merchant_keywords
      .split(',')
      .map(k => k.trim())
      .filter(k => k.length > 0);
    
    const { error } = await supabase.from('credit_card_benefits').insert({
      credit_card_id: selectedCardId,
      user_id: user.id,
      benefit_name: newBenefit.benefit_name,
      benefit_type: newBenefit.benefit_type,
      benefit_value: parseFloat(newBenefit.benefit_value) || 0,
      benefit_period: newBenefit.benefit_period,
      merchant_keywords: keywords.length > 0 ? keywords : null,
      category_match: newBenefit.category_match || null,
      notes: newBenefit.notes || null,
    });
    
    if (error) {
      toast.error('Failed to add benefit');
    } else {
      toast.success('Benefit added');
      setAddBenefitOpen(false);
      setNewBenefit({
        benefit_name: '',
        benefit_type: 'credit',
        benefit_value: '',
        benefit_period: 'yearly',
        merchant_keywords: '',
        category_match: '',
        notes: '',
      });
      fetchData();
    }
  }

  async function deleteCard(cardId: string) {
    const { error } = await supabase.from('credit_cards').delete().eq('id', cardId);
    if (error) {
      toast.error('Failed to delete card');
    } else {
      toast.success('Card deleted');
      fetchData();
    }
  }

  async function deleteBenefit(benefitId: string) {
    const { error } = await supabase.from('credit_card_benefits').delete().eq('id', benefitId);
    if (error) {
      toast.error('Failed to delete benefit');
    } else {
      toast.success('Benefit deleted');
      fetchData();
    }
  }

  function handleTemplateChange(templateName: string) {
    const template = POPULAR_CARDS.find(c => c.name === templateName);
    if (template) {
      setNewCard({
        ...newCard,
        template: templateName,
        card_name: template.name,
        card_issuer: template.issuer,
        annual_fee: String(template.annualFee),
      });
    }
  }

  function toggleCardExpanded(cardId: string) {
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(cardId)) {
        next.delete(cardId);
      } else {
        next.add(cardId);
      }
      return next;
    });
  }

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-pulse">Loading...</div></div>;
  }

  if (!user) return <Navigate to="/auth" replace />;

  const periodOrder: Record<string, number> = { monthly: 0, quarterly: 1, semiannual: 2, yearly: 3, one_time: 4 };
  const cardBenefitsMap = benefits.reduce((acc, b) => {
    if (!acc[b.credit_card_id]) acc[b.credit_card_id] = [];
    acc[b.credit_card_id].push(b);
    return acc;
  }, {} as Record<string, Benefit[]>);
  // Sort each card's benefits by period duration
  Object.values(cardBenefitsMap).forEach(arr =>
    arr.sort((a, b) => (periodOrder[a.benefit_period] ?? 99) - (periodOrder[b.benefit_period] ?? 99))
  );

  return (
    <>
      <PageHeader
        title="Card Benefits"
        description="Track benefits used and fees. Template terms may be outdated; verify current issuer terms. Usage windows vary by benefit, so the fee comparison is not an annualized return."
        actions={
          <div className="flex gap-2">
            {untrackedAccounts.length > 0 && (
              <Button 
                variant="outline" 
                onClick={autoDetectCards} 
                disabled={autoDetecting}
              >
                {autoDetecting ? (
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Zap className="w-4 h-4 mr-2" />
                )}
                Auto-Detect ({untrackedAccounts.length})
              </Button>
            )}
            <Dialog open={addCardOpen} onOpenChange={setAddCardOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="w-4 h-4 mr-2" />Add Card</Button>
              </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Add Credit Card</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleAddCard} className="space-y-4">
                <div className="space-y-2">
                  <Label>Start from Template (Optional)</Label>
                  <Select value={newCard.template} onValueChange={handleTemplateChange}>
                    <SelectTrigger><SelectValue placeholder="Select a popular card..." /></SelectTrigger>
                    <SelectContent>
                      <ScrollArea className="h-[200px]">
                        {POPULAR_CARDS.map(card => (
                          <SelectItem key={card.name} value={card.name}>
                            {card.name} ({card.issuer})
                          </SelectItem>
                        ))}
                      </ScrollArea>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Card Name</Label>
                  <Input
                    value={newCard.card_name}
                    onChange={e => setNewCard({ ...newCard, card_name: e.target.value })}
                    placeholder="e.g., Chase Sapphire Preferred"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Card Issuer</Label>
                  <Input
                    value={newCard.card_issuer}
                    onChange={e => setNewCard({ ...newCard, card_issuer: e.target.value })}
                    placeholder="e.g., Chase"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Annual Fee</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={newCard.annual_fee}
                    onChange={e => setNewCard({ ...newCard, annual_fee: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
                <Button type="submit" className="w-full">Add Card</Button>
              </form>
            </DialogContent>
          </Dialog>
          </div>
        }
      />

      {loading ? (
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      ) : (
        <div className="space-y-6">
          {/* Summary Stats */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Gift className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Credits</p>
                    <p className="text-2xl font-bold">{formatCurrency(stats.totalCreditValue)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
                    <Check className="w-5 h-5 text-success" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Used</p>
                    <p className="text-2xl font-bold">{formatCurrency(stats.totalCreditUsed)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center">
                    <AlertCircle className="w-5 h-5 text-warning" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Remaining</p>
                    <p className="text-2xl font-bold">{formatCurrency(stats.totalRemaining)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
                    <DollarSign className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Tracked credits less annual fees</p>
                    <p className={`text-2xl font-bold ${stats.netValue >= 0 ? 'text-success' : 'text-destructive'}`}>
                      {formatCurrency(stats.netValue)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Credit Usage Tracking */}
          {periodBenefitAnalysis.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Credit Usage</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {periodBenefitAnalysis
                  .sort((a, b) => (periodOrder[a.benefit.benefit_period] ?? 99) - (periodOrder[b.benefit.benefit_period] ?? 99) || a.percentUsed - b.percentUsed)
                  .map((item) => {
                    const card = cards.find(c => c.id === item.benefit.credit_card_id);
                    return (
                      <div key={item.benefit.id} className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <div>
                            <span className="font-medium">{item.benefit.benefit_name}</span>
                            <span className="text-muted-foreground ml-2">({card?.card_name})</span>
                            <Badge variant="outline" className="ml-2 text-xs">{item.periodLabel}</Badge>
                          </div>
                          <div className="text-right">
                            <span className={item.percentUsed >= 100 ? 'text-success' : item.percentUsed < 50 ? 'text-warning' : ''}>
                              {formatCurrency(item.usedAmount)}
                            </span>
                            <span className="text-muted-foreground"> / {formatCurrency(item.benefit.benefit_value)}</span>
                          </div>
                        </div>
                        <Progress 
                          value={item.percentUsed} 
                          className={`h-2 ${item.percentUsed >= 100 ? '[&>div]:bg-success' : item.percentUsed < 50 ? '[&>div]:bg-warning' : ''}`} 
                        />
                      </div>
                    );
                  })}
              </CardContent>
            </Card>
          )}

          {/* Unused Benefits */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-warning" />
                Unused Benefits
              </CardTitle>
            </CardHeader>
            <CardContent>
              {benefitAnalysis.filter(b => b.benefit.benefit_type === 'credit' && b.percentUsed < 100).length === 0 ? (
                <p className="text-center text-muted-foreground py-6">
                  <Check className="w-8 h-8 mx-auto mb-2 text-success" />
                  You've used all your credit benefits this period.
                </p>
              ) : (
                <div className="space-y-3">
                  {benefitAnalysis
                    .filter(b => b.benefit.benefit_type === 'credit' && b.percentUsed < 100)
                    .sort((a, b) => b.remainingAmount - a.remainingAmount)
                    .map(({ benefit, remainingAmount }) => {
                      const card = cards.find(c => c.id === benefit.credit_card_id);
                      return (
                        <div key={benefit.id} className="p-4 rounded-lg border border-warning/30 bg-warning/5">
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="font-medium">{benefit.benefit_name}</p>
                              <p className="text-sm text-muted-foreground">{card?.card_name}</p>
                            </div>
                            <Badge variant="outline" className="text-warning border-warning/40">
                              {formatCurrency(remainingAmount)} left
                            </Badge>
                          </div>
                          {benefit.merchant_keywords && benefit.merchant_keywords.length > 0 && (
                            <p className="text-sm mt-2">
                              <span className="text-muted-foreground">Use at: </span>
                              {benefit.merchant_keywords.join(', ')}
                            </p>
                          )}
                          {benefit.notes && (
                            <p className="text-sm text-muted-foreground mt-1">{benefit.notes}</p>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Matched Transactions */}
          {benefitAnalysis.some(b => b.matchingTxs.length > 0) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-success" />
                  Matched Transactions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {benefitAnalysis
                    .flatMap(({ benefit, matchingTxs }) => 
                      matchingTxs.slice(0, 5).map(tx => ({ benefit, tx }))
                    )
                    .slice(0, 10)
                    .map(({ benefit, tx }) => {
                      const card = cards.find(c => c.id === benefit.credit_card_id);
                      return (
                        <div key={`${benefit.id}-${tx.id}`} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                          <div>
                            <p className="font-medium text-sm">{tx.merchant_name || tx.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {format(parseISO(tx.date), 'MMM d, yyyy')} · {benefit.benefit_name} ({card?.card_name})
                            </p>
                          </div>
                          <span className="font-medium">{formatCurrency(Math.abs(tx.amount))}</span>
                        </div>
                      );
                    })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* My Cards */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">My Cards</h2>
            {cards.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <CreditCard className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">No cards added yet</h3>
                  <p className="text-muted-foreground mb-6">Add your credit cards to start tracking benefits</p>
                  <Button onClick={() => setAddCardOpen(true)}>
                    <Plus className="w-4 h-4 mr-2" />Add Your First Card
                  </Button>
                </CardContent>
              </Card>
            ) : (
              cards.map(card => {
                const cardBenefits = cardBenefitsMap[card.id] || [];
                const isExpanded = expandedCards.has(card.id);
                
                return (
                  <Collapsible key={card.id} open={isExpanded} onOpenChange={() => toggleCardExpanded(card.id)}>
                    <Card>
                      <CollapsibleTrigger asChild>
                        <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                                <CreditCard className="w-5 h-5 text-primary" />
                              </div>
                              <div>
                                <CardTitle className="text-base">{card.card_name}</CardTitle>
                                <CardDescription>
                                  {card.card_issuer && <span>{card.card_issuer} · </span>}
                                  {card.annual_fee > 0 ? `$${card.annual_fee}/year` : 'No annual fee'}
                                  {' · '}{cardBenefits.length} benefits
                                </CardDescription>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={(e) => { e.stopPropagation(); deleteCard(card.id); }}
                              >
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                              {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                            </div>
                          </div>
                        </CardHeader>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <CardContent className="pt-0">
                          <div className="border-t pt-4 space-y-3">
                            {cardBenefits.length === 0 ? (
                              <p className="text-sm text-muted-foreground text-center py-4">No benefits added yet</p>
                            ) : (
                              cardBenefits.map(benefit => {
                                const analysis = benefitAnalysis.find(a => a.benefit.id === benefit.id);
                                return (
                                  <div key={benefit.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 group">
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2">
                                        <span className="font-medium text-sm">{benefit.benefit_name}</span>
                                        <Badge variant="secondary" className="text-xs">
                                          {getBenefitTypeLabel(benefit.benefit_type)}
                                        </Badge>
                                      </div>
                                      <div className="text-sm text-muted-foreground mt-1">
                                        <span className="font-medium text-foreground">
                                          {formatBenefitValue(benefit.benefit_type, benefit.benefit_value)}
                                        </span>
                                        {' · '}{benefit.benefit_period}
                                        {benefit.merchant_keywords && benefit.merchant_keywords.length > 0 && (
                                          <span> · Matches: {benefit.merchant_keywords.slice(0, 3).join(', ')}{benefit.merchant_keywords.length > 3 ? '...' : ''}</span>
                                        )}
                                        {benefit.category_match && <span> · Category: {benefit.category_match}</span>}
                                      </div>
                                      {analysis && benefit.benefit_type === 'credit' && (
                                        <div className="mt-2">
                                          <Progress value={analysis.percentUsed} className="h-1.5" />
                                          <p className="text-xs text-muted-foreground mt-1">
                                            {formatCurrency(analysis.usedAmount)} used · {formatCurrency(analysis.remainingAmount)} remaining
                                          </p>
                                        </div>
                                      )}
                                    </div>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                                      onClick={() => deleteBenefit(benefit.id)}
                                    >
                                      <Trash2 className="w-4 h-4 text-destructive" />
                                    </Button>
                                  </div>
                                );
                              })
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full"
                              onClick={() => { setSelectedCardId(card.id); setAddBenefitOpen(true); }}
                            >
                              <Plus className="w-4 h-4 mr-2" />Add Benefit
                            </Button>
                          </div>
                        </CardContent>
                      </CollapsibleContent>
                    </Card>
                  </Collapsible>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Add Benefit Dialog */}
      <Dialog open={addBenefitOpen} onOpenChange={setAddBenefitOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Benefit</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddBenefit} className="space-y-4">
            <div className="space-y-2">
              <Label>Benefit Name</Label>
              <Input
                value={newBenefit.benefit_name}
                onChange={e => setNewBenefit({ ...newBenefit, benefit_name: e.target.value })}
                placeholder="e.g., $200 Travel Credit"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={newBenefit.benefit_type} onValueChange={v => setNewBenefit({ ...newBenefit, benefit_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="credit">Statement Credit</SelectItem>
                    <SelectItem value="cashback">Cash Back %</SelectItem>
                    <SelectItem value="points_multiplier">Points Multiplier</SelectItem>
                    <SelectItem value="discount">Discount %</SelectItem>
                    <SelectItem value="perk">Perk</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Value</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={newBenefit.benefit_value}
                  onChange={e => setNewBenefit({ ...newBenefit, benefit_value: e.target.value })}
                  placeholder={newBenefit.benefit_type === 'credit' ? '200' : '3'}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Period</Label>
              <Select value={newBenefit.benefit_period} onValueChange={v => setNewBenefit({ ...newBenefit, benefit_period: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="semiannual">Semiannual</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                  <SelectItem value="one_time">One-time</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Merchant Keywords (comma-separated)</Label>
              <Input
                value={newBenefit.merchant_keywords}
                onChange={e => setNewBenefit({ ...newBenefit, merchant_keywords: e.target.value })}
                placeholder="e.g., uber, lyft, doordash"
              />
            </div>
            <div className="space-y-2">
              <Label>Category Match</Label>
              <Input
                value={newBenefit.category_match}
                onChange={e => setNewBenefit({ ...newBenefit, category_match: e.target.value })}
                placeholder="e.g., Travel, Restaurants"
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Input
                value={newBenefit.notes}
                onChange={e => setNewBenefit({ ...newBenefit, notes: e.target.value })}
                placeholder="e.g., $15/month + $20 in December"
              />
            </div>
            <Button type="submit" className="w-full">Add Benefit</Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function CardBenefits() {
  return (
    <AppLayout>
      <CardBenefitsContent />
    </AppLayout>
  );
}

