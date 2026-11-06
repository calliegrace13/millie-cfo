import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { logError } from '@/lib/logging';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useDebounce } from '@/hooks/useDebounce';
import { useOwnership } from '@/hooks/useOwnership';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/format';
import { Plus, Search, Filter, RefreshCw, Clock, PlusCircle, AlertCircle, CheckCircle2 } from 'lucide-react';
import type { Event, TransactionEvent as TxEvent } from '@/lib/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Transaction, Account, CashFlowCategory, AmortizationType, IncomeType } from '@/lib/types';
import { toast } from 'sonner';
import { Navigate } from 'react-router-dom';
import { TransactionRow } from '@/components/transactions/TransactionRow';

const DEFAULT_CATEGORIES = [
  'Food & Dining', 'Shopping', 'Transportation', 'Bills & Utilities',
  'Entertainment', 'Healthcare', 'Travel', 'Income', 'Transfer', 'Other'
];

type CustomCategory = {
  id: string;
  name: string;
  color?: string;
};

const ROW_HEIGHT = 52;
const EXPANDED_ROW_HEIGHT = 160;

export function TransactionsContent() {
  const { user, loading: authLoading } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [customCategories, setCustomCategories] = useState<CustomCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [newCategoryName, setNewCategoryName] = useState('');
const [syncing, setSyncing] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [amortizeDialogOpen, setAmortizeDialogOpen] = useState(false);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [linkTransferDialogTx, setLinkTransferDialogTx] = useState<Transaction | null>(null);
  const [exceptionDialogTx, setExceptionDialogTx] = useState<Transaction | null>(null);
  const [selectedManualAccountId, setSelectedManualAccountId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [accountFilter, setAccountFilter] = useState<Set<string>>(new Set());
  const [amountOp, setAmountOp] = useState<string>('any');
  const [amountValue, setAmountValue] = useState<string>('');
  const [currentTab, setCurrentTab] = useState<'all' | 'review'>('review');
  const [expandedTxId, setExpandedTxId] = useState<string | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [transactionEvents, setTransactionEvents] = useState<TxEvent[]>([]);
  const [offsets, setOffsets] = useState<{ id: string; parent_transaction_id: string; offset_transaction_id: string }[]>([]);
  
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1); // First day of current month
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [newTx, setNewTx] = useState({
    name: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    recognition_date: '',
    category: '',
    account_id: '',
    cash_flow_type: 'operating' as CashFlowCategory,
    is_one_time_expense: false,
  });
  const [amortizeForm, setAmortizeForm] = useState({
    type: 'prepaid_expense' as AmortizationType,
    months: '12',
    start_date: '',
  });

  const parentRef = useRef<HTMLDivElement>(null);
  
  // Debounce search for better performance
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  useEffect(() => {
    if (user) fetchData();
  }, [user]);

  // Combine default and custom categories - memoized
  const allCategories = useMemo(() => 
    [...DEFAULT_CATEGORIES, ...customCategories.map(c => c.name)],
    [customCategories]
  );

  // Memoize month options
  const monthOptions = useMemo(() => {
    const options: { value: string; label: string }[] = [];
    const now = new Date();
    for (let i = -24; i <= 12; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const label = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      options.push({ value, label });
    }
    return options;
  }, []);

  const isUnlinkedTransfer = useCallback((tx: Transaction): boolean => {
    return tx.category === 'Transfer' && !tx.linked_transfer_id && !tx.is_transfer_exception;
  }, []);

  // Memoize unlinked transfer count
  const unlinkedTransferCount = useMemo(() => 
    transactions.filter(tx => isUnlinkedTransfer(tx)).length,
    [transactions, isUnlinkedTransfer]
  );

  // Date range preset helper
  const setDatePreset = useCallback((preset: string) => {
    const today = new Date();
    let start: Date;
    let end: Date = today;

    switch (preset) {
      case 'today':
        start = today;
        break;
      case 'last7':
        start = new Date(today);
        start.setDate(start.getDate() - 7);
        break;
      case 'last30':
        start = new Date(today);
        start.setDate(start.getDate() - 30);
        break;
      case 'thisMonth':
        start = new Date(today.getFullYear(), today.getMonth(), 1);
        break;
      case 'lastMonth':
        start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        end = new Date(today.getFullYear(), today.getMonth(), 0);
        break;
      case 'thisQuarter':
        const currentQuarter = Math.floor(today.getMonth() / 3);
        start = new Date(today.getFullYear(), currentQuarter * 3, 1);
        break;
      case 'thisYear':
        start = new Date(today.getFullYear(), 0, 1);
        break;
      case 'lastYear':
        start = new Date(today.getFullYear() - 1, 0, 1);
        end = new Date(today.getFullYear() - 1, 11, 31);
        break;
      default:
        return;
    }

    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
  }, []);

  // Offset child IDs (needed before filtered memo)
  const offsetChildIds = useMemo(() => new Set(offsets.map(o => o.offset_transaction_id)), [offsets]);

  // Memoize filtered transactions with debounced search
  const filtered = useMemo(() => {
    return transactions.filter(tx => {
      // Hide offset child transactions (they merge into parent)
      if (offsetChildIds.has(tx.id)) return false;
      // Review tab filter
      if (currentTab === 'review' && !tx.needs_review) return false;

      // Search across all relevant fields including amount (exact and rounded)
      const searchLower = debouncedSearchQuery.toLowerCase();
      const searchNum = parseFloat(debouncedSearchQuery.replace(/[,$]/g, ''));
      const absAmount = Math.abs(tx.amount);
      const matchesAmount = !isNaN(searchNum) && (
        absAmount === searchNum ||
        Math.round(absAmount) === Math.round(searchNum) ||
        absAmount.toFixed(2).includes(debouncedSearchQuery) ||
        Math.round(absAmount).toString() === Math.round(searchNum).toString()
      );
      const matchesSearch = !debouncedSearchQuery || 
        tx.name.toLowerCase().includes(searchLower) ||
        tx.merchant_name?.toLowerCase().includes(searchLower) ||
        tx.category?.toLowerCase().includes(searchLower) ||
        tx.account_name?.toLowerCase().includes(searchLower) ||
        tx.notes?.toLowerCase().includes(searchLower) ||
        tx.subcategory?.toLowerCase().includes(searchLower) ||
        matchesAmount;
      
      // Handle special unlinked transfers filter
      if (categoryFilter === '__unlinked_transfers__') {
      const matchesAccount = accountFilter.size === 0 || (tx.account_id ? accountFilter.has(tx.account_id) : false);
        return matchesSearch && matchesAccount && isUnlinkedTransfer(tx);
      }
      
      const matchesCategory = categoryFilter === 'all' || tx.category === categoryFilter;
      const matchesAccount = accountFilter.size === 0 || (tx.account_id ? accountFilter.has(tx.account_id) : false);
      
      // Amount filter
      const amountNum = parseFloat(amountValue);
      let matchesAmountFilter = true;
      if (amountOp !== 'any' && !isNaN(amountNum)) {
        const abs = Math.abs(tx.amount);
        switch (amountOp) {
          case 'gt': matchesAmountFilter = abs > amountNum; break;
          case 'gte': matchesAmountFilter = abs >= amountNum; break;
          case 'lt': matchesAmountFilter = abs < amountNum; break;
          case 'lte': matchesAmountFilter = abs <= amountNum; break;
          case 'eq': matchesAmountFilter = Math.abs(abs - amountNum) < 0.01; break;
        }
      }

      // Date range filter (skip for review tab to show all pending reviews)
      const matchesDate = currentTab === 'review' || (tx.date >= startDate && tx.date <= endDate);
      return matchesSearch && matchesCategory && matchesAccount && matchesDate && matchesAmountFilter;
    });
  }, [transactions, debouncedSearchQuery, categoryFilter, accountFilter, startDate, endDate, isUnlinkedTransfer, currentTab, offsetChildIds, amountOp, amountValue]);

  // Virtualizer for large lists
  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      const tx = filtered[index];
      if (!tx || tx.id !== expandedTxId) return ROW_HEIGHT;
      // Base expanded height: compact row + action buttons
      let height = EXPANDED_ROW_HEIGHT;
      // Add height for transfer section if it's a transfer
      if (tx.category === 'Transfer') height += 40;
      return height;
    },
    overscan: 5,
  });

  // Re-measure when expanded row or offsets change
  useEffect(() => {
    rowVirtualizer.measure();
  }, [expandedTxId, offsets]);

  async function fetchData() {
    const PAGE_SIZE = 1000;

    async function fetchAllTransactions(): Promise<Transaction[]> {
      const all: Transaction[] = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await supabase
          .from('transactions')
          .select('*')
          .order('date', { ascending: false })
          .range(from, from + PAGE_SIZE - 1);

        if (error) throw error;
        const batch = (data || []) as Transaction[];
        all.push(...batch);
        if (batch.length < PAGE_SIZE) break;
      }
      return all;
    }

    try {
      const [txData, accRes, catRes, eventsRes, teRes, offsetsRes] = await Promise.all([
        fetchAllTransactions(),
        supabase.from('accounts').select('*').or('is_deleted.is.null,is_deleted.eq.false'),
        supabase.from('transaction_categories').select('*'),
        supabase.from('events').select('*').order('name'),
        supabase.from('transaction_events').select('*'),
        supabase.from('transaction_offsets').select('*'),
      ]);
      setTransactions(txData);
      if (accRes.data) setAccounts(accRes.data as Account[]);
      if (catRes.data) setCustomCategories(catRes.data as CustomCategory[]);
      if (eventsRes.data) setEvents(eventsRes.data as Event[]);
      if (teRes.data) setTransactionEvents(teRes.data as TxEvent[]);
      if (offsetsRes.data) setOffsets(offsetsRes.data as any[]);
      
      // Auto-link transfers with single matches
      await autoLinkTransfers(txData);
    } catch (err) {
      console.error('Failed to load transactions', err);
      toast.error('Failed to load transactions');
    } finally {
      setLoading(false);
    }
  }

  // Optimized auto-link with batched updates
  async function autoLinkTransfers(txList: Transaction[]) {
    const unlinkedTransfers = txList.filter(tx => 
      tx.category === 'Transfer' && !tx.linked_transfer_id && !tx.is_transfer_exception
    );

    if (unlinkedTransfers.length === 0) return;

    const linksToCreate: { txId: string; linkedId: string }[] = [];

    for (const tx of unlinkedTransfers) {
      const txDate = new Date(tx.date);
      const fiveDaysBefore = new Date(txDate);
      fiveDaysBefore.setDate(fiveDaysBefore.getDate() - 5);
      const fiveDaysAfter = new Date(txDate);
      fiveDaysAfter.setDate(fiveDaysAfter.getDate() + 5);

      const matches = txList.filter(other => {
        if (other.id === tx.id) return false;
        if (other.category !== 'Transfer') return false;
        if (other.linked_transfer_id) return false;
        if (Math.sign(other.amount) === Math.sign(tx.amount)) return false;
        const diff = Math.abs(Math.abs(other.amount) - Math.abs(tx.amount));
        const threshold = Math.max(1, Math.abs(tx.amount) * 0.01);
        if (diff > threshold) return false;
        const otherDate = new Date(other.date);
        if (otherDate < fiveDaysBefore || otherDate > fiveDaysAfter) return false;
        return true;
      });

      if (matches.length === 1) {
        const match = matches[0];
        const alreadyQueued = linksToCreate.some(
          l => l.txId === match.id || l.linkedId === tx.id || l.txId === tx.id || l.linkedId === match.id
        );
        if (!alreadyQueued) {
          linksToCreate.push({ txId: tx.id, linkedId: match.id });
        }
      }
    }

    if (linksToCreate.length > 0) {
      // Batch all updates into parallel promises
      const updatePromises = linksToCreate.flatMap(link => [
        supabase.from('transactions').update({ linked_transfer_id: link.linkedId }).eq('id', link.txId),
        supabase.from('transactions').update({ linked_transfer_id: link.txId }).eq('id', link.linkedId)
      ]);
      
      await Promise.all(updatePromises);
      toast.success(`Auto-linked ${linksToCreate.length} transfer pair${linksToCreate.length > 1 ? 's' : ''}`);
    }

    if (linksToCreate.length > 0) {
      const { data: refreshed } = await supabase.from('transactions').select('*').order('date', { ascending: false });
      if (refreshed) setTransactions(refreshed as Transaction[]);
    }
  }

  const createCustomCategory = useCallback(async (name: string): Promise<string | null> => {
    if (!user || !name.trim()) return null;
    
    const trimmedName = name.trim();
    if (allCategories.includes(trimmedName)) {
      toast.error('Category already exists');
      return null;
    }

    const { data, error } = await supabase
      .from('transaction_categories')
      .insert({ user_id: user.id, name: trimmedName })
      .select()
      .single();

    if (error) {
      toast.error('Failed to create category');
      return null;
    }

    setCustomCategories(prev => [...prev, data as CustomCategory]);
    toast.success(`Category "${trimmedName}" created`);
    return trimmedName;
  }, [user, allCategories]);

  async function syncFromBank() {
    setSyncing(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('plaid-sync-transactions');
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data?.failed) {
        const failures = (data.results ?? []).filter((item: {status: string}) => item.status === 'failed')
          .map((item: {institution?: string; reason: string}) => `${item.institution ?? 'Linked bank'}: ${item.reason}`);
        toast.error('Some bank connections could not sync', { description: failures.join('; ') });
      } else if (!data?.results?.length) {
        toast.info('No linked banks to sync');
      } else {
        toast.success(`Imported ${data.synced} new transactions`);
      }
      await fetchData();
    } catch (err) {
      logError('Transactions sync', err);
      toast.error('Failed to sync transactions');
    } finally {
      setSyncing(false);
    }
  }

  async function createTransaction(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    const { error } = await supabase.from('transactions').insert({
      user_id: user.id,
      name: newTx.name,
      amount: parseFloat(newTx.amount),
      date: newTx.date,
      recognition_date: newTx.recognition_date ? `${newTx.recognition_date}-01` : newTx.date,
      category: newTx.category,
      account_id: newTx.account_id || null,
      cash_flow_type: newTx.cash_flow_type,
      is_one_time_expense: newTx.is_one_time_expense,
    });

    if (error) {
      toast.error('Failed to create transaction');
    } else {
      toast.success('Transaction added');
      setDialogOpen(false);
      setNewTx({
        name: '', amount: '', date: new Date().toISOString().split('T')[0],
        recognition_date: '', category: '', account_id: '', cash_flow_type: 'operating', is_one_time_expense: false
      });
      fetchData();
    }
  }

  const updateCashFlowType = useCallback(async (id: string, type: CashFlowCategory) => {
    await supabase.from('transactions').update({ cash_flow_type: type }).eq('id', id);
    setTransactions(prev => prev.map(tx => tx.id === id ? { ...tx, cash_flow_type: type } : tx));
  }, []);

  const updateRecognitionDate = useCallback(async (id: string, monthValue: string) => {
    const date = monthValue ? `${monthValue}-01` : null;
    await supabase.from('transactions').update({ recognition_date: date }).eq('id', id);
    setTransactions(prev => prev.map(tx => tx.id === id ? { ...tx, recognition_date: date } : tx));
  }, []);

  const getRecognitionMonth = useCallback((tx: Transaction): string => {
    const date = tx.recognition_date || tx.date;
    return date.substring(0, 7);
  }, []);

  const updateCategory = useCallback(async (id: string, category: string) => {
    await supabase.from('transactions').update({ category }).eq('id', id);
    setTransactions(prev => prev.map(tx => tx.id === id ? { ...tx, category } : tx));
    toast.success('Category updated');
  }, []);

  const updateIncomeType = useCallback(async (id: string, incomeType: IncomeType | null) => {
    await supabase.from('transactions').update({ income_type: incomeType }).eq('id', id);
    setTransactions(prev => prev.map(tx => tx.id === id ? { ...tx, income_type: incomeType ?? undefined } : tx));
    toast.success('Income type updated');
  }, []);

  const openAmortizeDialog = useCallback((tx: Transaction) => {
    setSelectedTx(tx);
    const recognitionDate = tx.recognition_date || tx.date;
    // Use first day of recognition month
    const startDate = recognitionDate.substring(0, 7) + '-01';
    setAmortizeForm({
      type: tx.amount < 0 ? 'deferred_income' : 'prepaid_expense',
      months: '12',
      start_date: startDate,
    });
    setAmortizeDialogOpen(true);
  }, []);

  async function createAmortization(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !selectedTx) return;

    const months = parseInt(amortizeForm.months);
    const startDate = new Date(amortizeForm.start_date);
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + months - 1);

    const monthlyAmount = Math.abs(selectedTx.amount) / months;

    const { error: amortError } = await supabase.from('amortization_schedules').insert({
      user_id: user.id,
      transaction_id: selectedTx.id,
      name: selectedTx.merchant_name || selectedTx.name,
      type: amortizeForm.type,
      total_amount: Math.abs(selectedTx.amount),
      start_date: amortizeForm.start_date,
      end_date: endDate.toISOString().split('T')[0],
      monthly_amount: monthlyAmount,
      category: selectedTx.category,
    });

    if (amortError) {
      toast.error('Failed to create amortization schedule');
      return;
    }

    const { error: txError } = await supabase
      .from('transactions')
      .update({ is_amortized: true })
      .eq('id', selectedTx.id);

    if (txError) {
      toast.error('Failed to update transaction');
      return;
    }

    toast.success(`Expense will be amortized over ${months} months at ${formatCurrency(monthlyAmount)}/mo`);
    setAmortizeDialogOpen(false);
    setSelectedTx(null);
    fetchData();
  }

  const { partner } = useOwnership();

  const updateOwnershipPct = useCallback(async (id: string, pct: number | null) => {
    await supabase.from('transactions').update({ ownership_pct: pct }).eq('id', id);
    setTransactions(prev => prev.map(tx => tx.id === id ? { ...tx, ownership_pct: pct } : tx));
    toast.success(pct != null ? `Ownership set to ${pct}%` : 'Using account default');
  }, []);

  const removeAmortization = useCallback(async (txId: string) => {
    await supabase.from('amortization_schedules').delete().eq('transaction_id', txId);
    await supabase.from('transactions').update({ is_amortized: false }).eq('id', txId);
    toast.success('Amortization removed');
    fetchData();
  }, []);

  const toggleOneTime = useCallback(async (tx: Transaction) => {
    const { error } = await supabase
      .from('transactions')
      .update({ is_one_time_expense: !tx.is_one_time_expense })
      .eq('id', tx.id);
    
    if (error) {
      toast.error('Failed to update');
    } else {
      setTransactions(prev => prev.map(t => 
        t.id === tx.id ? { ...t, is_one_time_expense: !t.is_one_time_expense } : t
      ));
    }
  }, []);

  // Memoize potential matches lookup
  const getPotentialMatches = useCallback((tx: Transaction): { transferMatches: Transaction[]; otherMatches: Transaction[] } => {
    if (tx.category !== 'Transfer') return { transferMatches: [], otherMatches: [] };
    const txDate = new Date(tx.date);
    const fiveDaysBefore = new Date(txDate);
    fiveDaysBefore.setDate(fiveDaysBefore.getDate() - 5);
    const fiveDaysAfter = new Date(txDate);
    fiveDaysAfter.setDate(fiveDaysAfter.getDate() + 5);

    const transferMatches: Transaction[] = [];
    const otherMatches: Transaction[] = [];

    transactions.forEach(other => {
      if (other.id === tx.id) return;
      if (other.linked_transfer_id) return;
      if (Math.sign(other.amount) === Math.sign(tx.amount)) return;
      const diff = Math.abs(Math.abs(other.amount) - Math.abs(tx.amount));
      const threshold = Math.max(1, Math.abs(tx.amount) * 0.01);
      if (diff > threshold) return;
      const otherDate = new Date(other.date);
      if (otherDate < fiveDaysBefore || otherDate > fiveDaysAfter) return;

      if (other.category === 'Transfer') {
        transferMatches.push(other);
      } else {
        otherMatches.push(other);
      }
    });

    return { transferMatches, otherMatches };
  }, [transactions]);

  const linkTransfers = useCallback(async (txId: string, linkedId: string, convertToTransfer = false) => {
    if (convertToTransfer) {
      const { error: catError } = await supabase
        .from('transactions')
        .update({ category: 'Transfer' })
        .eq('id', linkedId);
      if (catError) {
        toast.error('Failed to update category');
        return;
      }
    }

    const [err1, err2] = await Promise.all([
      supabase.from('transactions').update({ linked_transfer_id: linkedId }).eq('id', txId),
      supabase.from('transactions').update({ linked_transfer_id: txId }).eq('id', linkedId)
    ]);

    if (err1.error || err2.error) {
      toast.error('Failed to link transfers');
    } else {
      toast.success(convertToTransfer ? 'Linked and converted to Transfer' : 'Transfers linked');
      setLinkTransferDialogTx(null);
      fetchData();
    }
  }, []);

  const unlinkTransfer = useCallback(async (tx: Transaction) => {
    if (!tx.linked_transfer_id) return;
    
    // Find the linked transaction
    const linkedTx = transactions.find(t => t.id === tx.linked_transfer_id);
    
    // Check if the current transaction is the manual one (created as exception)
    const txAccount = accounts.find(a => a.id === tx.account_id);
    const isThisManualTx = txAccount?.is_manual && tx.is_transfer_exception;
    
    // Check if the linked transaction is the manual one
    const linkedAccount = linkedTx ? accounts.find(a => a.id === linkedTx.account_id) : null;
    const isLinkedManualTx = linkedAccount?.is_manual && linkedTx?.is_transfer_exception;
    
    if (isThisManualTx) {
      // This is the manual transaction - reverse balance and delete it, unlink the original
      const reversedBalance = (txAccount.current_balance || 0) - tx.amount;
      await supabase
        .from('accounts')
        .update({ current_balance: reversedBalance })
        .eq('id', txAccount.id);
      
      // Unlink the original transaction (find it by looking for tx that links to this one)
      const originalTx = transactions.find(t => t.linked_transfer_id === tx.id && t.id !== tx.id);
      if (originalTx) {
        await supabase
          .from('transactions')
          .update({ linked_transfer_id: null, is_transfer_exception: false })
          .eq('id', originalTx.id);
      }
      
      // Delete this manual transaction
      await supabase.from('transactions').delete().eq('id', tx.id);
      toast.success('Manual transaction deleted and balance reversed');
    } else if (isLinkedManualTx && linkedTx) {
      // The linked transaction is manual - reverse its balance and delete it
      const reversedBalance = (linkedAccount!.current_balance || 0) - linkedTx.amount;
      await supabase
        .from('accounts')
        .update({ current_balance: reversedBalance })
        .eq('id', linkedAccount!.id);
      
      // Unlink this transaction
      await supabase
        .from('transactions')
        .update({ linked_transfer_id: null, is_transfer_exception: false })
        .eq('id', tx.id);
      
      // Delete the manual transaction
      await supabase.from('transactions').delete().eq('id', linkedTx.id);
      toast.success('Transfer unlinked and manual transaction deleted');
    } else {
      // Normal unlink (neither is manual)
      await Promise.all([
        supabase.from('transactions').update({ linked_transfer_id: null }).eq('id', tx.id),
        supabase.from('transactions').update({ linked_transfer_id: null }).eq('id', tx.linked_transfer_id)
      ]);
      toast.success('Transfer unlinked');
    }
    
    fetchData();
  }, [transactions, accounts]);

  const openExceptionDialog = useCallback((tx: Transaction) => {
    setExceptionDialogTx(tx);
    setSelectedManualAccountId('');
  }, []);

  const [creatingException, setCreatingException] = useState(false);

  async function createExceptionWithManualAccount() {
    if (!user || !exceptionDialogTx || !selectedManualAccountId || creatingException) return;

    const manualAccount = accounts.find(a => a.id === selectedManualAccountId);
    if (!manualAccount) {
      toast.error('Please select a manual account');
      return;
    }

    // Prevent duplicate submissions
    setCreatingException(true);

    try {
      const transferAmount = -exceptionDialogTx.amount;
      
      const { data: newTxData, error: insertErr } = await supabase
        .from('transactions')
        .insert({
          user_id: user.id,
          name: `Transfer: ${exceptionDialogTx.merchant_name || exceptionDialogTx.name}`,
          amount: transferAmount,
          date: exceptionDialogTx.date,
          recognition_date: exceptionDialogTx.recognition_date,
          category: 'Transfer',
          account_id: selectedManualAccountId,
          account_name: manualAccount.name,
          cash_flow_type: 'operating',
          is_transfer_exception: true,
        })
        .select()
        .single();

      if (insertErr || !newTxData) {
        toast.error('Failed to create matching transaction');
        return;
      }

      // Update the manual account balance (skip for zero-balance accounts)
      if (!manualAccount.is_zero_balance) {
        const newBalance = (manualAccount.current_balance || 0) + transferAmount;
        const { error: balanceErr } = await supabase
          .from('accounts')
          .update({ current_balance: newBalance })
          .eq('id', selectedManualAccountId);

        if (balanceErr) {
          console.error('Failed to update account balance:', balanceErr);
        }
      }

      const [linkErr1, linkErr2] = await Promise.all([
        supabase.from('transactions').update({ linked_transfer_id: newTxData.id, is_transfer_exception: true }).eq('id', exceptionDialogTx.id),
        supabase.from('transactions').update({ linked_transfer_id: newTxData.id, is_transfer_exception: true }).eq('id', newTxData.id)
      ]);

      if (linkErr1.error || linkErr2.error) {
        toast.error('Failed to link transactions');
        return;
      }

      toast.success(`Linked to ${manualAccount.name} (balance updated)`);
      setExceptionDialogTx(null);
      setSelectedManualAccountId('');
      fetchData();
    } finally {
      setCreatingException(false);
    }
  }

  const removeTransferException = useCallback(async (tx: Transaction) => {
    if (tx.linked_transfer_id) {
      const linkedTx = transactions.find(t => t.id === tx.linked_transfer_id);
      
      await supabase.from('transactions').update({ linked_transfer_id: null, is_transfer_exception: false }).eq('id', tx.id);
      
      if (linkedTx) {
        const linkedAccount = accounts.find(a => a.id === linkedTx.account_id);
        if (linkedAccount?.is_manual) {
          // Reverse the balance change before deleting (skip for zero-balance accounts)
          if (!linkedAccount.is_zero_balance) {
            const reversedBalance = (linkedAccount.current_balance || 0) - linkedTx.amount;
            await supabase
              .from('accounts')
              .update({ current_balance: reversedBalance })
              .eq('id', linkedAccount.id);
          }
          
          await supabase.from('transactions').delete().eq('id', linkedTx.id);
        } else {
          await supabase.from('transactions').update({ linked_transfer_id: null, is_transfer_exception: false }).eq('id', linkedTx.id);
        }
      }
    } else {
      await supabase.from('transactions').update({ is_transfer_exception: false }).eq('id', tx.id);
    }

    toast.success('Exception removed');
    fetchData();
  }, [transactions, accounts]);

  const getLinkedTransfer = useCallback((tx: Transaction): Transaction | undefined => {
    if (!tx.linked_transfer_id) return undefined;
    return transactions.find(t => t.id === tx.linked_transfer_id);
  }, [transactions]);

  // Create account lookup map for efficient access - MUST be before any early returns
  const accountMap = useMemo(() => {
    const map: Record<string, string> = {};
    accounts.forEach(a => { map[a.id] = a.name; });
    return map;
  }, [accounts]);

  const reviewCount = useMemo(() => transactions.filter(tx => tx.needs_review).length, [transactions]);

  const markReviewed = useCallback(async (id: string) => {
    const tx = transactions.find(t => t.id === id);
    const idsToMark = [id];
    if (tx?.linked_transfer_id) idsToMark.push(tx.linked_transfer_id);
    await supabase.from('transactions').update({ needs_review: false }).in('id', idsToMark);
    setTransactions(prev => prev.map(t => idsToMark.includes(t.id) ? { ...t, needs_review: false } : t));
  }, [transactions]);

  const markAllFilteredReviewed = useCallback(async () => {
    const needsReview = filtered.filter(tx => tx.needs_review);
    if (needsReview.length === 0) return;
    // Collect IDs including linked transfers
    const idSet = new Set<string>();
    needsReview.forEach(tx => {
      idSet.add(tx.id);
      if (tx.linked_transfer_id) idSet.add(tx.linked_transfer_id);
    });
    const ids = Array.from(idSet);
    // Supabase .in() has a limit, batch in chunks of 100
    for (let i = 0; i < ids.length; i += 100) {
      await supabase.from('transactions').update({ needs_review: false }).in('id', ids.slice(i, i + 100));
    }
    setTransactions(prev => prev.map(tx => idSet.has(tx.id) ? { ...tx, needs_review: false } : tx));
    toast.success(`Marked ${needsReview.length} transactions as reviewed`);
  }, [filtered]);

  const toggleExpandTx = useCallback((id: string) => {
    setExpandedTxId(prev => prev === id ? null : id);
  }, []);

  // Memoize tagged events lookup: txId -> Set of eventIds
  const taggedEventsMap = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    transactionEvents.forEach(te => {
      if (!map[te.transaction_id]) map[te.transaction_id] = new Set();
      map[te.transaction_id].add(te.event_id);
    });
    return map;
  }, [transactionEvents]);

  const tagEvent = useCallback(async (eventId: string, txId: string) => {
    const { error } = await supabase.from('transaction_events').insert({ event_id: eventId, transaction_id: txId });
    if (error) { toast.error('Failed to tag'); return; }
    setTransactionEvents(prev => [...prev, { id: '', event_id: eventId, transaction_id: txId, created_at: '' }]);
    toast.success('Tagged');
  }, []);

  const untagEvent = useCallback(async (eventId: string, txId: string) => {
    const { error } = await supabase.from('transaction_events').delete().eq('event_id', eventId).eq('transaction_id', txId);
    if (!error) {
      setTransactionEvents(prev => prev.filter(te => !(te.event_id === eventId && te.transaction_id === txId)));
      toast.success('Untagged');
    }
  }, []);

  // Offset linking maps
  const offsetsByParent = useMemo(() => {
    const map: Record<string, string[]> = {};
    offsets.forEach(o => {
      if (!map[o.parent_transaction_id]) map[o.parent_transaction_id] = [];
      map[o.parent_transaction_id].push(o.offset_transaction_id);
    });
    return map;
  }, [offsets]);


  const getOffsetTransactions = useCallback((parentId: string): Transaction[] => {
    const ids = offsetsByParent[parentId];
    if (!ids) return [];
    return transactions.filter(t => ids.includes(t.id));
  }, [offsetsByParent, transactions]);

  const getNetAmount = useCallback((tx: Transaction): number | undefined => {
    const offsetTxs = getOffsetTransactions(tx.id);
    if (offsetTxs.length === 0) return undefined;
    return offsetTxs.reduce((sum, o) => sum + o.amount, tx.amount);
  }, [getOffsetTransactions]);

  const searchOffsets = useCallback((query: string): Transaction[] => {
    const q = query.toLowerCase();
    const searchNum = parseFloat(query.replace(/[,$]/g, ''));
    return transactions.filter(t => {
      // Only allow positive amounts (refunds/credits) as offsets for negative (expense) parents
      if (t.amount <= 0) return false;
      // Don't allow transactions that are already offset children
      if (offsetChildIds.has(t.id)) return false;
      const nameMatch = t.name.toLowerCase().includes(q) || t.merchant_name?.toLowerCase().includes(q);
      const amtMatch = !isNaN(searchNum) && Math.abs(Math.abs(t.amount) - searchNum) < 1;
      return nameMatch || amtMatch;
    }).slice(0, 10);
  }, [transactions, offsetChildIds]);

  // Suggest offsets: opposite-sign transactions matching the absolute amount
  const getSuggestedOffsets = useCallback((tx: Transaction): Transaction[] => {
    if (tx.amount >= 0) return []; // only for negative amounts (displayed as positive)
    const absAmount = Math.abs(tx.amount);
    return transactions.filter(t => {
      if (t.id === tx.id) return false;
      if (t.amount <= 0) return false; // only positive amounts (expenses) as potential offsets
      if (offsetChildIds.has(t.id)) return false;
      // Check if already linked as an offset to this tx
      if (offsetsByParent[tx.id]?.includes(t.id)) return false;
      return Math.abs(t.amount - absAmount) < 0.01;
    }).slice(0, 5);
  }, [transactions, offsetChildIds, offsetsByParent]);

  const linkOffset = useCallback(async (parentId: string, offsetId: string) => {
    const { error } = await supabase.from('transaction_offsets').insert({
      parent_transaction_id: parentId,
      offset_transaction_id: offsetId,
    });
    if (error) {
      toast.error('Failed to link offset');
      return;
    }
    setOffsets(prev => [...prev, { id: '', parent_transaction_id: parentId, offset_transaction_id: offsetId }]);
    toast.success('Offset linked');
  }, []);

  const unlinkOffset = useCallback(async (parentId: string, offsetId: string) => {
    const { error } = await supabase.from('transaction_offsets').delete()
      .eq('parent_transaction_id', parentId)
      .eq('offset_transaction_id', offsetId);
    if (error) {
      toast.error('Failed to unlink offset');
      return;
    }
    setOffsets(prev => prev.filter(o => !(o.parent_transaction_id === parentId && o.offset_transaction_id === offsetId)));
    toast.success('Offset removed');
  }, []);

  if (authLoading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-pulse">Loading...</div></div>;
  if (!user) return <Navigate to="/auth" replace />;

  const hasLinkedAccounts = accounts.some((a) => !a.is_manual);

  return (
    <>
      <PageHeader
        title="Transactions"
        description="View and manage all your transactions"
        actions={
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="w-4 h-4 mr-2" />Add Transaction</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>Add Transaction</DialogTitle></DialogHeader>
              <form onSubmit={createTransaction} className="space-y-4">
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input placeholder="e.g., Grocery Store" value={newTx.name} onChange={(e) => setNewTx({ ...newTx, name: e.target.value })} required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Amount (positive = expense)</Label>
                    <Input type="number" step="0.01" placeholder="0.00" value={newTx.amount} onChange={(e) => setNewTx({ ...newTx, amount: e.target.value })} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Cash Date</Label>
                    <Input type="date" value={newTx.date} onChange={(e) => setNewTx({ ...newTx, date: e.target.value })} required />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Recognition Month (Income Statement)</Label>
                  <Select value={newTx.recognition_date || ''} onValueChange={(v) => setNewTx({ ...newTx, recognition_date: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Same as cash date" />
                    </SelectTrigger>
                    <SelectContent>
                      {monthOptions.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Leave empty to use cash date's month</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select value={newTx.category} onValueChange={async (v) => {
                      if (v === '__new__') {
                        const name = prompt('Enter new category name:');
                        if (name) {
                          const created = await createCustomCategory(name);
                          if (created) setNewTx({ ...newTx, category: created });
                        }
                      } else {
                        setNewTx({ ...newTx, category: v });
                      }
                    }}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        {allCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        <SelectItem value="__new__" className="text-primary">
                          <span className="flex items-center gap-1">
                            <PlusCircle className="w-3 h-3" />
                            New Category
                          </span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Cash Flow Type</Label>
                    <Select value={newTx.cash_flow_type} onValueChange={(v) => setNewTx({ ...newTx, cash_flow_type: v as CashFlowCategory })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="operating">Operating</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {accounts.length > 0 && (
                  <div className="space-y-2">
                    <Label>Account (optional)</Label>
                    <Select value={newTx.account_id} onValueChange={(v) => setNewTx({ ...newTx, account_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                      <SelectContent>
                        {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Checkbox checked={newTx.is_one_time_expense} onCheckedChange={(c) => setNewTx({ ...newTx, is_one_time_expense: !!c })} />
                  <Label className="cursor-pointer">One-time expense (Non-GAAP adjustment)</Label>
                </div>
                <Button type="submit" className="w-full">Add Transaction</Button>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      {/* Amortize Dialog */}
      <Dialog open={amortizeDialogOpen} onOpenChange={setAmortizeDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{selectedTx && selectedTx.amount < 0 ? 'Amortize Income' : 'Amortize Expense'}</DialogTitle>
          </DialogHeader>
          {selectedTx && (
            <form onSubmit={createAmortization} className="space-y-4">
              <div className="p-3 bg-muted rounded-lg">
                <p className="font-medium">{selectedTx.merchant_name || selectedTx.name}</p>
                <p className="text-2xl font-bold">{formatCurrency(Math.abs(selectedTx.amount))}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {selectedTx.amount < 0 ? 'Income will be recognized over multiple periods' : 'Expense will be recognized over multiple periods'}
                </p>
              </div>
              <div className="space-y-2">
                <Label>Amortization Type</Label>
                <Select value={amortizeForm.type} onValueChange={(v) => setAmortizeForm({ ...amortizeForm, type: v as AmortizationType })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {selectedTx.amount < 0 ? (
                      <SelectItem value="deferred_income">Deferred Income</SelectItem>
                    ) : (
                      <>
                        <SelectItem value="prepaid_expense">Prepaid Expense</SelectItem>
                        <SelectItem value="capital_expenditure">Capital Expenditure</SelectItem>
                        <SelectItem value="intangible_asset">Intangible Asset</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Duration (months)</Label>
                <Input 
                  type="number" 
                  min="2" 
                  max="120" 
                  value={amortizeForm.months} 
                  onChange={(e) => setAmortizeForm({ ...amortizeForm, months: e.target.value })} 
                  required 
                />
                <p className="text-xs text-muted-foreground">
                  Monthly {selectedTx.amount < 0 ? 'income' : 'expense'}: {formatCurrency(Math.abs(selectedTx.amount) / parseInt(amortizeForm.months || '1'))}
                </p>
              </div>
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input 
                  type="date" 
                  value={amortizeForm.start_date} 
                  onChange={(e) => setAmortizeForm({ ...amortizeForm, start_date: e.target.value })} 
                  required 
                />
              </div>
              <Button type="submit" className="w-full">Create Amortization Schedule</Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Exception Dialog - Link to Manual Account */}
      <Dialog open={!!exceptionDialogTx} onOpenChange={(open) => !open && setExceptionDialogTx(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Link to Manual Account</DialogTitle>
          </DialogHeader>
          {exceptionDialogTx && (
            <div className="space-y-4">
              <div className="p-3 bg-muted rounded-lg">
                <p className="font-medium">{exceptionDialogTx.merchant_name || exceptionDialogTx.name}</p>
                <p className={`font-mono ${exceptionDialogTx.amount > 0 ? 'text-destructive' : 'text-success'}`}>
                  {formatCurrency(exceptionDialogTx.amount)}
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                This will create a matching opposite transaction in the selected manual account.
              </p>
              <div className="space-y-2">
                <Label>Select Manual Account</Label>
                <Select value={selectedManualAccountId} onValueChange={setSelectedManualAccountId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose an account..." />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.filter(a => a.is_manual).map(acc => (
                      <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {accounts.filter(a => a.is_manual).length === 0 && (
                  <p className="text-sm text-warning">No manual accounts found. Please create one first.</p>
                )}
              </div>
              <Button 
                onClick={createExceptionWithManualAccount} 
                className="w-full"
                disabled={!selectedManualAccountId}
              >
                Create Linked Transaction
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Tabs value={currentTab} onValueChange={(v) => setCurrentTab(v as 'all' | 'review')} className="mb-4">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="review" className="gap-2">
              Review
              {reviewCount > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs">{reviewCount}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="all">All Transactions</TabsTrigger>
          </TabsList>
          {filtered.some(tx => tx.needs_review) && (
            <Button variant="outline" size="sm" onClick={markAllFilteredReviewed}>
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Mark {filtered.filter(tx => tx.needs_review).length} Reviewed
            </Button>
          )}
        </div>
      </Tabs>

      {/* Search Bar - Full Width */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input 
          placeholder="Search by name, merchant, category, account, notes, or amount..." 
          className="pl-10" 
          value={searchQuery} 
          onChange={(e) => setSearchQuery(e.target.value)} 
        />
      </div>

      {/* Filters Row */}
      <div className="flex flex-wrap gap-4 mb-6">
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-full sm:w-56">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem value="__unlinked_transfers__" className="text-warning">
              <span className="flex items-center gap-2">
                <AlertCircle className="w-3 h-3" />
                Unlinked Transfers {unlinkedTransferCount > 0 && `(${unlinkedTransferCount})`}
              </span>
            </SelectItem>
            {allCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-full sm:w-48 justify-between text-sm font-normal">
              {accountFilter.size === 0
                ? 'All Accounts'
                : accountFilter.size === 1
                  ? accounts.find(a => accountFilter.has(a.id))?.name || '1 account'
                  : `${accountFilter.size} accounts`}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2" align="start">
            <div className="flex flex-col gap-1 max-h-60 overflow-y-auto">
              {accounts.map(a => (
                <label key={a.id} className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-accent cursor-pointer text-sm">
                  <Checkbox
                    checked={accountFilter.has(a.id)}
                    onCheckedChange={(checked) => {
                      setAccountFilter(prev => {
                        const next = new Set(prev);
                        if (checked) next.add(a.id);
                        else next.delete(a.id);
                        return next;
                      });
                    }}
                  />
                  {a.name}
                </label>
              ))}
              {accountFilter.size > 0 && (
                <Button variant="ghost" size="sm" className="mt-1" onClick={() => setAccountFilter(new Set())}>
                  Clear
                </Button>
              )}
            </div>
          </PopoverContent>
        </Popover>
        <div className="flex items-center gap-1">
          <Select value={amountOp} onValueChange={(v) => { setAmountOp(v); if (v !== 'any') setCurrentTab('all'); }}>
            <SelectTrigger className="w-20">
              <SelectValue placeholder="Amt" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any</SelectItem>
              <SelectItem value="gt">&gt;</SelectItem>
              <SelectItem value="gte">≥</SelectItem>
              <SelectItem value="lt">&lt;</SelectItem>
              <SelectItem value="lte">≤</SelectItem>
              <SelectItem value="eq">=</SelectItem>
            </SelectContent>
          </Select>
          {amountOp !== 'any' && (
            <Input
              type="number"
              step="0.01"
              placeholder="500"
              value={amountValue}
              onChange={(e) => setAmountValue(e.target.value)}
              className="w-24"
            />
          )}
        </div>
        <Select value="" onValueChange={setDatePreset}>
          <SelectTrigger className="w-full sm:w-36">
            <SelectValue placeholder="Date Preset" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="last7">Last 7 Days</SelectItem>
            <SelectItem value="last30">Last 30 Days</SelectItem>
            <SelectItem value="thisMonth">This Month</SelectItem>
            <SelectItem value="lastMonth">Last Month</SelectItem>
            <SelectItem value="thisQuarter">This Quarter</SelectItem>
            <SelectItem value="thisYear">This Year</SelectItem>
            <SelectItem value="lastYear">Last Year</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Label className="text-sm text-muted-foreground whitespace-nowrap">From</Label>
          <Input 
            type="date" 
            value={startDate} 
            onChange={(e) => setStartDate(e.target.value)}
            className="w-36"
          />
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-sm text-muted-foreground whitespace-nowrap">To</Label>
          <Input 
            type="date" 
            value={endDate} 
            onChange={(e) => setEndDate(e.target.value)}
            className="w-36"
          />
        </div>
        {hasLinkedAccounts && (
          <Button variant="outline" onClick={() => syncFromBank()} disabled={syncing}>
            <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing…' : 'Sync'}
          </Button>
        )}
      </div>

      {loading ? (
        <div className="animate-pulse text-muted-foreground">Loading transactions...</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No transactions found.</p>
            {hasLinkedAccounts && (
              <div className="mt-4">
                <Button variant="outline" onClick={() => syncFromBank()} disabled={syncing}>
                  <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
                  {syncing ? 'Syncing…' : 'Sync from bank'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div 
              ref={parentRef}
              className="h-[600px] overflow-auto"
            >
              <div
                style={{
                  height: `${rowVirtualizer.getTotalSize()}px`,
                  width: '100%',
                  position: 'relative',
                }}
              >
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const tx = filtered[virtualRow.index];
                  const linkedTransfer = getLinkedTransfer(tx);
                  const isUnlinked = isUnlinkedTransfer(tx);
                  const potentialMatches = isUnlinked ? getPotentialMatches(tx) : { transferMatches: [], otherMatches: [] };
                  const txAccount = accounts.find(a => a.id === tx.account_id);
                  const isManualAccount = txAccount?.is_manual ?? false;

                  return (
                    <div
                      key={tx.id}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                      className="border-b border-border"
                    >
                      <TransactionRow
                        tx={tx}
                        linkedTransfer={linkedTransfer}
                        isUnlinked={isUnlinked}
                        potentialMatches={potentialMatches}
                        allCategories={allCategories}
                        monthOptions={monthOptions}
                        accountName={tx.account_id ? accountMap[tx.account_id] : tx.account_name}
                        isManualAccount={isManualAccount}
                        onUpdateCategory={updateCategory}
                        onCreateCategory={createCustomCategory}
                        onToggleOneTime={toggleOneTime}
                        onOpenAmortize={openAmortizeDialog}
                        onRemoveAmortization={removeAmortization}
                        onLinkTransfers={linkTransfers}
                        onUnlinkTransfer={unlinkTransfer}
                        onOpenExceptionDialog={openExceptionDialog}
                        onRemoveException={removeTransferException}
                        onUpdateRecognitionDate={updateRecognitionDate}
                        onUpdateIncomeType={updateIncomeType}
                        onUpdateCashFlowType={updateCashFlowType}
                        onUpdateOwnershipPct={updateOwnershipPct}
                        hasPartner={!!partner}
                        getRecognitionMonth={getRecognitionMonth}
                        onMarkReviewed={markReviewed}
                        events={events}
                        taggedEventIds={taggedEventsMap[tx.id]}
                        onTagEvent={tagEvent}
                        onUntagEvent={untagEvent}
                        isExpanded={expandedTxId === tx.id}
                        onToggleExpand={toggleExpandTx}
                        netAmount={getNetAmount(tx)}
                        offsetTransactions={getOffsetTransactions(tx.id)}
                        onSearchOffsets={searchOffsets}
                        suggestedOffsets={getSuggestedOffsets(tx)}
                        onLinkOffset={linkOffset}
                        onUnlinkOffset={unlinkOffset}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}

export default function Transactions() {
  return (
    <AppLayout>
      <TransactionsContent />
    </AppLayout>
  );
}
