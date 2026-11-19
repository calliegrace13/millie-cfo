import {Link} from 'react-router-dom';
import {AppLayout} from '@/components/layout/AppLayout';
import {PageHeader} from '@/components/ui/page-header';
import {FinanceFilters} from '@/components/FinanceFilters';
import {PeriodClose} from '@/components/PeriodClose';
import {Card,CardHeader,CardTitle,CardContent} from '@/components/ui/card';
import {Button} from '@/components/ui/button';
export default function CloseWorkspace(){return <AppLayout><PageHeader title="Period close" description="Review open activity in manageable quarters and preserve the reports you close."/><Card className="mb-6"><CardHeader><CardTitle>Start with your open quarter</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground mb-4">Review common merchants once, resolve exceptions, then close one quarter at a time in Transactions. Closed periods stay held; later activity appears as restatements.</p><Button asChild><Link to="/transactions">Continue quarterly review</Link></Button></CardContent></Card><FinanceFilters/><PeriodClose/></AppLayout>;}
