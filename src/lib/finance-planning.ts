import {analyticalReport,balanceWeight,isCash,isInternal,expenseWeight,monthList,periodBounds,type FinanceData,type ReportOptions} from './household-finance';
export function settlements(data:FinanceData,o:ReportOptions){
 const lines:{id:string;date:string;name:string;paid:number;responsibility:number;due:number}[]=[];
 for(const t of data.transactions){if(t.pending||t.date<o.start||t.date>o.end)continue;const a=data.accounts.find(a=>a.id===t.account_id);if(!a)continue;const paid=Number(t.amount)*balanceWeight(a,t.date,data,{...o,view:'mine'});const responsibility=Number(t.amount)*expenseWeight(t,a,data,{...o,view:'mine'});
 if((t.category||'').toLowerCase()==='settlement'){if(paid)lines.push({id:t.id,date:t.date,name:t.name+' (settlement)',paid,responsibility:0,due:paid});}
 else if(!isInternal(t)&&(t.category||'').toLowerCase()!=='income'&&Math.abs(paid-responsibility)>.005)lines.push({id:t.id,date:t.date,name:t.name,paid,responsibility,due:paid-responsibility});}
 return {lines,total:lines.reduce((s,l)=>s+l.due,0)};
}
export type Scenario={incomeDelta:number;expenseDelta:number;monthlyInvesting:number;monthlyPrincipal:number;annualReturn:number;months:number;useRecurring:boolean;events:{month:string;income:number;expense:number;label:string}[]};
export function forecast(data:FinanceData,o:ReportOptions,s:Scenario,today=new Date().toISOString().slice(0,10)){
 const first=data.transactions.filter(t=>{const a=data.accounts.find(a=>a.id===t.account_id);return !t.pending&&a&&expenseWeight(t,a,data,o)>0;}).map(t=>t.date).sort()[0];
 const currentMonth=today.slice(0,7)+'-01';const historical=monthList(first||currentMonth,currentMonth).filter(m=>m<currentMonth&&m>=String(Number(today.slice(0,4))-1)+'-'+today.slice(5,7)+'-01').slice(-6);
 const usable=historical.filter(m=>first<=m).map(m=>analyticalReport(data,{...o,...periodBounds(m.slice(0,7),false),normalized:false})).filter(r=>r.count>0);
 const n=usable.length;const income=n?usable.reduce((a,r)=>a+r.income,0)/n:0,expenses=n?usable.reduce((a,r)=>a+r.expenses,0)/n:0;
 const bal=(a:any)=>(a.is_zero_balance?0:Number(a.current_balance)||0)*balanceWeight(a,today,data,o);
 const available=data.accounts.filter(a=>!a.is_deleted);let cash=available.filter(isCash).reduce((sum,a)=>sum+bal(a),0),investments=available.filter(a=>a.type==='investment').reduce((sum,a)=>sum+bal(a),0),debt=available.filter(a=>['credit','loan'].includes(a.type)).reduce((sum,a)=>sum+Math.max(0,bal(a)),0);
 const initial={cash,investments,debt};const rows:any[]=[];
 const monthly=(r:any)=>Number(r.expected_amount)*({weekly:52/12,biweekly:26/12,monthly:1,quarterly:1/3,yearly:1/12}[r.frequency as string]||1);
 // Recurring overrides only in personal scope: legacy schedules lack shared account attribution.
 const recurring=(data.recurring||[]).filter(r=>r.is_active&&r.user_id===o.userId);
 for(let i=1;i<=s.months;i++){
  const d=new Date(today+'T12:00:00Z');d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+i);const month=d.toISOString().slice(0,7);const events=(s.events||[]).filter(e=>e.month===month);
  const activeRecurring=recurring.filter(r=>(!r.end_date||r.end_date.slice(0,7)>=month)&&(!r.next_expected_date||r.next_expected_date.slice(0,7)<=month));const recIncome=activeRecurring.filter(r=>r.expected_amount<0).reduce((a,r)=>a-Math.min(0,monthly(r)),0),recExpense=activeRecurring.filter(r=>r.expected_amount>0).reduce((a,r)=>a+monthly(r),0);
  const projectCost=(data.documents||[]).filter(x=>x.kind==='project'&&x.payload.status!=='archived'&&x.payload.month===month&&x.payload.currency===o.currency&&x.payload.view===o.view&&JSON.stringify(x.payload.accountIds||null)===JSON.stringify(o.accountIds||null)).reduce((sum,p)=>sum+Math.max(0,Number(p.payload.committed)||0),0);
  const inc=(s.useRecurring&&o.view==='mine'&&!o.accountIds&&o.currency==='USD'&&o.basis!=='proforma'?recIncome:income)+s.incomeDelta+events.reduce((a,e)=>a+Number(e.income||0),0);
  const exp=Math.max(0,(s.useRecurring&&o.view==='mine'&&!o.accountIds&&o.currency==='USD'&&o.basis!=='proforma'?recExpense:expenses)+s.expenseDelta+events.reduce((a,e)=>a+Number(e.expense||0),0)+projectCost);
  const opening=cash,principal=Math.min(debt,Math.max(0,s.monthlyPrincipal)),contribution=Math.max(0,s.monthlyInvesting),returns=investments*s.annualReturn/1200;
  const netCash=inc-exp-contribution-principal;cash+=netCash;investments+=contribution+returns;debt-=principal;
  rows.push({month,income:inc,expenses:exp,surplus:inc-exp,openingCash:opening,investing:contribution,principal,returns,netCash,closingCash:cash,investments,debt,netWorth:cash+investments-debt});
 }
 return {rows,historyMonths:n,income,expenses,initial,minimumCash:Math.min(initial.cash,...rows.map(r=>r.closingCash)),baselineMonths:historical};
}
