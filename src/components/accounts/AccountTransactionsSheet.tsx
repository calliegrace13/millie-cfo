import { useEffect, useState, useCallback } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency } from '@/lib/format';
import { Account, Transaction } from '@/lib/types';
import { Wallet, CreditCard, PiggyBank, TrendingUp, Landmark } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

const accountTypeIcons = {
  checking: Wallet,
  savings: PiggyBank,
  credit: CreditCard,
  investment: TrendingUp,
  loan: Landmark,
  depository: Wallet,
  brokerage: TrendingUp,
};

interface AccountTransactionsSheetProps {
  account: Account | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AccountTransactionsSheet({ account, open, onOpenChange }: AccountTransactionsSheetProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const fetchTransactions = useCallback(async () => {
    if (!account) return;
    setLoading(true);
    const { data } = await supabase
      .from('transactions')
      .select('*')
      .eq('account_id', account.id)
      .order('date', { ascending: false })
      .limit(100);
    
    setTransactions((data as Transaction[]) || []);
    setLoading(false);
  }, [account]);

  useEffect(() => {
    if (open && account) {
      fetchTransactions();
    } else {
      setTransactions([]);
    }
  }, [open, account, fetchTransactions]);

  if (!account) return null;

  const Icon = accountTypeIcons[account.type as keyof typeof accountTypeIcons] || Wallet;

  // Group transactions by month
  const grouped: Record<string, Transaction[]> = {};
  transactions.forEach(tx => {
    const monthKey = tx.date.substring(0, 7);
    if (!grouped[monthKey]) grouped[monthKey] = [];
    grouped[monthKey].push(tx);
  });

  const monthKeys = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg p-0 flex flex-col">
        <SheetHeader className="p-6 pb-4 border-b">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Icon className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-left truncate">{account.name}</SheetTitle>
              <p className="text-sm text-muted-foreground capitalize">{account.subtype || account.type}</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold font-mono">{formatCurrency(account.current_balance)}</p>
              {account.mask && <p className="text-xs text-muted-foreground">••••{account.mask}</p>}
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1">
          {loading ? (
            <div className="p-6 text-center text-muted-foreground animate-pulse">Loading transactions...</div>
          ) : transactions.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground">No transactions found for this account.</div>
          ) : (
            <div className="divide-y">
              {monthKeys.map(monthKey => {
                const monthTxs = grouped[monthKey];
                const monthLabel = new Date(monthKey + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                const monthTotal = monthTxs.reduce((sum, tx) => sum + tx.amount, 0);

                return (
                  <div key={monthKey}>
                    <div className="flex items-center justify-between px-6 py-2 bg-muted/50 sticky top-0 z-10">
                      <span className="text-xs font-medium text-muted-foreground">{monthLabel}</span>
                      <span className={`text-xs font-mono font-medium ${monthTotal > 0 ? 'text-destructive' : 'text-success'}`}>
                        {formatCurrency(monthTotal > 0 ? -monthTotal : Math.abs(monthTotal))}
                      </span>
                    </div>
                    {monthTxs.map(tx => {
                      const displayAmount = tx.amount > 0 ? -tx.amount : Math.abs(tx.amount);
                      return (
                        <div key={tx.id} className="flex items-center gap-3 px-6 py-3 hover:bg-muted/30">
                          <div className="w-12 text-xs text-muted-foreground shrink-0">
                            {new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{tx.merchant_name || tx.name}</p>
                            {tx.category && (
                              <Badge variant="secondary" className="text-[10px] h-4 px-1 mt-0.5">
                                {tx.category}
                              </Badge>
                            )}
                          </div>
                          <div className={`font-mono text-sm font-medium shrink-0 ${tx.amount > 0 ? 'text-destructive' : 'text-success'}`}>
                            {formatCurrency(displayAmount)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        <div className="p-4 border-t">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              onOpenChange(false);
              navigate(`/manage-finances?account=${account.id}`);
            }}
          >
            View all in Transactions
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
