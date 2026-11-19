import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/page-header';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { IncomeStatementContent } from './IncomeStatement';
import { CashFlowContent } from './CashFlow';
import { BalanceSheetContent } from './BalanceSheet';
import { FileText, TrendingUp, Scale } from 'lucide-react';

type StatementView = 'income' | 'cashflow' | 'balance';

export default function FinancialStatements() {
  const [view, setView] = useState<StatementView>('income');

  return (
    <AppLayout>
      <div className="mb-6">
        <ToggleGroup
          type="single"
          value={view}
          onValueChange={(v) => { if (v) setView(v as StatementView); }}
          variant="outline"
          className="justify-start flex-wrap"
        >
          <ToggleGroupItem value="income" className="gap-2 px-4">
            <FileText className="w-4 h-4" />
            Income Statement
          </ToggleGroupItem>
          <ToggleGroupItem value="cashflow" className="gap-2 px-4">
            <TrendingUp className="w-4 h-4" />
            Cash Flow
          </ToggleGroupItem>
          <ToggleGroupItem value="balance" className="gap-2 px-4">
            <Scale className="w-4 h-4" />
            Balance Sheet
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {view === 'income' && <IncomeStatementContent />}
      {view === 'cashflow' && <CashFlowContent />}
      {view === 'balance' && <BalanceSheetContent />}
    </AppLayout>
  );
}

