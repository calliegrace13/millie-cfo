import { DataCoverage } from '@/components/DataCoverage';
import { useEffect, useState, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/hooks/useAuth';
import { useHousehold } from '@/hooks/useHousehold';
import { report, periodBounds, accountWeight, type FinanceView, type HistoryBasis, type ReportOptions } from '@/lib/household-finance';
const titles={overview:'Overview',income:'Income statement',cash:'Cash flow',budget:'Budget vs. actual',balance:'Account balance sheet'};
export default function HouseholdReport({kind='overview'}:{kind?:keyof typeof titles}) {
  const {user}=useAuth();const {data,partnerId,linkId,loading,error,reload}=useHousehold();
  const [params,setParams]=useSearchParams();const key=`millie-report-preference:${user?.id}`;
  const saved=(()=>{try{return JSON.parse(localStorage.getItem(key)||'{}');}catch{return {};}})();
  const [view,setView]=useState<FinanceView>(['mine','partner','household'].includes(params.get('view')||saved.view)?(params.get('view')||saved.view) as FinanceView:'mine');
  const [basis,setBasis]=useState<HistoryBasis>(params.get('basis')==='recorded'||saved.basis==='recorded'?'recorded':'comparable');
  const [month,setMonth]=useState(format(new Date(),'yyyy-MM'));const [yearly,setYearly]=useState(false);const [currency,setCurrency]=useState('USD');
  useEffect(()=>{void reload();},[reload]);
  const currencies=[...new Set(data.accounts.map(a=>a.currency||'USD'))].sort();
  const bounds=periodBounds(month,yearly);const previous=periodBounds(`${Number(month.slice(0,4))-1}${month.slice(4)}`,yearly);
  const options:ReportOptions={userId:user?.id||'',partnerId,linkId,view,basis,currency,...bounds};
  const result=report(data,options);const prior=report(data,{...options,...previous});
  const today=format(new Date(),'yyyy-MM-dd');const balances=report(data,{...options,start:today,end:today});
  const money=(n:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency}).format(n);
  const label=view==='mine'?'My share':view==='partner'?"Partner’s share":'Household total';
  const selectView=(v:FinanceView)=>{setView(v);localStorage.setItem(key,JSON.stringify({view:v,basis}));setParams({view:v,basis},{replace:true});};
  const selectBasis=(v:HistoryBasis)=>{setBasis(v);localStorage.setItem(key,JSON.stringify({view,basis:v}));setParams({view,basis:v},{replace:true});};
  useEffect(()=>{
    const context=(document as Document & {modelContext?:{registerTool:(tool:unknown,options:{signal:AbortSignal})=>unknown}}).modelContext;
    if(!context?.registerTool)return;
    const lifecycle=new AbortController();
    try { Promise.resolve(context.registerTool({name:'read_household_report',title:'Read current finance report',description:'Read the selected report, scope, historical basis, currency, and available-data totals. Read only.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute(input:unknown){if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length)throw Error('Expected an empty object');if(loading||error||(view==='partner'&&!partnerId))throw Error('Report unavailable');return {report:kind,view,basis,currency,period:bounds,coverage:'Only authorized imported accounts; no guarantee of complete historical coverage',totals:result.count?result:null,priorPeriod:previous,priorTotals:prior.count?prior:null};}}, {signal:lifecycle.signal})).catch(()=>{}); } catch {}
    return ()=>lifecycle.abort();
  },[data,view,basis,currency,month,yearly,kind,loading,error,partnerId]);
  const noPartner=view==='partner'&&!partnerId;
  const rows=kind==='income'?[
    ['Income',result.income,prior.income],['Expenses, net of refunds',result.expenses,prior.expenses],['Income minus expenses',result.netIncome,prior.netIncome]
  ]:kind==='cash'?[
    ['Cash received',result.cashIn,prior.cashIn],['Cash paid',result.cashOut,prior.cashOut],['Net cash movement',result.netCash,prior.netCash]
  ]:[];
  const exportCsv=()=>{
    const values:any[][]=[['Millie CFO',titles[kind]],['View',label],['Historical basis',view==='household'?basis:'Dated personal allocations'],['Period',bounds.start,bounds.end],['Currency',currency],['Coverage','Authorized imported accounts only; missing data is not zero']];
    if(kind==='budget')values.push(['Category','Budget','Actual'],...result.rows.map(r=>[r.category,r.budget??'Not set',result.count?r.actual:'No transactions']));
    else if(kind==='balance')values.push(['Balances as of',today],['Account','Balance'],...balances.balances.map(a=>[a.name,a.amount]));
    else if(rows.length)values.push(['Line','Current available data','Prior-year available data'],...rows.map(([name,current,previous])=>[name,result.count?current:'No data',prior.count?previous:'No data']));
    else values.push(['Income',result.count?result.income:'No data'],['Expenses',result.count?result.expenses:'No data'],['Account net worth',balances.netWorth]);
    const csv=values.map(r=>r.map(v=>'"'+String(v).replace(/^([=+@-])/,"'$1").replace(/"/g,'""')+'"').join(',')).join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`millie-${kind}-${view}-${month}.csv`;a.click();URL.revokeObjectURL(url);
  };
  return <AppLayout>
    <PageHeader title={titles[kind]} description="One consistent view of your finances, before and after combining." actions={<><Button asChild variant="outline"><Link to="/household">Household setup</Link></Button><Button variant="outline" onClick={exportCsv} disabled={loading||!!error||noPartner}>Export CSV</Button></>} />
    <Card className="mb-6"><CardContent className="pt-5 flex flex-wrap items-end gap-4">
      <div className="space-y-2"><Label>Whose finances</Label><Select value={view} onValueChange={selectView}><SelectTrigger className="w-48" aria-label="Whose finances"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="mine">My share</SelectItem><SelectItem value="partner">Partner’s share</SelectItem><SelectItem value="household">Household total</SelectItem></SelectContent></Select></div>
      {view==='household'&&<div className="space-y-2"><Label>Historical basis</Label><Select value={basis} onValueChange={selectBasis}><SelectTrigger className="w-56" aria-label="Historical basis"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="comparable">Comparable household</SelectItem><SelectItem value="recorded">As recorded at the time</SelectItem></SelectContent></Select></div>}
      {kind!=='balance'&&<><div className="space-y-2"><Label htmlFor="report-month">Reporting month</Label><Input className="w-44" id="report-month" type="month" value={month} onChange={e=>/^\d{4}-\d{2}$/.test(e.target.value)&&setMonth(e.target.value)} /></div><div className="space-y-2"><Label>Period</Label><Select value={yearly?'year':'month'} onValueChange={v=>setYearly(v==='year')}><SelectTrigger className="w-36" aria-label="Period"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="month">Month</SelectItem><SelectItem value="year">Full year</SelectItem></SelectContent></Select></div></>}
      <div className="space-y-2"><Label>Currency</Label><Select value={currency} onValueChange={setCurrency}><SelectTrigger className="w-28" aria-label="Currency"><SelectValue /></SelectTrigger><SelectContent>{[...new Set(['USD',...currencies])].map(c=><SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
    </CardContent></Card>
    <DataCoverage start={kind==='balance'?undefined:bounds.start} end={kind==='balance'?undefined:bounds.end} currency={currency} />
    <div className="rounded-lg bg-secondary/60 p-4 mb-6 space-y-2 text-sm">
      <p className="font-medium">{label} · {view==='household'?(basis==='comparable'?'Same household accounts across both periods':'Accounts included from their effective dates'):'Splits effective on each transaction date'}</p>
      <p className="text-muted-foreground">Only authorized, imported {currency} data is included. Private accounts and missing history are not treated as zero. Joint accounts must be connected once or marked as duplicate in Household setup.</p>
      {view==='household'&&basis==='comparable'&&<p className="text-muted-foreground">Includes available history of accounts selected for the household, even before their combination date. Original allocations are unchanged.</p>}
      {view==='household'&&basis==='recorded'&&<p className="text-muted-foreground">Account coverage can change at the combination date. Use Comparable household for like-for-like trends.</p>}
      {result.unassigned>0&&<p>{result.unassigned} transactions without an available account are excluded. Assign them to an account to include them.</p>}
    </div>
    {loading?<p role="status">Loading household reports…</p>:error?<Card><CardContent className="py-6"><p role="alert">{error}</p><Button className="mt-4" onClick={reload}>Retry</Button></CardContent></Card>:noPartner?<Card><CardContent className="py-8"><h2 className="text-xl font-semibold">Link your partner to see their share</h2><p className="mt-2 text-muted-foreground">Your partner chooses which account history to share.</p><Button className="mt-4" asChild><Link to="/household">Set up your household</Link></Button></CardContent></Card>:<>
      {!data.accounts.length&&<Card className="mb-6"><CardContent className="py-8"><h2 className="text-xl font-semibold">Start with your accounts</h2><p className="text-muted-foreground mt-2">Connect a bank or add an account manually, then choose its split in Household setup.</p><Button asChild className="mt-4"><Link to="/accounts">Add accounts</Link></Button></CardContent></Card>}
      {kind==='overview'&&<><div className="grid sm:grid-cols-3 gap-4 mb-6">{[['Income',result.count?money(result.income):'No transactions'],['Expenses',result.count?money(result.expenses):'No transactions'],['Account net worth',balances.balances.length?money(balances.netWorth):'No included accounts']].map(([t,v])=><Card key={t}><CardContent className="pt-6"><p className="text-sm text-muted-foreground">{t}</p><p className="text-2xl font-semibold mt-2">{v}</p></CardContent></Card>)}</div><div className="grid sm:grid-cols-3 gap-4">{[['/transactions','Review transactions','Check categories and link transfers.'],['/household','Manage your household','Schedule splits and choose shared history.'],['/budget-vs-actual','Compare your budget','Match targets to the same reporting view.']].map(([url,t,d])=><Link key={url} to={`${url}?view=${view}&basis=${basis}`} className="rounded-lg border bg-card p-5 hover:border-primary"><h2 className="font-semibold">{t}</h2><p className="text-sm text-muted-foreground mt-2">{d}</p></Link>)}</div><p className="text-sm text-muted-foreground mt-4">Net worth uses current account balances; it does not include separately entered property or other manual assets.</p></>}
      {(kind==='income'||kind==='cash')&&<Card><CardHeader><CardTitle>{kind==='income'?'Posted income and spending':'Checking and savings activity'}</CardTitle><p className="text-sm text-muted-foreground">{kind==='income'?'Uses transaction dates. Refunds reduce spending; linked transfers, card payments and settlements are excluded.':'Uses transaction dates and the cash side of payments. Internal transfers net to zero only when both sides are imported and included.'}</p></CardHeader><CardContent className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Line</TableHead><TableHead className="text-right">{bounds.start} – {bounds.end}</TableHead><TableHead className="text-right">Available prior-year data</TableHead></TableRow></TableHeader><TableBody>{rows.map(([t,v,p])=><TableRow key={String(t)}><TableCell>{t}</TableCell><TableCell className="text-right">{result.count?money(Number(v)):'No data'}</TableCell><TableCell className="text-right">{prior.count?money(Number(p)):'No data'}</TableCell></TableRow>)}</TableBody></Table><p className="text-sm text-muted-foreground mt-4">Prior period: {previous.start} – {previous.end}. Differences can reflect missing imports; confirm coverage before interpreting growth.</p></CardContent></Card>}
      {kind==='budget'&&<Card><CardHeader><CardTitle>Budget and spending use the same view</CardTitle><p className="text-sm text-muted-foreground">Monthly targets are versioned in Household setup. Annual reports sum each month’s effective target. Partner-private budgets remain unavailable.</p><Button asChild variant="outline" className="w-fit"><Link to="/household#budget">Set a monthly target</Link></Button></CardHeader><CardContent className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Category</TableHead><TableHead className="text-right">Budget</TableHead><TableHead className="text-right">Actual</TableHead><TableHead className="text-right">Remaining</TableHead></TableRow></TableHeader><TableBody>{result.rows.map(r=><TableRow key={r.category}><TableCell>{r.category}</TableCell><TableCell className="text-right">{r.budget===null?'Not set':money(r.budget)}</TableCell><TableCell className="text-right">{result.count?money(r.actual):'No transactions'}</TableCell><TableCell className="text-right">{r.budget===null||!result.count?'—':money(r.budget-r.actual)}</TableCell></TableRow>)}</TableBody></Table>{!result.rows.length&&<p className="py-6 text-muted-foreground">No targets or spending available for this view and currency.</p>}</CardContent></Card>}
      {kind==='balance'&&<Card><CardHeader><CardTitle>Current account balances</CardTitle><p className="text-sm text-muted-foreground">Uses today’s allocation rules and latest imported balances. Historical balances cannot be reconstructed from current balances. Property and other separately entered assets are available in the advanced personal balance sheet.</p></CardHeader><CardContent className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Account</TableHead><TableHead>Type</TableHead><TableHead className="text-right">{label}</TableHead></TableRow></TableHeader><TableBody>{balances.balances.map(a=><TableRow key={a.id}><TableCell>{a.name}</TableCell><TableCell>{a.type}</TableCell><TableCell className="text-right">{money(a.amount)}</TableCell></TableRow>)}<TableRow><TableCell className="font-semibold">Account net worth</TableCell><TableCell /><TableCell className="text-right font-semibold">{balances.balances.length?money(balances.netWorth):'No included accounts'}</TableCell></TableRow></TableBody></Table></CardContent></Card>}
      {view==='mine'&&['income','cash','balance'].includes(kind)&&<Button asChild variant="link" className="mt-4"><Link to={`/advanced-${kind}`}>Open advanced personal {kind==='income'?'income statement':kind==='cash'?'cash-flow report':'balance sheet'}</Link></Button>}
    </>}
  </AppLayout>;
}
