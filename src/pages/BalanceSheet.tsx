import { useState, useEffect } from 'react';
import { logError } from '@/lib/logging';
import { useNavigate } from 'react-router-dom';
import { useOwnership } from '@/hooks/useOwnership';
import { format, subYears, startOfYear, endOfYear } from 'date-fns';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency } from '@/lib/format';
import { toast } from 'sonner';
import { Camera, History } from 'lucide-react';
import type { Account, Asset } from '@/lib/types';

type BalanceSheetData = {
  currentAssets: { name: string; currentYear: number; priorYear: number }[];
  fixedAssets: { name: string; currentYear: number; priorYear: number }[];
  currentLiabilities: { name: string; currentYear: number; priorYear: number }[];
  longTermLiabilities: { name: string; currentYear: number; priorYear: number }[];
};

type BalanceSheetSnapshot = {
  id: string;
  user_id: string;
  snapshot_date: string;
  total_assets: number;
  current_assets: number;
  fixed_assets: number;
  total_liabilities: number;
  current_liabilities: number;
  long_term_liabilities: number;
  total_equity: number;
  created_at: string;
  updated_at: string;
};

export function BalanceSheetContent() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { buildMultiplierMap } = useOwnership();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [priorYearSnapshot, setPriorYearSnapshot] = useState<BalanceSheetSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const priorYear = currentYear - 1;

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  async function fetchData() {
    setLoading(true);
    const priorYearEnd = format(endOfYear(subYears(currentDate, 1)), 'yyyy-MM-dd');
    
    const [accountsRes, assetsRes, snapshotRes] = await Promise.all([
      supabase
        .from('accounts')
        .select('*')
        .eq('user_id', user!.id)
        .or('is_deleted.is.null,is_deleted.eq.false'),
      supabase
        .from('assets')
        .select('*')
        .eq('user_id', user!.id),
      supabase
        .from('balance_sheet_snapshots')
        .select('*')
        .eq('user_id', user!.id)
        .lte('snapshot_date', priorYearEnd)
        .order('snapshot_date', { ascending: false })
        .limit(1),
    ]);

    if (accountsRes.data) setAccounts(accountsRes.data as unknown as Account[]);
    if (assetsRes.data) setAssets(assetsRes.data as unknown as Asset[]);
    if (snapshotRes.data && snapshotRes.data.length > 0) {
      setPriorYearSnapshot(snapshotRes.data[0] as unknown as BalanceSheetSnapshot);
    }
    setLoading(false);
  }

  async function saveSnapshot() {
    if (!user) return;
    
    setSaving(true);
    const snapshotDate = format(currentDate, 'yyyy-MM-dd');
    
    const { error } = await supabase
      .from('balance_sheet_snapshots')
      .upsert({
        user_id: user.id,
        snapshot_date: snapshotDate,
        total_assets: totalAssets,
        current_assets: totalCurrentAssets,
        fixed_assets: totalFixedAssets,
        total_liabilities: totalLiabilities,
        current_liabilities: totalCurrentLiabilities,
        long_term_liabilities: totalLongTermLiabilities,
        total_equity: equity,
      }, {
        onConflict: 'user_id,snapshot_date',
      });

    setSaving(false);
    
    if (error) {
      toast.error('Failed to save snapshot');
      logError('BalanceSheet snapshot', error);
    } else {
      toast.success(`Snapshot saved for ${format(currentDate, 'MMM d, yyyy')}`);
    }
  }

  if (authLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!user) return null;

  // Categorize accounts and assets
  const currentAssets: BalanceSheetData['currentAssets'] = [];
  const fixedAssets: BalanceSheetData['fixedAssets'] = [];
  const currentLiabilities: BalanceSheetData['currentLiabilities'] = [];
  const longTermLiabilities: BalanceSheetData['longTermLiabilities'] = [];

  // Process accounts (scaled by ownership)
  const multiplierMap = buildMultiplierMap(accounts);
  accounts.forEach((account) => {
    const balance = (account.current_balance || 0) * (multiplierMap[account.id] ?? 1);

    if (account.type === 'checking' || account.type === 'savings') {
      currentAssets.push({
        name: `${account.name} (${account.type})`,
        currentYear: balance,
        priorYear: 0,
      });
    } else if (account.type === 'investment') {
      fixedAssets.push({
        name: account.name,
        currentYear: balance,
        priorYear: 0,
      });
    } else if (account.type === 'credit') {
      currentLiabilities.push({
        name: account.name,
        currentYear: Math.abs(balance),
        priorYear: 0,
      });
    } else if (account.type === 'loan') {
      longTermLiabilities.push({
        name: account.name,
        currentYear: Math.abs(balance),
        priorYear: 0,
      });
    }
  });

  // Process manual assets
  assets.forEach((asset) => {
    if (asset.is_liability) {
      longTermLiabilities.push({
        name: asset.name,
        currentYear: asset.value,
        priorYear: 0,
      });
    } else if (asset.type === 'cash') {
      currentAssets.push({
        name: asset.name,
        currentYear: asset.value,
        priorYear: 0,
      });
    } else {
      fixedAssets.push({
        name: asset.name,
        currentYear: asset.value,
        priorYear: 0,
      });
    }
  });

  // Calculate current year totals
  const totalCurrentAssets = currentAssets.reduce((sum, a) => sum + a.currentYear, 0);
  const totalFixedAssets = fixedAssets.reduce((sum, a) => sum + a.currentYear, 0);
  const totalAssets = totalCurrentAssets + totalFixedAssets;

  const totalCurrentLiabilities = currentLiabilities.reduce((sum, l) => sum + l.currentYear, 0);
  const totalLongTermLiabilities = longTermLiabilities.reduce((sum, l) => sum + l.currentYear, 0);
  const totalLiabilities = totalCurrentLiabilities + totalLongTermLiabilities;

  const equity = totalAssets - totalLiabilities;

  // Use snapshot for prior year if available, otherwise show N/A
  const hasPriorYearData = priorYearSnapshot !== null;
  const totalCurrentAssetsPrior = priorYearSnapshot?.current_assets ?? 0;
  const totalFixedAssetsPrior = priorYearSnapshot?.fixed_assets ?? 0;
  const totalAssetsPrior = priorYearSnapshot?.total_assets ?? 0;
  const totalCurrentLiabilitiesPrior = priorYearSnapshot?.current_liabilities ?? 0;
  const totalLongTermLiabilitiesPrior = priorYearSnapshot?.long_term_liabilities ?? 0;
  const totalLiabilitiesPrior = priorYearSnapshot?.total_liabilities ?? 0;
  const equityPrior = priorYearSnapshot?.total_equity ?? 0;

  const calculateYoY = (current: number, prior: number) => {
    if (!hasPriorYearData) return null;
    if (prior === 0) return current > 0 ? 100 : 0;
    return ((current - prior) / Math.abs(prior)) * 100;
  };

  const formatYoY = (value: number | null) => {
    if (value === null) return 'N/A';
    const formatted = value.toFixed(1);
    return value >= 0 ? `+${formatted}%` : `${formatted}%`;
  };

  const renderLineItem = (
    name: string,
    currentYear: number,
    priorYear: number,
    isBold = false,
    showPrior = true
  ) => {
    const yoy = calculateYoY(currentYear, priorYear);
    return (
      <TableRow key={name}>
        <TableCell className={isBold ? 'font-semibold' : 'pl-8'}>{name}</TableCell>
        <TableCell className={`text-right ${isBold ? 'font-semibold' : ''}`}>
          {formatCurrency(currentYear)}
        </TableCell>
        <TableCell className={`text-right ${isBold ? 'font-semibold' : ''}`}>
          {showPrior && hasPriorYearData ? formatCurrency(priorYear) : (hasPriorYearData ? formatCurrency(priorYear) : '—')}
        </TableCell>
        <TableCell className={`text-right ${yoy !== null ? (yoy >= 0 ? 'text-green-600' : 'text-red-600') : 'text-muted-foreground'}`}>
          {formatYoY(yoy)}
        </TableCell>
      </TableRow>
    );
  };

  const priorYearLabel = priorYearSnapshot 
    ? `${priorYear} (${format(new Date(priorYearSnapshot.snapshot_date), 'MMM d')})`
    : `${priorYear}`;

  return (
    <>
      <PageHeader
        title="Balance Sheet"
        description={`As of ${format(currentDate, 'MMMM d, yyyy')}`}
      />

      <div className="flex justify-end gap-2 mb-4">
        <Button onClick={saveSnapshot} disabled={saving} variant="outline">
          <Camera className="mr-2 h-4 w-4" />
          {saving ? 'Saving...' : 'Save Snapshot'}
        </Button>
      </div>

      {!hasPriorYearData && (
        <Card className="mb-4 border-warning/50 bg-warning/10">
          <CardContent className="py-3">
            <div className="flex items-center gap-2 text-sm text-warning-foreground">
              <History className="h-4 w-4" />
              <span>No prior year snapshot found. Save a snapshot today to track year-over-year changes.</span>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-center">Personal Balance Sheet</CardTitle>
          <p className="text-center text-muted-foreground text-sm">
            (In US Dollars)
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : (
            <Table className="min-w-[500px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40%]">Description</TableHead>
                  <TableHead className="text-right">{currentYear}</TableHead>
                  <TableHead className="text-right">{priorYearLabel}</TableHead>
                  <TableHead className="text-right">YoY Change</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* ASSETS Section */}
                <TableRow className="bg-muted/50">
                  <TableCell colSpan={4} className="font-bold text-lg">ASSETS</TableCell>
                </TableRow>

                {/* Current Assets */}
                <TableRow>
                  <TableCell className="font-semibold">Current Assets</TableCell>
                  <TableCell></TableCell>
                  <TableCell></TableCell>
                  <TableCell></TableCell>
                </TableRow>
                {currentAssets.map((item) =>
                  renderLineItem(item.name, item.currentYear, item.priorYear, false, false)
                )}
                {renderLineItem('Total Current Assets', totalCurrentAssets, totalCurrentAssetsPrior, true)}

                {/* Fixed Assets */}
                <TableRow>
                  <TableCell className="font-semibold pt-4">Fixed Assets</TableCell>
                  <TableCell></TableCell>
                  <TableCell></TableCell>
                  <TableCell></TableCell>
                </TableRow>
                {fixedAssets.map((item) =>
                  renderLineItem(item.name, item.currentYear, item.priorYear, false, false)
                )}
                {renderLineItem('Total Fixed Assets', totalFixedAssets, totalFixedAssetsPrior, true)}

                {/* Total Assets */}
                <TableRow className="border-t-2 border-foreground">
                  <TableCell className="font-bold">TOTAL ASSETS</TableCell>
                  <TableCell className="text-right font-bold">{formatCurrency(totalAssets)}</TableCell>
                  <TableCell className="text-right font-bold">{hasPriorYearData ? formatCurrency(totalAssetsPrior) : '—'}</TableCell>
                  <TableCell className={`text-right font-bold ${calculateYoY(totalAssets, totalAssetsPrior) !== null ? (calculateYoY(totalAssets, totalAssetsPrior)! >= 0 ? 'text-green-600' : 'text-red-600') : 'text-muted-foreground'}`}>
                    {formatYoY(calculateYoY(totalAssets, totalAssetsPrior))}
                  </TableCell>
                </TableRow>

                {/* Spacer */}
                <TableRow><TableCell colSpan={4} className="h-4"></TableCell></TableRow>

                {/* LIABILITIES Section */}
                <TableRow className="bg-muted/50">
                  <TableCell colSpan={4} className="font-bold text-lg">LIABILITIES</TableCell>
                </TableRow>

                {/* Current Liabilities */}
                <TableRow>
                  <TableCell className="font-semibold">Current Liabilities</TableCell>
                  <TableCell></TableCell>
                  <TableCell></TableCell>
                  <TableCell></TableCell>
                </TableRow>
                {currentLiabilities.map((item) =>
                  renderLineItem(item.name, item.currentYear, item.priorYear, false, false)
                )}
                {renderLineItem('Total Current Liabilities', totalCurrentLiabilities, totalCurrentLiabilitiesPrior, true)}

                {/* Long-term Liabilities */}
                <TableRow>
                  <TableCell className="font-semibold pt-4">Long-term Liabilities</TableCell>
                  <TableCell></TableCell>
                  <TableCell></TableCell>
                  <TableCell></TableCell>
                </TableRow>
                {longTermLiabilities.map((item) =>
                  renderLineItem(item.name, item.currentYear, item.priorYear, false, false)
                )}
                {renderLineItem('Total Long-term Liabilities', totalLongTermLiabilities, totalLongTermLiabilitiesPrior, true)}

                {/* Total Liabilities */}
                <TableRow className="border-t-2 border-foreground">
                  <TableCell className="font-bold">TOTAL LIABILITIES</TableCell>
                  <TableCell className="text-right font-bold">{formatCurrency(totalLiabilities)}</TableCell>
                  <TableCell className="text-right font-bold">{hasPriorYearData ? formatCurrency(totalLiabilitiesPrior) : '—'}</TableCell>
                  <TableCell className={`text-right font-bold ${calculateYoY(totalLiabilities, totalLiabilitiesPrior) !== null ? (calculateYoY(totalLiabilities, totalLiabilitiesPrior)! >= 0 ? 'text-red-600' : 'text-green-600') : 'text-muted-foreground'}`}>
                    {formatYoY(calculateYoY(totalLiabilities, totalLiabilitiesPrior))}
                  </TableCell>
                </TableRow>

                {/* Spacer */}
                <TableRow><TableCell colSpan={4} className="h-4"></TableCell></TableRow>

                {/* EQUITY Section */}
                <TableRow className="bg-muted/50">
                  <TableCell colSpan={4} className="font-bold text-lg">EQUITY</TableCell>
                </TableRow>
                {renderLineItem('Retained Earnings / Net Worth', equity, equityPrior, true)}

                {/* Total Liabilities + Equity */}
                <TableRow className="border-t-2 border-foreground bg-primary/10">
                  <TableCell className="font-bold">TOTAL LIABILITIES + EQUITY</TableCell>
                  <TableCell className="text-right font-bold">{formatCurrency(totalAssets)}</TableCell>
                  <TableCell className="text-right font-bold">{hasPriorYearData ? formatCurrency(totalAssetsPrior) : '—'}</TableCell>
                  <TableCell className={`text-right font-bold ${calculateYoY(totalAssets, totalAssetsPrior) !== null ? (calculateYoY(totalAssets, totalAssetsPrior)! >= 0 ? 'text-green-600' : 'text-red-600') : 'text-muted-foreground'}`}>
                    {formatYoY(calculateYoY(totalAssets, totalAssetsPrior))}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}

export default function BalanceSheet() {
  return (
    <AppLayout>
      <BalanceSheetContent />
    </AppLayout>
  );
}
