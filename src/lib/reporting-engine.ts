import {analyticalReport,accountingBalances,balanceWeight,cashLedger,isCash,type FinanceData,type FinanceDocument,type ReportOptions} from './household-finance';
import {retainAvailable} from './durable-history';

export const REPORTING_ENGINE_VERSION='1.0.0';
export type ReportEdition='latest'|'closed'|'restated';
const previous=(date:string)=>new Date(Date.parse(date+'T12:00:00Z')-86400000).toISOString().slice(0,10);
const total=(xs:number[])=>xs.reduce((s,x)=>s+x,0);
const nearZero=(n:number)=>Math.abs(n)<0.005;
const signed=(a:{type:string},n:number)=>['credit','loan'].includes(a.type)?-n:n;

/** Exact-date evidence only. An absent observation is never an inferred zero. */
export function balanceSheetAt(data:FinanceData,o:ReportOptions,date:string){
 const rows=data.accounts.filter(a=>balanceWeight(a,date,data,o)>0).map(a=>{
  const observation=(data.observations||[]).filter(x=>x.account_id===a.id&&x.currency===o.currency&&x.observed_on===date).sort((a,b)=>(b.recorded_at||'').localeCompare(a.recorded_at||'')||b.id?.localeCompare(a.id))[0];
  const weight=balanceWeight(a,date,data,o);
  const value=observation&&observation.balance!=null&&Number.isFinite(Number(observation.balance))?signed(a,Number(observation.balance))*weight:null;
  return {id:a.id,name:a.name,type:a.type,date,weight,value,source:observation?.source||null,recordedAt:observation?.recorded_at||null};
 });
 // Archived connected debt still belongs to a historical balance sheet. Its
 // observation is either present or explicitly missing, never a second liability.
 const plans=accountingBalances(data,{...o,end:date}).map(p=>({...p,alreadyTracked:!!data.accounts.find(a=>a.id===data.accountingPlans?.find(source=>source.id===p.id)?.balance_account_id&&balanceWeight(a,date,data,o)>0)}));
 const missing=[...rows.filter(x=>x.value===null).map(x=>x.name),...(o.accountIds||[]).filter(id=>!data.accounts.some(a=>a.id===id)).map(id=>'Unavailable selected account '+id)];
 const linkedMissing=plans.filter(x=>x.missing).map(x=>x.name);
 const assets=total(rows.map(x=>Math.max(0,x.value??0)))+total(plans.map(x=>x.asset));
 const liabilities=total(rows.map(x=>Math.max(0,-(x.value??0))))+total(plans.map(x=>x.alreadyTracked?0:x.liability));
 const accountNetWorth=total(rows.map(x=>x.value??0));
 const manualItems=(data.assets||[]).filter(a=>a.user_id===o.userId&&o.view==='mine'&&!o.accountIds&&o.currency==='USD');
 return {date,rows,plans,assets,liabilities,netWorth:assets-liabilities,accountNetWorth,missing,linkedMissing,
  complete:rows.length>0&&!missing.length&&!linkedMissing.length,
  manualItems:manualItems.map(x=>x.name),coverage:'Observed account balances plus dated accounting plans. Manual valuations without dated currency evidence are outside this statement.'};
}

function bridge(data:FinanceData,o:ReportOptions,cashOnly:boolean,movement:number){
 const before=previous(o.start),opening=balanceSheetAt(data,o,before),closing=balanceSheetAt(data,o,o.end);
 const relevant=data.accounts.filter(a=>(!cashOnly||isCash(a))&&[before,o.end,...data.allocations.filter(r=>r.account_id===a.id&&r.effective_from>=o.start&&r.effective_from<=o.end).map(r=>r.effective_from)].some(d=>balanceWeight(a,d,data,o)>0));
 const missing:string[]=(o.accountIds||[]).filter(id=>!data.accounts.some(a=>a.id===id)).map(id=>'Unavailable selected account '+id),ownershipMissing:string[]=[];let start=0,end=0,ownership=0;
 for(const a of relevant){
  for(const [date,edge]of [[before,'opening'],[o.end,'closing']] as const){const weight=balanceWeight(a,date,data,o);if(!weight)continue;const rows=edge==='opening'?opening.rows:closing.rows;const row=rows.find(x=>x.id===a.id);if(!row||row.value===null){missing.push(a.name+' · '+date);continue;}if(edge==='opening')start+=row.value;else end+=row.value;}
  const changes=[...new Set(data.allocations.filter(r=>r.account_id===a.id&&r.effective_from>=o.start&&r.effective_from<=o.end).map(r=>r.effective_from))];
  for(const date of changes){const delta=balanceWeight(a,date,data,o)-balanceWeight(a,previous(date),data,o);if(!delta)continue;
   const obs=(data.observations||[]).filter(x=>x.account_id===a.id&&x.observed_on===previous(date)&&x.currency===o.currency).sort((a,b)=>(b.recorded_at||'').localeCompare(a.recorded_at||''))[0];
   if(!obs){ownershipMissing.push(a.name+' · '+date);continue;}ownership+=signed(a,Number(obs.balance))*delta;
  }
 }
 const complete=relevant.length>0&&!missing.length&&!ownershipMissing.length;
 const residual=end-start-movement-ownership;
 return {opening:start,closing:end,movement,ownership,residual,missing,ownershipMissing,complete,reconciled:complete&&nearZero(residual),
  status:!complete?'incomplete':nearZero(residual)?'reconciled':'unexplained' as 'incomplete'|'reconciled'|'unexplained'};
}

/** Sole statement package: source journal, activity, cash, dated balances and controls. */
export function accountingReport(data:FinanceData,options:ReportOptions){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(options.start)||!/^\d{4}-\d{2}-\d{2}$/.test(options.end)||options.start>options.end)throw Error('Choose a valid reporting period.');
 const result=analyticalReport(data,options),cash=cashLedger(data,options),balance=balanceSheetAt(data,options,options.end);
 const cashTypes={operating:0,investing:0,financing:0,transfers:0,other:0};for(const row of cash)cashTypes[row.classification]+=row.amount;
 const sources=(id:string)=>{
  if(data.transactions.some(t=>t.id===id))return [id,...(options.normalized?data.offsets||[]:[]).filter(o=>o.parent_transaction_id===id).map(o=>o.offset_transaction_id)];
  const plan=(data.accountingPlans||[]).find(p=>id.startsWith(p.id+'-'));if(plan)return ['plan:'+plan.id,...plan.payments.map(p=>p.transaction_id),...(plan.disposal_transaction_id?[plan.disposal_transaction_id]:[])];
  const schedule=(data.schedules||[]).find(s=>id.startsWith(s.id+'-'));return schedule?['schedule:'+schedule.id,...(schedule.transaction_id?[schedule.transaction_id]:[])]:[id];
 };
 const journal=[...result.lines.map(x=>({id:'activity:'+x.id,sourceId:sources(x.id).join(' | '),date:x.date,account:x.account,description:x.name,measure:x.income?'income':'expense',amount:x.income?-x.amount:x.amount,category:x.category,weight:x.weight,reason:x.adjustment})),...cash.map(x=>({id:'cash:'+x.id,sourceId:x.transactionId,date:x.date,account:x.account,description:x.name,measure:'cash',amount:x.amount,category:x.classification,weight:x.weight,reason:x.reason}))].sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
 const cashBridge=bridge(data,options,true,result.netCash);
 const netWorthBridge=bridge(data,options,false,result.recorded.income-result.recorded.expenses);
 const missingAccounts=(options.accountIds||[]).filter(id=>!data.accounts.some(a=>a.id===id));
 const checks=[
  {label:'Income less expenses equals surplus',difference:result.income-result.expenses-result.netIncome},
  {label:'Cash classifications equal net cash movement',difference:total(Object.values(cashTypes))-result.netCash},
  {label:'Expense categories equal total expenses',difference:total(result.rows.map(x=>x.actual))-result.expenses},
  {label:'Recorded surplus plus adjustments equals selected surplus',difference:result.recorded.income-result.recorded.expenses+result.adjustment-result.netIncome},
  {label:'Modeled assets less liabilities equals modeled net worth',difference:balance.assets-balance.liabilities-balance.netWorth}
 ].map(x=>({...x,passed:nearZero(x.difference)}));
 return {engineVersion:REPORTING_ENGINE_VERSION,options:{...options},result,cash,cashTypes,balance,cashBridge,netWorthBridge,journal,checks,missingAccounts,
  coverage:{unassigned:result.unassigned,missingAccounts,bankHistoryVerified:false,description:'Available authorized records only. Arithmetic checks do not certify complete bank history.'}};
}
export type AccountingReport=ReturnType<typeof accountingReport>;

/** Never re-run an old calculation and call the new result "as closed". */
export function selectReport(current:FinanceData,requested:ReportOptions,edition:ReportEdition='latest',close?:FinanceDocument){
 if(edition==='latest')return {edition,options:requested,data:current,report:accountingReport(current,requested),held:null,error:''};
 if(!close||close.kind!=='close'||close.owner_id!==requested.userId||!close.payload?.options)return {edition,options:requested,data:current,report:null,held:null,error:'Choose an available close belonging to you.'};
 const p=close.payload,options={...p.options,userId:requested.userId} as ReportOptions;
 if(edition==='closed')return {edition,options,data:p.snapshot||current,report:p.accounting?.engineVersion?structuredClone(p.accounting) as AccountingReport:null,held:p,error:''};
 if(!p.snapshot)return {edition,options,data:current,report:null,held:p,error:'This older close has no source snapshot to restate.'};
 const data=retainAvailable(current,[{payload:p.snapshot,created_at:close.created_at}]);
 data.budgets=[...current.budgets,...(p.snapshot.budgets||[]).filter(b=>b.owner_id!==options.userId&&!current.budgets.some(x=>x.id===b.id))];
 return {edition,options,data,report:accountingReport(data,options),held:p,error:''};
}
