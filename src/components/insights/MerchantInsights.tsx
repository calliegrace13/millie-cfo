import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/format';
import { Transaction, Account } from '@/lib/types';
import { parseISO, format, subMonths } from 'date-fns';
import { Search, Store } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

type Props = {
  transactions: Transaction[];
  accounts: Account[];
  getMultiplier: (tx: Transaction, accounts: Account[]) => number;
};

type MerchantData = {
  name: string;
  totalSpent: number;
  txCount: number;
  avgAmount: number;
  monthlySpend: Record<string, number>;
  categories: string[];
};

export function MerchantInsights({ transactions, accounts, getMultiplier }: Props) {
  const [search, setSearch] = useState('');
  const [selectedMerchant, setSelectedMerchant] = useState<string | null>(null);

  const sixMonthsAgo = subMonths(new Date(), 6);

  const merchants = useMemo(() => {
    const map: Record<string, MerchantData> = {};

    transactions.forEach(tx => {
      if (tx.amount <= 0) return;
      const txDate = parseISO(tx.date);
      if (txDate < sixMonthsAgo) return;
      if (tx.category === 'Transfer' || tx.category === 'Credit Card Payment') return;

      const name = tx.merchant_name || tx.name;
      const scaled = tx.amount * getMultiplier(tx, accounts);
      const month = format(txDate, 'yyyy-MM');

      if (!map[name]) {
        map[name] = { name, totalSpent: 0, txCount: 0, avgAmount: 0, monthlySpend: {}, categories: [] };
      }
      map[name].totalSpent += scaled;
      map[name].txCount += 1;
      map[name].monthlySpend[month] = (map[name].monthlySpend[month] || 0) + scaled;
      if (tx.category && !map[name].categories.includes(tx.category)) {
        map[name].categories.push(tx.category);
      }
    });

    return Object.values(map)
      .map(m => ({ ...m, avgAmount: m.totalSpent / m.txCount }))
      .sort((a, b) => b.totalSpent - a.totalSpent);
  }, [transactions, accounts, getMultiplier]);

  const filtered = search
    ? merchants.filter(m => m.name.toLowerCase().includes(search.toLowerCase()))
    : merchants.slice(0, 20);

  const selectedData = selectedMerchant ? merchants.find(m => m.name === selectedMerchant) : null;

  const chartData = useMemo(() => {
    if (!selectedData) return [];
    const months: string[] = [];
    for (let i = 5; i >= 0; i--) {
      months.push(format(subMonths(new Date(), i), 'yyyy-MM'));
    }
    return months.map(m => ({
      month: format(parseISO(m + '-01'), 'MMM'),
      amount: Math.round(selectedData.monthlySpend[m] || 0),
    }));
  }, [selectedData]);

  return (
    <div className="space-y-6">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search merchants..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {selectedData && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Store className="w-4 h-4" />
              {selectedData.name}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <p className="text-xs text-muted-foreground">Total (6mo)</p>
                <p className="text-lg font-bold">{formatCurrency(selectedData.totalSpent)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Transactions</p>
                <p className="text-lg font-bold">{selectedData.txCount}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Avg Amount</p>
                <p className="text-lg font-bold">{formatCurrency(selectedData.avgAmount)}</p>
              </div>
            </div>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `$${v}`} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Top Merchants (6 Months)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {filtered.map(m => (
              <button
                key={m.name}
                onClick={() => setSelectedMerchant(m.name === selectedMerchant ? null : m.name)}
                className={`w-full flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50 text-left transition-colors ${m.name === selectedMerchant ? 'bg-muted' : ''}`}
              >
                <div>
                  <p className="font-medium text-sm">{m.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {m.txCount} transactions · {m.categories.join(', ') || 'Uncategorized'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-sm font-medium">{formatCurrency(m.totalSpent)}</p>
                  <p className="text-xs text-muted-foreground">{formatCurrency(m.avgAmount)} avg</p>
                </div>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No merchants found</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
