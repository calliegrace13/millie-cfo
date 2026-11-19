import {AppLayout} from '@/components/layout/AppLayout';
import {PageHeader} from '@/components/ui/page-header';
import {BudgetTargets} from '@/components/BudgetTargets';
export default function BudgetWorkspace(){return <AppLayout><PageHeader title="Budgets" description="Set dated targets for your personal or shared finances."/><div className="max-w-4xl"><BudgetTargets/></div></AppLayout>;}
