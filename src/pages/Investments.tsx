import {Link} from 'react-router-dom';
import {useHousehold} from '@/hooks/useHousehold';
import {AppLayout} from '@/components/layout/AppLayout';
import {PageHeader} from '@/components/ui/page-header';
import {Card,CardHeader,CardTitle,CardDescription,CardContent} from '@/components/ui/card';
import {Button} from '@/components/ui/button';
import {FinanceTable} from '@/components/ui/finance-table';
export default function Investments(){
  const {data}=useHousehold();
  const accounts=data.accounts.filter(a=>a.type==='investment'||['brokerage','401k','403b','ira','roth','pension','retirement','529'].includes(a.subtype||''));
  const money=(amount:number,currency:string)=>new Intl.NumberFormat(undefined,{style:'currency',currency}).format(amount);
  return <AppLayout><PageHeader title="Investment balances" description="Available connected investment accounts, with their observed history."/>
    <Card><CardHeader><CardTitle>Your investment accounts</CardTitle><CardDescription>Full account balances in their original currency. Household allocations are reflected in financial reports. Archived accounts retain their imported history.</CardDescription></CardHeader><CardContent>{accounts.length?<FinanceTable headers={['Institution','Account','Status','Latest balance']} rows={accounts.map(a=>[a.provider_institution_name||'Not provided',a.name+(a.mask?' •••• '+a.mask.slice(-4):''),a.is_deleted?'Archived history':'Connected / imported',a.current_balance==null?'Not available':money(Number(a.current_balance),a.currency||'USD')])}/>:<p className="text-muted-foreground">No investment accounts are available. Add an account or import a statement to start tracking.</p>}<Button asChild variant="outline" className="mt-4"><Link to="/accounts">Manage accounts</Link></Button></CardContent></Card>
    <Card className="mt-6"><CardHeader><CardTitle>Balance observations</CardTitle><CardDescription>Observed balances are preserved independently of module selection. These observations do not establish investment returns or holdings performance.</CardDescription></CardHeader><CardContent><FinanceTable headers={['Date','Account','Balance','Source']} rows={(data.observations||[]).filter(o=>accounts.some(a=>a.id===o.account_id)).sort((a,b)=>b.observed_on.localeCompare(a.observed_on)).slice(0,100).map(o=>[o.observed_on,accounts.find(a=>a.id===o.account_id)?.name||'Account',money(Number(o.balance),o.currency),o.source])}/></CardContent></Card>
  </AppLayout>;
}
