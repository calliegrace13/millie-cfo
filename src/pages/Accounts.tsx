import {useModules} from '@/hooks/useModules';
import {accountDisplayWeight,liquidityByCurrency} from '@/lib/account-display';
import {AccountHistory} from '@/components/AccountHistory';
import { DataCoverage } from '@/components/DataCoverage';
import { useHousehold } from '@/hooks/useHousehold';
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
import { Navigate, Link } from 'react-router-dom';
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
  const {isEnabled}=useModules();
  const {reload: reloadHousehold,data:householdData,continuity,partnerId:householdPartnerId,loading:householdLoading,error:householdError}=useHousehold();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [accountView, setAccountView] = useState<'accounts' | 'upcoming'>('accounts');
  const [syncing, setSyncing] = useState(false);
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
    void reloadHousehold();
    setLoading(false);
  }, [reloadHousehold]);

  const { openPlaidLink, isLoading: plaidLoading, ready: plaidReady, createLinkToken } = usePlaidLink(fetchAccounts);

  useEffect(() => {
    if (user) {
      fetchAccounts();
      const timer = setTimeout(() => {
        createLinkToken();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [user, fetchAccounts, createLinkToken]);

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
      if (data.busy) toast.info('A bank sync is already running. Check the coverage panel shortly.'); else toast.success(`Synced ${data.synced} transactions`);
      fetchAccounts();
    } catch (err) {
      logError('Accounts sync', err);
      toast.error('Failed to sync transactions');
    } finally {
      setSyncing(false);
    }
  }

  async function reconnectAccounts() {
    setReconnecting(true);
    try {
      const { data: plaidItems, error: fetchError } = await supabase
        .from('plaid_items_safe')
        .select('item_id');

      if (fetchError) throw fetchError;

      if (!plaidItems || plaidItems.length === 0) {
        toast.info('No linked accounts to reconnect');
        setReconnecting(false);
        setReconnectDialogOpen(false);
        return;
      }

      for (const item of plaidItems) {
        const { error } = await supabase.functions.invoke('plaid-delete-item', {
          body: { item_id: item.item_id },
        });
        if (error) console.error('Error deleting Plaid item:', error);
      }

      toast.success('Accounts disconnected. Click "Connect Bank" to re-link with extended history.');
      setReconnectDialogOpen(false);
      fetchAccounts();
      setTimeout(() => openPlaidLink(), 500);
    } catch (err) {
      logError('Reconnect accounts', err);
      toast.error('Failed to disconnect accounts');
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
      .update({ is_deleted: true, deleted_at: new Date().toISOString() })
      .eq('id', id);
    
    if (error) {
      toast.error('Failed to delete account');
    } else {
      toast.success('Account archived; history retained');
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
    const displayDate=format(new Date(),'yyyy-MM-dd');
    const root=continuity.find(c=>c.source_id===account.id&&c.starts_on<=displayDate)?.original_id;
    const logical=householdData.accounts.find(a=>a.id===(root||account.id));
    const ownershipPct = logical?Number((accountDisplayWeight(logical,householdData,user?.id||'',householdPartnerId,displayDate)*100).toFixed(2)):100;
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
              aria-label="Archive account and keep history"
              title="Archive account and keep history"
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
              {householdLoading?'Loading share…':householdError?'Share unavailable':formatCurrency(account.is_zero_balance ? 0 : scaledBalance,account.currency||'USD')}
              {account.is_manual && !account.is_zero_balance && <Pencil className="w-3 h-3 opacity-0 group-hover/balance:opacity-100 transition-opacity" />}
            </p>
          )}
          {ownershipPct!==100 && (
            <p className="text-xs text-muted-foreground mt-1">
              {ownershipPct}% of {formatCurrency(account.current_balance,account.currency||'USD')}
            </p>
          )}
          {account.mask && (
            <p className="text-sm text-muted-foreground mt-1">••••{account.mask}</p>
          )}

          <p className="text-sm text-muted-foreground mt-3">My balance share today: {householdLoading||householdError?'Unavailable':ownershipPct+'%'} · {account.user_id===user?.id&&isEnabled('household')?<Link className="underline" to={`/household?account=${encodeURIComponent(account.id)}#splits`} onClick={e=>e.stopPropagation()}>Set this account’s transaction split</Link>:<span>{account.user_id===user?.id?'Saved dated splits remain active. Enable Household to edit them.':'The person who connected this account manages its transaction split.'}</span>}</p>
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
            <Button asChild variant="outline"><Link to="/investments">Investment balances</Link></Button>
            {isEnabled('household')&&<Button asChild variant="outline"><Link to="/household"><Users className="w-4 h-4 mr-2" />Household</Link></Button>}
            {hasLinkedAccounts && (
              <>
                <Button variant="outline" onClick={syncTransactions} disabled={syncing}>
                  <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
                  Sync
                </Button>
                <Dialog open={reconnectDialogOpen} onOpenChange={setReconnectDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="text-warning border-warning/30 hover:bg-warning/10">
                      <Unlink className="w-4 h-4 mr-2" />
                      Reconnect
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-warning" />
                        Reconnect Accounts
                      </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <p className="text-sm text-muted-foreground">
                        This will disconnect all your linked bank accounts and prompt you to reconnect them with <strong>up to 2 years of transaction history</strong> (730 days).
                      </p>
                      <div className="bg-warning/10 border border-warning/30 rounded-lg p-3">
                        <p className="text-sm text-foreground">
                          <strong>Note:</strong> Your existing transactions will be preserved. Some banks may still limit historical data regardless of this setting.
                        </p>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <Button variant="outline" onClick={() => setReconnectDialogOpen(false)}>Cancel</Button>
                        <Button onClick={reconnectAccounts} disabled={reconnecting}>
                          {reconnecting ? (
                            <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Disconnecting...</>
                          ) : (
                            <><Unlink className="w-4 h-4 mr-2" />Disconnect & Reconnect</>
                          )}
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </>
            )}
            <Button variant="outline" onClick={openPlaidLink} disabled={plaidLoading}>
              <Link2 className="w-4 h-4 mr-2" />
              {plaidLoading ? 'Loading...' : 'Connect Bank'}
            </Button>
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

      <AccountHistory/>
      <details className="mb-6 border rounded p-3"><summary>Data coverage</summary><DataCoverage/></details>
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
            <h3 className="text-lg font-medium mb-2">Connect your bank</h3>
            <p className="text-muted-foreground mb-6">Link your bank accounts for automatic syncing, or add accounts manually.</p>
            <div className="flex gap-3 justify-center flex-wrap">
              <Button onClick={openPlaidLink} disabled={plaidLoading}>
                <Link2 className="w-4 h-4 mr-2" />
                Connect Bank
              </Button>
              <Button variant="outline" onClick={() => setDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Add Manually
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {householdError?<p role="alert">Balance shares could not be loaded. <Button variant="outline" onClick={reloadHousehold}>Retry</Button></p>:householdLoading?<p role="status">Loading balance shares…</p>:<div className="grid gap-4 md:grid-cols-2">{liquidityByCurrency(householdData,user?.id||'',householdPartnerId,format(new Date(),'yyyy-MM-dd')).map(row=><div key={row.currency} className="contents"><StatCard title={`My liquidity · ${row.currency}`} value={formatCurrency(row.mine,row.currency)} subtitle="My dated share of checking minus credit cards" icon={<Droplets className="w-5 h-5"/>}/><StatCard title={`Household liquidity · ${row.currency}`} value={formatCurrency(row.household,row.currency)} subtitle="Included checking minus credit cards, counted once" icon={<Users className="w-5 h-5"/>}/></div>)}</div>}
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
