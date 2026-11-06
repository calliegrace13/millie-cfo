import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOwnership } from '@/hooks/useOwnership';
import { useSettings } from '@/hooks/useSettings';
import { Account, RecurringTransaction } from '@/lib/types';
import { formatCurrency } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { CreditCard, Repeat, CheckCircle2, AlertTriangle, XCircle, Wallet, Users, ChevronDown, CalendarClock, Pencil } from 'lucide-react';
import { format, addDays, parseISO, setDate, addMonths, isBefore, startOfDay } from 'date-fns';
import { toast } from 'sonner';

type CreditCardRecord = {
  id: string;
  account_id: string | null;
  statement_close_day: number | null;
  payment_due_day: number | null;
  card_name: string;
};

type UpcomingPayment = {
  id: string;
  name: string;
  amount: number;
  dueInfo: string;
  dueDate: Date | null;
  type: 'credit_card' | 'recurring';
  isJoint: boolean;
  accountId?: string;
  creditCardId?: string;
  fundingSources: Account[];
  coverageStatus: 'covered' | 'partial' | 'insufficient';
  coverageAmount: number;
};

type Props = {
  accounts: Account[];
};

function getNextDueDate(dayOfMonth: number): Date {
  const today = startOfDay(new Date());
  let candidate = setDate(today, Math.min(dayOfMonth, 28));
  if (isBefore(candidate, today)) {
    candidate = addMonths(candidate, 1);
    candidate = setDate(candidate, Math.min(dayOfMonth, 28));
  }
  return candidate;
}

export function UpcomingPayments({ accounts }: Props) {
  const { user } = useAuth();
  const { getOwnershipPct } = useOwnership();
  const { showPartnerMode } = useSettings();
  const [recurringTxs, setRecurringTxs] = useState<RecurringTransaction[]>([]);
  const [creditCards, setCreditCards] = useState<CreditCardRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!user) return;
    const [recRes, ccRes] = await Promise.all([
      supabase
        .from('recurring_transactions')
        .select('*')
        .eq('is_active', true)
        .order('next_expected_date', { ascending: true }),
      supabase
        .from('credit_cards')
        .select('id, account_id, statement_close_day, payment_due_day, card_name'),
    ]);
    if (recRes.data) setRecurringTxs(recRes.data as RecurringTransaction[]);
    if (ccRes.data) setCreditCards(ccRes.data as CreditCardRecord[]);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const ccByAccountId = useMemo(() => {
    const map: Record<string, CreditCardRecord> = {};
    for (const cc of creditCards) {
      if (cc.account_id) map[cc.account_id] = cc;
    }
    return map;
  }, [creditCards]);

  const { personalChecking, jointChecking } = useMemo(() => {
    const isChecking = (a: Account) =>
      a.type === 'checking' || ((a.type as string) === 'depository' && a.subtype !== 'savings');
    return {
      personalChecking: accounts.filter(a => isChecking(a) && !a.is_joint),
      jointChecking: accounts.filter(a => isChecking(a) && a.is_joint),
    };
  }, [accounts]);

  const personalCheckingTotal = useMemo(
    () => personalChecking.reduce((sum, a) => sum + (a.current_balance || 0), 0),
    [personalChecking]
  );
  const jointCheckingTotal = useMemo(
    () => jointChecking.reduce((sum, a) => sum + (a.current_balance || 0), 0),
    [jointChecking]
  );

  const payments: UpcomingPayment[] = useMemo(() => {
    const result: UpcomingPayment[] = [];

    const creditCardAccounts = accounts.filter(a => a.type === 'credit' && (a.current_balance || 0) > 0);
    for (const cc of creditCardAccounts) {
      const amount = cc.current_balance || 0;
      const isJoint = cc.is_joint;
      const sources = isJoint ? jointChecking : personalChecking;
      const fundingTotal = sources.reduce((sum, a) => sum + (a.current_balance || 0), 0);

      const ccRecord = ccByAccountId[cc.id];
      const dueDay = ccRecord?.payment_due_day;
      const dueDate = dueDay ? getNextDueDate(dueDay) : null;
      const dueInfo = dueDate ? `Due ${format(dueDate, 'MMM d')}` : 'No due date set';

      result.push({
        id: `cc-${cc.id}`,
        name: cc.name,
        amount,
        dueInfo,
        dueDate,
        type: 'credit_card',
        isJoint,
        accountId: cc.id,
        creditCardId: ccRecord?.id,
        fundingSources: sources,
        coverageStatus: fundingTotal >= amount ? 'covered' : fundingTotal >= amount * 0.5 ? 'partial' : 'insufficient',
        coverageAmount: fundingTotal,
      });
    }

    const today = new Date();
    const thirtyDaysOut = addDays(today, 30);

    for (const rt of recurringTxs) {
      if (!rt.next_expected_date) continue;
      const dueDate = parseISO(rt.next_expected_date);
      if (dueDate > thirtyDaysOut) continue;

      const amount = Math.abs(rt.expected_amount);
      if (amount <= 0) continue;

      const isJoint = false;
      const sources = personalChecking;
      const fundingTotal = sources.reduce((sum, a) => sum + (a.current_balance || 0), 0);

      result.push({
        id: `rec-${rt.id}`,
        name: rt.name,
        amount,
        dueInfo: `Due ${format(dueDate, 'MMM d')}`,
        dueDate,
        type: 'recurring',
        isJoint,
        fundingSources: sources,
        coverageStatus: fundingTotal >= amount ? 'covered' : fundingTotal >= amount * 0.5 ? 'partial' : 'insufficient',
        coverageAmount: fundingTotal,
      });
    }

    result.sort((a, b) => {
      if (a.dueDate && b.dueDate) return a.dueDate.getTime() - b.dueDate.getTime();
      if (a.dueDate && !b.dueDate) return -1;
      if (!a.dueDate && b.dueDate) return 1;
      return b.amount - a.amount;
    });

    return result;
  }, [accounts, recurringTxs, personalChecking, jointChecking, ccByAccountId]);

  async function updateDueDay(creditCardId: string, field: 'statement_close_day' | 'payment_due_day', value: string) {
    const numVal = value ? parseInt(value, 10) : null;
    if (numVal !== null && (numVal < 1 || numVal > 31)) {
      toast.error('Day must be between 1 and 31');
      return;
    }
    const { error } = await supabase
      .from('credit_cards')
      .update({ [field]: numVal })
      .eq('id', creditCardId);
    if (error) {
      toast.error('Failed to update');
    } else {
      toast.success('Updated');
      fetchData();
    }
  }

  if (loading) {
    return <div className="animate-pulse text-muted-foreground">Loading upcoming payments...</div>;
  }

  const hasJointAccounts = jointChecking.length > 0 || payments.some(p => p.isJoint);
  const isSplitView = showPartnerMode && hasJointAccounts;

  const personalPayments = payments.filter(p => !p.isJoint);
  const jointPayments = payments.filter(p => p.isJoint);

  const personalTotal = personalPayments.reduce((sum, p) => sum + p.amount, 0);
  const jointTotal = jointPayments.reduce((sum, p) => sum + p.amount, 0);

  if (isSplitView) {
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Personal column */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Wallet className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-semibold">Personal</h3>
          </div>

          <FundingSummaryCard
            icon={<Wallet className="w-4 h-4" />}
            title="Personal Checking"
            total={personalCheckingTotal}
            count={personalChecking.length}
          />

          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Upcoming</span>
            <Badge variant="secondary" className="text-xs">
              {formatCurrency(personalTotal)} due
            </Badge>
          </div>

          {personalPayments.length === 0 ? (
            <EmptyState />
          ) : (
            <PaymentList
              payments={personalPayments}
              creditCards={creditCards}
              onUpdateDueDay={updateDueDay}
            />
          )}
        </div>

        {/* Joint column */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-semibold">Joint</h3>
          </div>

          <FundingSummaryCard
            icon={<Users className="w-4 h-4" />}
            title="Joint Checking"
            total={jointCheckingTotal}
            count={jointChecking.length}
          />

          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Upcoming</span>
            <Badge variant="secondary" className="text-xs">
              {formatCurrency(jointTotal)} due
            </Badge>
          </div>

          {jointPayments.length === 0 ? (
            <EmptyState />
          ) : (
            <PaymentList
              payments={jointPayments}
              creditCards={creditCards}
              onUpdateDueDay={updateDueDay}
            />
          )}
        </div>
      </div>
    );
  }

  // Default: single-column view (no partner mode or no joint accounts)
  const totalDue = payments.reduce((sum, p) => sum + p.amount, 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <FundingSummaryCard
          icon={<Wallet className="w-4 h-4" />}
          title="Personal Checking Funds"
          total={personalCheckingTotal}
          count={personalChecking.length}
        />
        {jointChecking.length > 0 && (
          <FundingSummaryCard
            icon={<Users className="w-4 h-4" />}
            title="Joint Checking Funds"
            total={jointCheckingTotal}
            count={jointChecking.length}
          />
        )}
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Upcoming Payments</h3>
        <Badge variant="secondary" className="text-sm">
          {formatCurrency(totalDue)} total due
        </Badge>
      </div>

      {payments.length === 0 ? (
        <EmptyState />
      ) : (
        <PaymentList
          payments={payments}
          creditCards={creditCards}
          onUpdateDueDay={updateDueDay}
        />
      )}
    </div>
  );
}

/* ─── Sub-components ─── */

function FundingSummaryCard({ icon, title, total, count }: {
  icon: React.ReactNode;
  title: string;
  total: number;
  count: number;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold">{formatCurrency(total)}</p>
        <p className="text-xs text-muted-foreground mt-1">
          {count} account{count !== 1 ? 's' : ''}
        </p>
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  return (
    <Card>
      <CardContent className="py-8 text-center">
        <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500 mb-3" />
        <p className="font-medium">All clear!</p>
        <p className="text-sm text-muted-foreground">No upcoming payments.</p>
      </CardContent>
    </Card>
  );
}

function PaymentList({ payments, creditCards, onUpdateDueDay }: {
  payments: UpcomingPayment[];
  creditCards: CreditCardRecord[];
  onUpdateDueDay: (ccId: string, field: 'statement_close_day' | 'payment_due_day', value: string) => void;
}) {
  return (
    <div className="space-y-3">
      {payments.map((payment) => {
        const ccRecord = payment.creditCardId
          ? creditCards.find(c => c.id === payment.creditCardId)
          : undefined;

        return (
          <Collapsible key={payment.id}>
            <Card className="overflow-hidden">
              <CollapsibleTrigger className="w-full text-left">
                <div className="flex items-center gap-4 p-4 cursor-pointer hover:bg-muted/50 transition-colors">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                    payment.type === 'credit_card' ? 'bg-primary/10' : 'bg-accent'
                  }`}>
                    {payment.type === 'credit_card' ? (
                      <CreditCard className="w-5 h-5 text-primary" />
                    ) : (
                      <Repeat className="w-5 h-5 text-muted-foreground" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{payment.name}</p>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <CalendarClock className="w-3.5 h-3.5" />
                      <span>{payment.dueInfo}</span>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="font-semibold text-destructive">{formatCurrency(payment.amount)}</p>
                    <div className="flex items-center gap-1 justify-end mt-1">
                      <StatusIcon status={payment.coverageStatus} />
                      <span className={`text-xs ${
                        payment.coverageStatus === 'covered' ? 'text-success' :
                        payment.coverageStatus === 'partial' ? 'text-warning' :
                        'text-destructive'
                      }`}>
                        {statusLabel(payment.coverageStatus)}
                      </span>
                    </div>
                  </div>

                  <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 transition-transform [[data-state=open]_&]:rotate-180" />
                </div>
              </CollapsibleTrigger>

              <CollapsibleContent>
                <div className="px-4 pb-4 border-t space-y-4">
                  {payment.type === 'credit_card' && ccRecord && (
                    <div className="mt-3 p-3 rounded-md bg-muted/30 space-y-3">
                      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                        <CalendarClock className="w-3.5 h-3.5" />
                        Billing Cycle
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        <DayOfMonthEditor
                          label="Statement closes"
                          value={ccRecord.statement_close_day}
                          onSave={(v) => onUpdateDueDay(ccRecord.id, 'statement_close_day', v)}
                        />
                        <DayOfMonthEditor
                          label="Payment due"
                          value={ccRecord.payment_due_day}
                          onSave={(v) => onUpdateDueDay(ccRecord.id, 'payment_due_day', v)}
                        />
                      </div>
                    </div>
                  )}

                  {payment.type === 'credit_card' && !ccRecord && (
                    <p className="mt-3 text-xs text-muted-foreground italic">
                      Set up this card in Card Benefits to configure billing dates.
                    </p>
                  )}

                  <div>
                    <p className="text-xs font-medium text-muted-foreground mt-3 mb-2">
                      {payment.isJoint ? 'Joint' : 'Personal'} checking accounts available
                    </p>
                    {payment.fundingSources.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic">No matching checking accounts found</p>
                    ) : (
                      <div className="space-y-2">
                        {payment.fundingSources.map((src) => {
                          const balance = src.current_balance || 0;
                          const canCover = balance >= payment.amount;
                          return (
                            <div key={src.id} className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2">
                              <div className="flex items-center gap-2">
                                <Wallet className="w-4 h-4 text-muted-foreground" />
                                <span className="text-sm font-medium">{src.name}</span>
                                {src.mask && <span className="text-xs text-muted-foreground">••••{src.mask}</span>}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold">{formatCurrency(balance)}</span>
                                {canCover ? (
                                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                ) : (
                                  <XCircle className="w-4 h-4 text-destructive" />
                                )}
                              </div>
                            </div>
                          );
                        })}
                        <div className="flex items-center justify-between px-3 py-1 text-xs text-muted-foreground">
                          <span>Combined total</span>
                          <span className="font-medium">{formatCurrency(payment.coverageAmount)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </CollapsibleContent>

              <div className="h-1 bg-muted">
                <div
                  className={`h-full transition-all ${
                    payment.coverageStatus === 'covered' ? 'bg-success' :
                    payment.coverageStatus === 'partial' ? 'bg-warning' :
                    'bg-destructive'
                  }`}
                  style={{
                    width: `${Math.min(100, (payment.coverageAmount / payment.amount) * 100)}%`,
                  }}
                />
              </div>
            </Card>
          </Collapsible>
        );
      })}
    </div>
  );
}

function StatusIcon({ status }: { status: UpcomingPayment['coverageStatus'] }) {
  switch (status) {
    case 'covered':
      return <CheckCircle2 className="w-5 h-5 text-success" />;
    case 'partial':
      return <AlertTriangle className="w-5 h-5 text-warning" />;
    case 'insufficient':
      return <XCircle className="w-5 h-5 text-destructive" />;
  }
}

function statusLabel(status: UpcomingPayment['coverageStatus']) {
  switch (status) {
    case 'covered': return 'Covered';
    case 'partial': return 'Partial';
    case 'insufficient': return 'Not covered';
  }
}

function DayOfMonthEditor({ label, value, onSave }: {
  label: string;
  value: number | null;
  onSave: (val: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ? String(value) : '');

  function handleSave() {
    onSave(draft);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="space-y-1">
        <Label className="text-xs">{label}</Label>
        <div className="flex items-center gap-1">
          <Input
            type="number"
            min={1}
            max={31}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="h-7 text-xs w-16"
            placeholder="Day"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') setEditing(false);
            }}
          />
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleSave}>
            <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="space-y-1 cursor-pointer group"
      onClick={() => { setDraft(value ? String(value) : ''); setEditing(true); }}
    >
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-1 text-sm">
        {value ? (
          <span className="font-medium">{getOrdinal(value)} of month</span>
        ) : (
          <span className="text-muted-foreground italic">Not set</span>
        )}
        <Pencil className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </div>
  );
}

function getOrdinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
