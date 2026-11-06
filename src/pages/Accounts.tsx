import { useEffect, useState, useCallback } from 'react';
import { logError } from '@/lib/logging';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { usePlaidLink } from '@/hooks/usePlaidLink';
import { useOwnership } from '@/hooks/useOwnership';
import { usePartnerLink } from '@/hooks/usePartnerLink';

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
import { formatCurrency } from '@/lib/format';
import { Plus, Wallet, CreditCard, PiggyBank, TrendingUp, Landmark, Trash2, Link2, RefreshCw, Building2, Pencil, Check, X, Unlink, AlertTriangle, Users, Settings, CalendarIcon, Droplets, Clock } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { UpcomingPayments } from '@/components/accounts/UpcomingPayments';
import { StatCard } from '@/components/ui/stat-card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { Account } from '@/lib/types';
import { toast } from 'sonner';
import { Navigate } from 'react-router-dom';
import { AccountTransactionsSheet } from '@/components/accounts/AccountTransactionsSheet';

const accountTypeIcons = {
  checking: Wallet,
  savings: PiggyBank,
  credit: CreditCard,
  investment: TrendingUp,
  loan: Landmark,
  depository: Wallet,
  brokerage: TrendingUp,
};

export default function Accounts() {
  const { user, loading: authLoading } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [accountView, setAccountView] = useState<'accounts' | 'upcoming'>('accounts');
  const [syncing, setSyncing] = useState(false);
  const [connections, setConnections] = useState<{ id: string; name: string }[]>([]);
  const [selectedConnection, setSelectedConnection] = useState('');
  const [reconnecting, setReconnecting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reconnectDialogOpen, setReconnectDialogOpen] = useState(false);
  const [partnerDialogOpen, setPartnerDialogOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingBalanceId, setEditingBalanceId] = useState<string | null>(null);
  const [editingBalance, setEditingBalance] = useState('');
  const [newAccount, setNewAccount] = useState({
    name: '',
    type: 'checking' as Account['type'],
    current_balance: '',
  });
  const [partnerForm, setPartnerForm] = useState({
    partner_name: '',
    default_ownership_pct: '50',
  });

  const { partner, fetchPartner, getOwnershipPct } = useOwnership();
  const { partnerLink, partnerName: linkedPartnerName } = usePartnerLink();
  const isLinkedPartner = partnerLink?.status === 'active';
  const linkedDisplayName = linkedPartnerName?.split(' ')[0] || 'Unknown Partner';

  const fetchAccounts = useCallback(async () => {
    const { data } = await supabase
      .from('accounts')
      .select('*')
      .eq('is_deleted', false)
      .order('created_at', { ascending: false });
    
    if (data) setAccounts(data as Account[]);
    setLoading(false);
  }, []);

  const plaidEnabled = import.meta.env.VITE_ENABLE_PLAID !== 'false';
  const { openPlaidLink, isLoading: plaidLoading, createLinkToken } = usePlaidLink(fetchAccounts);

  useEffect(() => {
    if (user) {
      fetchAccounts();
      if (!plaidEnabled) return;
      const timer = setTimeout(() => {
        createLinkToken();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [user, fetchAccounts, createLinkToken, plaidEnabled]);

  // Populate partner form when partner data loads
  useEffect(() => {
    if (partner) {
      setPartnerForm({
        partner_name: partner.partner_name,
        default_ownership_pct: String(partner.default_ownership_pct),
      });
    }
  }, [partner]);

  async function syncTransactions() {
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
      fetchAccounts();
    } catch (err) {
      logError('Accounts sync', err);
      toast.error('Failed to sync transactions');
    } finally {
      setSyncing(false);
    }
  }

  async function loadConnections() {
    setConnections([]);
    setSelectedConnection('');
    const { data, error } = await supabase.from('plaid_items_safe').select('item_id, institution_name');
    if (error) {
      toast.error('Could not load bank connections');
      return;
    }
    setConnections((data ?? []).flatMap(item => item.item_id
      ? [{ id: item.item_id, name: item.institution_name ?? 'Linked bank' }] : []));
  }

  async function disconnectBank() {
    if (!selectedConnection) return;
    setReconnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke('plaid-delete-item', {
        body: { item_id: selectedConnection },
      });
      if (error || !data?.success) throw error ?? new Error('Disconnection failed');
      toast.success('Bank disconnected. Existing transactions were kept.');
      setReconnectDialogOpen(false);
      await fetchAccounts();
    } catch (error) {
      logError('Bank disconnection', error);
      toast.error('Could not disconnect this bank. Please retry.');
    } finally {
      setReconnecting(false);
    }
  }

  async function createAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    const { error } = await supabase.from('accounts').insert({
      user_id: user.id,
      name: newAccount.name,
      type: newAccount.type,
      current_balance: parseFloat(newAccount.current_balance) || 0,
      is_manual: true,
    });

    if (error) {
      toast.error('Failed to create account');
    } else {
      toast.success('Account created');
      setDialogOpen(false);
      setNewAccount({ name: '', type: 'checking', current_balance: '' });
      fetchAccounts();
    }
  }

  async function deleteAccount(id: string) {
    const { error } = await supabase
      .from('accounts')
      .update({ is_deleted: true, deleted_at: new Date().toISOString(), current_balance: 0, available_balance: 0 })
      .eq('id', id);
    
    if (error) {
      toast.error('Failed to delete account');
    } else {
      toast.success('Account deleted');
      fetchAccounts();
    }
  }

  function startEditing(account: Account) {
    setEditingId(account.id);
    setEditingName(account.name);
  }

  function cancelEditing() {
    setEditingId(null);
    setEditingName('');
  }

  async function saveAccountName(id: string) {
    if (!editingName.trim()) {
      toast.error('Account name cannot be empty');
      return;
    }
    const { error } = await supabase
      .from('accounts')
      .update({ name: editingName.trim() })
      .eq('id', id);

    if (error) {
      toast.error('Failed to update account name');
    } else {
      toast.success('Account name updated');
      setEditingId(null);
      setEditingName('');
      fetchAccounts();
    }
  }

  function startEditingBalance(account: Account) {
    setEditingBalanceId(account.id);
    setEditingBalance(String(account.current_balance ?? 0));
  }

  async function saveBalance(id: string) {
    const val = parseFloat(editingBalance);
    if (isNaN(val)) {
      toast.error('Please enter a valid number');
      return;
    }
    const { error } = await supabase
      .from('accounts')
      .update({ current_balance: val })
      .eq('id', id);
    if (error) {
      toast.error('Failed to update balance');
    } else {
      toast.success('Balance updated');
      setEditingBalanceId(null);
      setEditingBalance('');
      fetchAccounts();
    }
  }

  async function toggleZeroBalance(account: Account) {
    const newVal = !account.is_zero_balance;
    const updates: Record<string, any> = { is_zero_balance: newVal };
    if (newVal) {
      updates.current_balance = 0;
      updates.available_balance = 0;
    }
    const { error } = await supabase
      .from('accounts')
      .update(updates)
      .eq('id', account.id);
    if (error) {
      toast.error('Failed to update account');
    } else {
      fetchAccounts();
    }
  }

  async function toggleJoint(account: Account) {
    const newIsJoint = !account.is_joint;
    const { error } = await supabase
      .from('accounts')
      .update({ 
        is_joint: newIsJoint,
        ownership_pct: newIsJoint ? null : null,
        joint_start_date: newIsJoint ? new Date().toISOString().slice(0, 10) : null,
        joint_end_date: null,
      })
      .eq('id', account.id);

    if (error) {
      toast.error('Failed to update account');
    } else {
      fetchAccounts();
    }
  }

  async function updateJointDate(accountId: string, field: 'joint_start_date' | 'joint_end_date', date: Date | undefined) {
    const { error } = await supabase
      .from('accounts')
      .update({ [field]: date ? format(date, 'yyyy-MM-dd') : null })
      .eq('id', accountId);

    if (error) {
      toast.error('Failed to update date');
    } else {
      fetchAccounts();
    }
  }

  async function updateOwnershipPct(accountId: string, pct: string) {
    const numPct = pct === 'default' ? null : parseFloat(pct);
    const { error } = await supabase
      .from('accounts')
      .update({ ownership_pct: numPct })
      .eq('id', accountId);

    if (error) {
      toast.error('Failed to update ownership');
    } else {
      fetchAccounts();
    }
  }

  async function savePartner(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    const pct = parseFloat(partnerForm.default_ownership_pct);
    if (pct <= 0 || pct > 100) {
      toast.error('Ownership must be between 1-100%');
      return;
    }

    if (partner) {
      const { error } = await supabase
        .from('partner_profiles')
        .update({ partner_name: partnerForm.partner_name, default_ownership_pct: pct })
        .eq('id', partner.id);
      if (error) toast.error('Failed to update partner');
      else {
        toast.success('Partner updated');
        setPartnerDialogOpen(false);
        fetchPartner();
      }
    } else {
      const { error } = await supabase
        .from('partner_profiles')
        .insert({ user_id: user.id, partner_name: partnerForm.partner_name, default_ownership_pct: pct });
      if (error) toast.error('Failed to add partner');
      else {
        toast.success('Partner added');
        setPartnerDialogOpen(false);
        fetchPartner();
      }
    }
  }

  async function removePartner() {
    if (!partner) return;
    // Remove joint flags from all accounts
    await supabase.from('accounts').update({ is_joint: false, ownership_pct: null }).eq('user_id', user!.id);
    const { error } = await supabase.from('partner_profiles').delete().eq('id', partner.id);
    if (error) toast.error('Failed to remove partner');
    else {
      toast.success('Partner removed');
      setPartnerDialogOpen(false);
      fetchPartner();
      fetchAccounts();
    }
  }

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-pulse">Loading...</div></div>;
  }

  if (!user) return <Navigate to="/auth" replace />;

  const typeOrder: Record<string, number> = { checking: 0, savings: 1, depository: 2, credit: 3, investment: 4, brokerage: 5, loan: 6 };
  const sortByType = (a: Account, b: Account) => (typeOrder[a.type] ?? 99) - (typeOrder[b.type] ?? 99);

  const linkedAccounts = accounts.filter(a => !a.is_manual).sort(sortByType);
  const manualAccounts = accounts.filter(a => a.is_manual).sort(sortByType);
  const hasLinkedAccounts = linkedAccounts.length > 0;

  const renderAccountCard = (account: Account, isLinked: boolean) => {
    const Icon = accountTypeIcons[account.type as keyof typeof accountTypeIcons] || Wallet;
    const isDebt = account.type === 'credit' || account.type === 'loan';
    const ownershipPct = getOwnershipPct(account);
    const scaledBalance = account.current_balance * (ownershipPct / 100);

    return (
      <Card key={account.id} className={`group cursor-pointer transition-shadow hover:shadow-md ${isLinked ? 'border-primary/20' : ''}`} onClick={() => setSelectedAccount(account)}>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg ${isLinked ? 'bg-primary/10' : 'bg-muted'} flex items-center justify-center`}>
              <Icon className={`w-5 h-5 ${isLinked ? 'text-primary' : 'text-muted-foreground'}`} />
            </div>
            <div>
              {editingId === account.id ? (
                <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                  <Input
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    className="h-7 w-32 text-sm"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveAccountName(account.id);
                      if (e.key === 'Escape') cancelEditing();
                    }}
                  />
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => saveAccountName(account.id)}>
                    <Check className="w-3 h-3 text-primary" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={cancelEditing}>
                    <X className="w-3 h-3 text-muted-foreground" />
                  </Button>
                </div>
              ) : (
                <CardTitle 
                  className="text-base cursor-pointer hover:text-primary transition-colors flex items-center gap-1 group/name"
                  onClick={(e) => { e.stopPropagation(); startEditing(account); }}
                >
                  {account.name}
                  <Pencil className="w-3 h-3 opacity-0 group-hover/name:opacity-100 transition-opacity" />
                </CardTitle>
              )}
              <p className="text-sm text-muted-foreground capitalize">{account.subtype || account.type}</p>
            </div>
          </div>
          <div onClick={e => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="icon"
              className="opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => deleteAccount(account.id)}
            >
              <Trash2 className="w-4 h-4 text-destructive" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {editingBalanceId === account.id ? (
            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
              <Input
                type="number"
                step="0.01"
                value={editingBalance}
                onChange={(e) => setEditingBalance(e.target.value)}
                className="h-8 w-32 text-lg font-bold"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveBalance(account.id);
                  if (e.key === 'Escape') setEditingBalanceId(null);
                }}
              />
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => saveBalance(account.id)}>
                <Check className="w-4 h-4 text-primary" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingBalanceId(null)}>
                <X className="w-4 h-4 text-muted-foreground" />
              </Button>
            </div>
          ) : (
            <p
              className={`text-2xl font-bold ${isDebt && account.current_balance > 0 ? 'text-destructive' : ''} ${account.is_manual && !account.is_zero_balance ? 'cursor-pointer hover:text-primary transition-colors inline-flex items-center gap-1 group/balance' : ''}`}
              onClick={(e) => {
                if (account.is_manual && !account.is_zero_balance) { e.stopPropagation(); startEditingBalance(account); }
              }}
            >
              {formatCurrency(account.is_zero_balance ? 0 : (account.is_joint ? scaledBalance : account.current_balance))}
              {account.is_manual && !account.is_zero_balance && <Pencil className="w-3 h-3 opacity-0 group-hover/balance:opacity-100 transition-opacity" />}
            </p>
          )}
          {account.is_joint && (
            <p className="text-xs text-muted-foreground mt-1">
              {ownershipPct}% of {formatCurrency(account.current_balance)}
            </p>
          )}
          {account.mask && !account.is_joint && (
            <p className="text-sm text-muted-foreground mt-1">••••{account.mask}</p>
          )}

          {/* Joint account controls */}
          {partner && (
            <div className="mt-3 pt-3 border-t space-y-2" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <Label htmlFor={`joint-${account.id}`} className="text-xs flex items-center gap-1 cursor-pointer">
                  <Users className="w-3 h-3" />
                  Joint with {partner.partner_name}
                </Label>
                <Switch
                  id={`joint-${account.id}`}
                  checked={account.is_joint}
                  onCheckedChange={() => toggleJoint(account)}
                />
              </div>
              {account.is_joint && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground whitespace-nowrap">My share:</Label>
                    <Select
                      value={account.ownership_pct != null ? String(account.ownership_pct) : 'default'}
                      onValueChange={(v) => updateOwnershipPct(account.id, v)}
                    >
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">Default ({partner.default_ownership_pct}%)</SelectItem>
                        <SelectItem value="25">25%</SelectItem>
                        <SelectItem value="33">33%</SelectItem>
                        <SelectItem value="40">40%</SelectItem>
                        <SelectItem value="50">50%</SelectItem>
                        <SelectItem value="60">60%</SelectItem>
                        <SelectItem value="67">67%</SelectItem>
                        <SelectItem value="75">75%</SelectItem>
                        <SelectItem value="100">100%</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground whitespace-nowrap">Start:</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("h-7 text-xs justify-start flex-1", !account.joint_start_date && "text-muted-foreground")}>
                          <CalendarIcon className="w-3 h-3 mr-1" />
                          {account.joint_start_date ? format(parseISO(account.joint_start_date), 'MMM d, yyyy') : 'Set date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={account.joint_start_date ? parseISO(account.joint_start_date) : undefined}
                          onSelect={(d) => updateJointDate(account.id, 'joint_start_date', d)}
                          className={cn("p-3 pointer-events-auto")}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground whitespace-nowrap">End:</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("h-7 text-xs justify-start flex-1", !account.joint_end_date && "text-muted-foreground")}>
                          <CalendarIcon className="w-3 h-3 mr-1" />
                          {account.joint_end_date ? format(parseISO(account.joint_end_date), 'MMM d, yyyy') : 'None'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={account.joint_end_date ? parseISO(account.joint_end_date) : undefined}
                          onSelect={(d) => updateJointDate(account.id, 'joint_end_date', d)}
                          className={cn("p-3 pointer-events-auto")}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              )}
            </div>
          )}
          {/* Zero balance toggle for manual accounts */}
          {account.is_manual && (
            <div className={`${partner ? '' : 'mt-3 pt-3 border-t'} space-y-2`} onClick={e => e.stopPropagation()}>
              {!partner && <div />}
              <div className="flex items-center justify-between">
                <Label htmlFor={`zero-${account.id}`} className="text-xs flex items-center gap-1 cursor-pointer">
                  <Clock className="w-3 h-3" />
                  Always zero balance
                </Label>
                <Switch
                  id={`zero-${account.id}`}
                  checked={!!account.is_zero_balance}
                  onCheckedChange={() => toggleZeroBalance(account)}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  const typeLabels: Record<string, string> = {
    checking: 'Checking', savings: 'Savings', depository: 'Depository',
    credit: 'Credit Cards', investment: 'Investments', brokerage: 'Brokerage', loan: 'Loans',
  };

  const renderGroupedAccounts = (accts: Account[], isLinked: boolean) => {
    const groups: Record<string, Account[]> = {};
    accts.forEach(a => {
      const key = a.type;
      if (!groups[key]) groups[key] = [];
      groups[key].push(a);
    });
    return (
      <div className="space-y-6">
        {Object.entries(groups).map(([type, group]) => (
          <div key={type}>
            <h3 className="text-sm font-medium text-muted-foreground mb-3 capitalize">
              {typeLabels[type] || type}
            </h3>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {group.map(account => renderAccountCard(account, isLinked))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <AppLayout>
      <PageHeader
        title="Accounts"
        description="Manage your bank accounts and balances"
        actions={
          <div className="flex gap-2">
            {/* Partner Setup */}
            <Dialog open={partnerDialogOpen} onOpenChange={setPartnerDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Users className="w-4 h-4 mr-2" />
                  {partner ? partner.partner_name : 'Add Partner'}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-primary" />
                    {partner ? 'Edit Partner' : 'Add Partner'}
                  </DialogTitle>
                </DialogHeader>

                {/* Show linked partner info when active */}
                {isLinkedPartner && partner && (
                  <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Linked Partner</span>
                      <Badge variant="secondary" className="gap-1">
                        <Link2 className="w-3 h-3" /> Active
                      </Badge>
                    </div>
                    <p className="text-lg font-semibold">{linkedDisplayName}</p>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>Your default share:</span>
                      <span className="font-medium text-foreground">{partner.default_ownership_pct}%</span>
                      <span>·</span>
                      <span>Partner:</span>
                      <span className="font-medium text-foreground">{100 - partner.default_ownership_pct}%</span>
                    </div>
                  </div>
                )}

                <form onSubmit={savePartner} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Partner Name</Label>
                    <Input
                      placeholder="e.g., Alex"
                      value={partnerForm.partner_name}
                      onChange={(e) => setPartnerForm({ ...partnerForm, partner_name: e.target.value })}
                      required
                    />
                    {isLinkedPartner && (
                      <p className="text-xs text-muted-foreground">
                        This is your label for your partner. Their account name is "{linkedDisplayName}".
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>My Default Ownership %</Label>
                    <Input
                      type="number"
                      min="1"
                      max="100"
                      step="1"
                      placeholder="50"
                      value={partnerForm.default_ownership_pct}
                      onChange={(e) => setPartnerForm({ ...partnerForm, default_ownership_pct: e.target.value })}
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      Your share of joint accounts. Can be overridden per account.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit" className="flex-1">
                      {partner ? 'Update' : 'Add'} Partner
                    </Button>
                    {partner && (
                      <Button type="button" variant="destructive" onClick={removePartner}>
                        Remove
                      </Button>
                    )}
                  </div>
                </form>
              </DialogContent>
            </Dialog>

            {hasLinkedAccounts && (
              <>
                <Button variant="outline" onClick={syncTransactions} disabled={syncing}>
                  <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
                  Sync
                </Button>
                <Dialog open={reconnectDialogOpen} onOpenChange={(open) => {
                  if (reconnecting) return;
                  setReconnectDialogOpen(open);
                  if (open) void loadConnections();
                }}>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="text-warning border-warning/30 hover:bg-warning/10">
                      <Unlink className="w-4 h-4 mr-2" />
                      Disconnect bank
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-warning" />
                        Disconnect a bank
                      </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <p className="text-sm text-muted-foreground">
                        Only the selected bank will be disconnected. Your transaction history will be kept.
                      </p>
                      <select className="w-full rounded border bg-background p-2" aria-label="Bank to disconnect"
                        value={selectedConnection} onChange={e => setSelectedConnection(e.target.value)} disabled={reconnecting}>
                        <option value="">Choose a bank</option>
                        {connections.map((bank, i) => <option key={bank.id} value={bank.id}>{bank.name} ({i + 1})</option>)}
                      </select>
                      <div className="flex gap-2 justify-end">
                        <Button variant="outline" disabled={reconnecting} onClick={() => setReconnectDialogOpen(false)}>Cancel</Button>
                        <Button onClick={disconnectBank} disabled={reconnecting || !selectedConnection}>
                          {reconnecting ? (
                            <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Disconnecting...</>
                          ) : (
                            <><Unlink className="w-4 h-4 mr-2" />Disconnect bank</>
                          )}
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </>
            )}
            {plaidEnabled && (
              <Button variant="outline" onClick={openPlaidLink} disabled={plaidLoading}>
                <Link2 className="w-4 h-4 mr-2" />
                {plaidLoading ? 'Loading...' : 'Connect Bank'}
              </Button>
            )}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="w-4 h-4 mr-2" />Manual Account</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Manual Account</DialogTitle>
                </DialogHeader>
                <form onSubmit={createAccount} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Account Name</Label>
                    <Input
                      placeholder="e.g., Chase Checking"
                      value={newAccount.name}
                      onChange={(e) => setNewAccount({ ...newAccount, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Account Type</Label>
                    <Select value={newAccount.type} onValueChange={(v) => setNewAccount({ ...newAccount, type: v as Account['type'] })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="checking">Checking</SelectItem>
                        <SelectItem value="savings">Savings</SelectItem>
                        <SelectItem value="credit">Credit Card</SelectItem>
                        <SelectItem value="investment">Investment</SelectItem>
                        <SelectItem value="loan">Loan</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Current Balance</Label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={newAccount.current_balance}
                      onChange={(e) => setNewAccount({ ...newAccount, current_balance: e.target.value })}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full">Create Account</Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      <div className="mb-6">
        <ToggleGroup
          type="single"
          value={accountView}
          onValueChange={(v) => { if (v) setAccountView(v as 'accounts' | 'upcoming'); }}
          variant="outline"
          className="justify-start"
        >
          <ToggleGroupItem value="accounts" className="gap-2 px-4">
            <Wallet className="w-4 h-4" />
            Accounts
          </ToggleGroupItem>
          <ToggleGroupItem value="upcoming" className="gap-2 px-4">
            <Clock className="w-4 h-4" />
            Upcoming Payments
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {accountView === 'upcoming' ? (
        <UpcomingPayments accounts={accounts} />
      ) : loading ? (
        <div className="animate-pulse text-muted-foreground">Loading accounts...</div>
      ) : accounts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Building2 className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">{plaidEnabled ? 'Connect your bank' : 'Add your first account'}</h3>
            <p className="text-muted-foreground mb-6">
              {plaidEnabled ? 'Link your bank accounts for automatic syncing, or add accounts manually.' : 'Start tracking balances by adding an account manually.'}
            </p>
            <div className="flex gap-3 justify-center flex-wrap">
              {plaidEnabled && (
                <Button onClick={openPlaidLink} disabled={plaidLoading}>
                  <Link2 className="w-4 h-4 mr-2" />
                  Connect Bank
                </Button>
              )}
              <Button variant="outline" onClick={() => setDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Add Manually
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {(() => {
            const calc = (filtered: Account[]) => {
              const checking = filtered
                .filter(a => a.type === 'checking' || ((a as any).type === 'depository' && a.subtype !== 'savings'))
                .reduce((sum, a) => sum + (a.current_balance || 0), 0);
              const credit = filtered
                .filter(a => a.type === 'credit')
                .reduce((sum, a) => sum + (a.current_balance || 0), 0);
              return checking - credit;
            };
            const isLiquidityAccount = (a: Account) =>
              a.type === 'checking' || ((a as any).type === 'depository' && a.subtype !== 'savings') || a.type === 'credit';
            const personal = accounts.filter(a => isLiquidityAccount(a) && !a.is_joint);
            const joint = accounts.filter(a => isLiquidityAccount(a) && a.is_joint);

            return (
              <div className="grid gap-4 md:grid-cols-2">
                <StatCard
                  title="Personal Liquidity"
                  value={formatCurrency(calc(personal))}
                  subtitle="Non-joint checking minus credit cards"
                  icon={<Droplets className="w-5 h-5" />}
                />
                {joint.length > 0 && (
                  <StatCard
                    title="Joint Liquidity"
                    value={formatCurrency(calc(joint))}
                    subtitle="Joint checking minus credit cards"
                    icon={<Users className="w-5 h-5" />}
                  />
                )}
              </div>
            );
          })()}
          {linkedAccounts.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Link2 className="w-5 h-5 text-primary" />
                Linked Accounts
              </h2>
              {renderGroupedAccounts(linkedAccounts, true)}
            </div>
          )}

          {manualAccounts.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Wallet className="w-5 h-5 text-muted-foreground" />
                Manual Accounts
              </h2>
              {renderGroupedAccounts(manualAccounts, false)}
            </div>
          )}
        </div>
      )}
      <AccountTransactionsSheet
        account={selectedAccount}
        open={!!selectedAccount}
        onOpenChange={(open) => { if (!open) setSelectedAccount(null); }}
      />
    </AppLayout>
  );
}
