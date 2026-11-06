import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { TransactionsContent } from './Transactions';
import { TransactionRulesContent } from './TransactionRules';
import { BudgetsContent } from './Budgets';
import { AmortizationContent } from './Amortization';
import { RecurringContent } from './Recurring';
import { CardBenefitsContent } from './CardBenefits';
import { EventsContent } from './Events';
import { ArrowLeftRight, Zap, PiggyBank, Calendar, Repeat, Gift, Tag } from 'lucide-react';

type FinanceView = 'transactions' | 'rules' | 'budgets' | 'amortization' | 'recurring' | 'card-benefits' | 'events';

export default function ManageFinances() {
  const [view, setView] = useState<FinanceView>('transactions');

  return (
    <AppLayout>
      <div className="mb-6">
        <ToggleGroup
          type="single"
          value={view}
          onValueChange={(v) => { if (v) setView(v as FinanceView); }}
          variant="outline"
          className="justify-start flex-wrap"
        >
          <ToggleGroupItem value="transactions" className="gap-2 px-4">
            <ArrowLeftRight className="w-4 h-4" />
            Transactions
          </ToggleGroupItem>
          <ToggleGroupItem value="rules" className="gap-2 px-4">
            <Zap className="w-4 h-4" />
            Rules
          </ToggleGroupItem>
          <ToggleGroupItem value="budgets" className="gap-2 px-4">
            <PiggyBank className="w-4 h-4" />
            Budgets
          </ToggleGroupItem>
          <ToggleGroupItem value="amortization" className="gap-2 px-4">
            <Calendar className="w-4 h-4" />
            Amortization
          </ToggleGroupItem>
          <ToggleGroupItem value="recurring" className="gap-2 px-4">
            <Repeat className="w-4 h-4" />
            Recurring
          </ToggleGroupItem>
          <ToggleGroupItem value="card-benefits" className="gap-2 px-4">
            <Gift className="w-4 h-4" />
            Card Benefits
          </ToggleGroupItem>
          <ToggleGroupItem value="events" className="gap-2 px-4">
            <Tag className="w-4 h-4" />
            Events
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {view === 'transactions' && <TransactionsContent />}
      {view === 'rules' && <TransactionRulesContent />}
      {view === 'budgets' && <BudgetsContent />}
      {view === 'amortization' && <AmortizationContent />}
      {view === 'recurring' && <RecurringContent />}
      {view === 'card-benefits' && <CardBenefitsContent />}
      {view === 'events' && <EventsContent />}
    </AppLayout>
  );
}
