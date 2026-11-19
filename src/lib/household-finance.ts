import {planState,planEntries,disposalExpense,type AccountingPlan} from './accounting-plans';
import type { Account, Transaction, AmortizationSchedule, Asset, RecurringTransaction } from './types';
export type FinanceView = 'mine' | 'partner' | 'household';
export type HistoryBasis = 'recorded' | 'comparable' | 'proforma';
export type Allocation = { id: string; account_id: string; owner_id: string; partner_id: string | null; effective_from: string; owner_pct: number; balance_pct?: number | null; included: boolean; note: string; created_at: string };
export type Sharing = { account_id: string; owner_id: string; recipient_id: string | null; history_from: string | null; enabled: boolean; duplicate_of: string | null };
export type BudgetVersion = { id: string; owner_id: string; partner_link_id: string | null; category: string; view: 'mine' | 'household'; currency: string; effective_month: string; amount: number; created_at: string };
export type FinanceDocument = {id:string;owner_id:string;kind:'scope'|'scenario'|'project'|'goal'|'close';name:string;payload:any;created_at:string;updated_at:string};
export type BalanceObservation = {id:string;account_id:string;owner_id:string;observed_on:string;balance:number;currency:string;source:string;recorded_at:string};
export type CategorySplit = {id:string;account_id:string;owner_id:string;partner_id:string|null;category:string;effective_from:string;owner_pct:number};
export type FinanceData = { accounts: Account[]; transactions: Transaction[]; allocations: Allocation[]; sharing: Sharing[]; budgets: BudgetVersion[]; accountingPlans?:AccountingPlan[]; documents?:FinanceDocument[]; observations?:BalanceObservation[]; categorySplits?:CategorySplit[]; schedules?:AmortizationSchedule[]; assets?:Asset[]; recurring?:RecurringTransaction[]; offsets?:{parent_transaction_id:string;offset_transaction_id:string}[] };
export type ReportOptions = { userId: string; partnerId: string | null; linkId: string | null; view: FinanceView; basis: HistoryBasis; currency: string; start: string; end: string; accountIds?:string[]; normalized?:boolean; proformaPct?:number };
export function allocationAt(rules: Allocation[], accountId: string, date: string): Allocation | undefined {
  return rules.filter(r => r.account_id === accountId && r.effective_from <= date).sort((a,b) => b.effective_from.localeCompare(a.effective_from))[0];
}
export function personalShare(account: Account, date: string, person: string | null, rules: Allocation[], override?: number | null): number {
  if (!person) return 0;
  const rule = allocationAt(rules, account.id, date);
  const pct = Number(override ?? rule?.owner_pct ?? 100) / 100;
  if (person === account.user_id) return pct;
  return person === rule?.partner_id ? 1 - pct : 0;
}
export function accountWeight(account: Account, date: string, data: FinanceData, options: ReportOptions, override?: number | null): number {
  if(options.accountIds&&!options.accountIds.includes(account.id))return 0;
  if ((account.currency || 'USD') !== options.currency) return 0;
  const duplicate = data.sharing.find(s => s.account_id === account.id)?.duplicate_of;
  if (duplicate && data.accounts.some(a => a.id === duplicate)) return 0;
  if (options.view !== 'household') {
    const person=options.view === 'mine' ? options.userId : options.partnerId;
    if(options.basis==='proforma')return person===options.userId?(options.proformaPct??50)/100:person===options.partnerId?1-(options.proformaPct??50)/100:0;
    return personalShare(account, date, person, data.allocations, override);
  }
  const included = options.basis !== 'recorded'
    ? options.accountIds ? options.accountIds.includes(account.id) : data.allocations.some(r => r.account_id === account.id && r.included)
    : allocationAt(data.allocations, account.id, date)?.included;
  return included ? 1 : 0;
}
export function balanceWeight(account:Account,date:string,data:FinanceData,options:ReportOptions) {
 return accountWeight(account,date,data,options,allocationAt(data.allocations,account.id,date)?.balance_pct);
}
export function expenseWeight(tx:Transaction,account:Account,data:FinanceData,options:ReportOptions) {
 const category=(data.categorySplits||[]).filter(r=>r.account_id===account.id&&r.category.toLowerCase()===(tx.category||'Uncategorized').toLowerCase()&&r.effective_from<=tx.date).sort((a,b)=>b.effective_from.localeCompare(a.effective_from))[0];
 if(category&&tx.ownership_pct==null&&options.view!=='household'&&options.basis!=='proforma') {
  const person=options.view==='mine'?options.userId:options.partnerId;
  const allowed=accountWeight(account,tx.date,data,{...options,view:'household',basis:'comparable',accountIds:options.accountIds||[account.id]});
  return allowed*(person===account.user_id?Number(category.owner_pct)/100:person===category.partner_id?1-Number(category.owner_pct)/100:0);
 }
 return accountWeight(account,tx.date,data,options,tx.ownership_pct);
}
export const isInternal=(tx:Transaction)=>!!tx.linked_transfer_id||['transfer','credit card payment','reimbursement','settlement'].includes((tx.category||'').toLowerCase());
export const isCash=(a:Account)=>['checking','savings','depository'].includes(a.type);
export function report(data: FinanceData, options: ReportOptions) {
  const accounts = new Map(data.accounts.map(a => [a.id,a]));
  const categories = new Map<string, number>();
  const budget = new Map<string, number>();
  let income=0, expenses=0, cashIn=0, cashOut=0, unassigned=0, count=0;
  for (const tx of data.transactions) {
    if (tx.pending || tx.date < options.start || tx.date > options.end) continue;
    const account = accounts.get(tx.account_id || '');
    if (!account) { unassigned++; continue; }
    const weight = expenseWeight(tx, account, data, options);
    const cashWeight = balanceWeight(account, tx.date, data, options);
    if (!weight && !cashWeight) continue;
    count++;
    const amount = Number(tx.amount) * weight;
    const category = tx.category || 'Uncategorized';
    const transfer = isInternal(tx);
    if (!transfer) {
      if (category.toLowerCase() === 'income') income -= amount;
      else { expenses += amount; categories.set(category,(categories.get(category)||0)+amount); }
    }
    if (['checking','savings','depository'].includes(account.type)) {
      const cashAmount = Number(tx.amount) * cashWeight;
      if (cashAmount<0) cashIn -= cashAmount; else cashOut += cashAmount;
    }
  }
  // Full-month targets only; the UI supplies complete calendar months or years.
  for (let month=options.start.slice(0,7)+'-01'; month<=options.end;) {
    const eligible = data.budgets.filter(b => !options.accountIds && options.basis!=='proforma' && b.currency===options.currency && b.effective_month<=month &&
      (options.view==='household' ? b.view==='household' && b.partner_link_id===options.linkId && !!options.linkId :
       b.view==='mine' && b.owner_id===(options.view==='mine'?options.userId:options.partnerId)));
    const latest = new Map<string,BudgetVersion>();
    for(const b of eligible) {
      const prev=latest.get(b.category);
      if(!prev || b.effective_month>prev.effective_month || (b.effective_month===prev.effective_month && b.created_at>prev.created_at)) latest.set(b.category,b);
    }
    for(const b of latest.values()) budget.set(b.category,(budget.get(b.category)||0)+Number(b.amount));
    const [y,m]=month.split('-').map(Number); month=`${m===12?y+1:y}-${String(m===12?1:m+1).padStart(2,'0')}-01`;
  }
  // All consumers use the same recognition rules, including principal, deposits,
  // escrow and refunds. The bank-activity loop above only supplies coverage.
  const activity=ledger(data,{...options,normalized:false});
  income=0-activity.filter(x=>x.income).reduce((s,x)=>s+x.amount,0);
  expenses=activity.filter(x=>!x.income).reduce((s,x)=>s+x.amount,0);
  categories.clear();for(const x of activity)if(!x.income)categories.set(x.category,(categories.get(x.category)||0)+x.amount);
  const cash=cashLedger(data,options);cashIn=cash.filter(x=>x.amount>0).reduce((s,x)=>s+x.amount,0);cashOut=-cash.filter(x=>x.amount<0).reduce((s,x)=>s+x.amount,0);
  const rows=[...new Set([...categories.keys(),...budget.keys()])].sort().map(category=>({category,actual:categories.get(category)||0,budget:budget.get(category)??null}));
  const balances=data.accounts.filter(a=>!a.is_deleted&&balanceWeight(a,options.end,data,options)>0).map(a=>({id:a.id,name:a.name,type:a.type,amount:(a.is_zero_balance?0:Number(a.current_balance)||0)*balanceWeight(a,options.end,data,options)}));
  const signedBalance=(a:typeof balances[number])=>['credit','loan'].includes(a.type)?-a.amount:a.amount;
  const assets=balances.reduce((s,a)=>s+Math.max(0,signedBalance(a)),0);
  const liabilities=balances.reduce((s,a)=>s+Math.max(0,-signedBalance(a)),0);
  return { income,expenses,netIncome:income-expenses,cashIn,cashOut,netCash:cashIn-cashOut,rows,balances,assets,liabilities,netWorth:assets-liabilities,count,unassigned,planned:[...budget.values()].reduce((s,n)=>s+n,0) };
}
export function ledger(data:FinanceData,options:ReportOptions) {
 const rows:{id:string;date:string;name:string;account:string;category:string;amount:number;rawAmount:number;weight:number;adjustment:string;income:boolean}[]=[];
 const planLinks=new Map((data.accountingPlans||[]).filter(p=>!p.is_void).flatMap(p=>p.payments.map(l=>[l.transaction_id,{p,l}] as const)));
 const disposalIds=new Set((data.accountingPlans||[]).filter(p=>!p.is_void).map(p=>p.disposal_transaction_id).filter(Boolean));
 const eligibleOffset=(id:string)=>{const t=data.transactions.find(t=>t.id===id);const a=data.accounts.find(a=>a.id===t?.account_id);return !!(t&&a&&!t.pending&&!isInternal(t)&&!t.is_one_time_expense&&!t.is_non_gaap_adjustment&&!t.is_amortized&&expenseWeight(t,a,data,options));};
 const offsets=(data.offsets||[]).filter(o=>eligibleOffset(o.parent_transaction_id)&&eligibleOffset(o.offset_transaction_id));
 const childIds=new Set(offsets.map(o=>o.offset_transaction_id));
 for(const t of data.transactions){
  const a=data.accounts.find(a=>a.id===t.account_id);if(!a||t.pending||isInternal(t))continue;
  if(disposalIds.has(t.id)&&(options.normalized||(data.accountingPlans||[]).some(p=>!p.is_void&&p.kind==='deposit'&&p.disposal_transaction_id===t.id)))continue;
  const linkedPlan=planLinks.get(t.id);if(linkedPlan&&(options.normalized||['loan','deposit'].includes(linkedPlan.p.kind)))continue;
  const date=options.normalized?(t.recognition_date||t.date):t.date;
  if(date<options.start||date>options.end)continue;
  const weight=expenseWeight(t,a,data,options);if(!weight)continue;
  if(options.normalized&&(t.is_one_time_expense||t.is_non_gaap_adjustment))continue;
  if(options.normalized&&t.is_amortized&&(data.schedules||[]).some(s=>s.transaction_id===t.id&&s.is_active))continue;
  if(options.normalized&&childIds.has(t.id))continue;
  let amount=Number(t.amount)*weight;
  if(options.normalized)for(const o of offsets){if(o.parent_transaction_id!==t.id)continue;const child=data.transactions.find(x=>x.id===o.offset_transaction_id);const ca=data.accounts.find(x=>x.id===child?.account_id);if(child&&ca&&!child.pending&&!isInternal(child))amount+=Number(child.amount)*expenseWeight(child,ca,data,options);}
  rows.push({id:t.id,date,name:t.merchant_name||t.name,account:a.name,category:t.category||'Uncategorized',amount,rawAmount:Number(t.amount),weight,adjustment:options.normalized&&date!==t.date?'Recognition date':options.normalized?'Normalized':'Recorded',income:(t.category||'').toLowerCase()==='income'});
 }
 if(options.normalized)for(const s of data.schedules||[]){
  if(!s.is_active)continue;const tx=data.transactions.find(t=>t.id===s.transaction_id);const a=data.accounts.find(a=>a.id===tx?.account_id);
  // Account-backed schedules can follow scope; standalone schedules are private and explicitly USD.
  if(!a&&(options.view!=='mine'||s.user_id!==options.userId||options.currency!=='USD'||options.accountIds))continue;
  if(tx&&(tx.pending||isInternal(tx)||tx.is_one_time_expense||tx.is_non_gaap_adjustment))continue;
  const weight=a&&tx?expenseWeight(tx,a,data,options):1;
  if(!weight)continue;
  const totalMonths=monthList(s.start_date,s.end_date).length;
  for(const m of monthList(s.start_date,s.end_date)){const date=m<s.start_date?s.start_date:m;if(date<options.start||date>options.end)continue;const idx=monthList(s.start_date,s.end_date).indexOf(m);const piece=Math.max(0,Math.min(Number(s.monthly_amount),Number(s.total_amount)-idx*Number(s.monthly_amount)));rows.push({id:s.id+'-'+m,date,name:s.name,account:a?.name||'Standalone schedule (USD)',category:s.category||'Scheduled expense',amount:piece*weight*(s.type==='deferred_income'?-1:1),rawAmount:piece,weight,adjustment:'Schedule recognition',income:s.type==='deferred_income'});}
 }
 for(const p of (data.accountingPlans||[]).filter(p=>!p.is_void)){const a=data.accounts.find(a=>a.id===p.account_id);if(!a)continue;
 const add=(id:string,date:string,amount:number,category:string,income:boolean,adjustment:string)=>{const weight=expenseWeight({date,category,user_id:p.owner_id} as Transaction,a,data,options);if(weight)rows.push({id,date,name:p.name,account:a.name,category,amount:amount*weight,rawAmount:amount,weight,adjustment,income});};
 if(options.normalized){const cuts=[...new Set([options.start,...data.allocations.filter(x=>x.account_id===a.id).map(x=>x.effective_from),...(data.categorySplits||[]).filter(x=>x.account_id===a.id&&x.category.toLowerCase()===p.category.toLowerCase()).map(x=>x.effective_from)])].filter(d=>d>=options.start&&d<=options.end).sort();for(let i=0;i<cuts.length;i++){const end=cuts[i+1]?new Date(Date.parse(cuts[i+1]+'T12:00:00Z')-86400000).toISOString().slice(0,10):options.end;for(const e of planEntries(p,cuts[i],end))add(p.id+'-'+e.date,e.date,e.amount*(p.kind==='deferred_income'?-1:1),p.category,p.kind==='deferred_income','Accrual plan recognition');}}
 if(p.disposal_date&&p.disposal_date>=options.start&&p.disposal_date<=options.end&&(options.normalized||p.kind==='deposit'))add(p.id+'-disposal',p.disposal_date,disposalExpense(p,data.transactions),p.category,false,'Disposal / unrecovered deposit');
 if(p.kind==='loan')for(const e of p.escrow_charges||[])if(e.date>=options.start&&e.date<=options.end)add(p.id+'-escrow-'+e.date+'-'+e.category,e.date,Number(e.amount),e.category,false,'Paid from escrow; no new bank cash movement');
 if(p.kind==='loan')for(const l of p.payments){const t=data.transactions.find(t=>t.id===l.transaction_id&&!t.pending);if(t&&t.date>=options.start&&t.date<=options.end&&Number(l.interest))add(p.id+'-'+t.id,t.date,Number(l.interest),'Fees & Interest',false,'Interest portion; principal excluded');}
 }
 return rows;
}
export function accountingBalances(data:FinanceData,options:ReportOptions){return (data.accountingPlans||[]).filter(p=>!p.is_void).flatMap(p=>{const a=data.accounts.find(a=>a.id===p.account_id);if(!a)return [];const weight=['loan','asset','deposit'].includes(p.kind)?balanceWeight(a,options.end,data,options):expenseWeight({date:options.end,category:p.category,user_id:p.owner_id} as Transaction,a,data,options);if(!weight)return [];const state=planState(p,data.transactions,options.end);return [{...state,id:p.id,name:p.name,kind:p.kind,weight,asset:state.asset*weight,liability:state.liability*weight,commitment:state.commitment*weight,alreadyTracked:!!data.accounts.find(debt=>debt.id===p.balance_account_id&&!debt.is_deleted&&balanceWeight(debt,options.end,data,options)>0)}];});}
export function analyticalReport(data:FinanceData,options:ReportOptions){
 const base=report(data,options),lines=ledger(data,options),raw=ledger(data,{...options,normalized:false});
 const sum=(rows:typeof lines)=>({income:0-rows.filter(t=>t.income).reduce((s,t)=>s+t.amount,0),expenses:rows.filter(t=>!t.income).reduce((s,t)=>s+t.amount,0)});
 const current=sum(lines),recorded=sum(raw);const cats=new Map<string,number>();for(const t of lines)if(!t.income)cats.set(t.category,(cats.get(t.category)||0)+t.amount);
 const rows=[...new Set([...cats.keys(),...base.rows.map(r=>r.category)])].sort().map(category=>({category,actual:cats.get(category)||0,budget:base.rows.find(r=>r.category===category)?.budget??null}));
 return {...base,...current,count:base.count||lines.length,netIncome:current.income-current.expenses,rows,lines,recorded,adjustment:current.income-current.expenses-(recorded.income-recorded.expenses),savingsRate:current.income>0?(current.income-current.expenses)/current.income:null};
}
export function monthList(start:string,end:string){const result:string[]=[];for(let m=start.slice(0,7)+'-01';m<=end&&result.length<1200;){result.push(m);const [y,n]=m.split('-').map(Number);m=`${n===12?y+1:y}-${String(n===12?1:n+1).padStart(2,'0')}-01`;}return result;}
export function reportingPeriod(month:string,period:string){const [y,m]=month.split('-').map(Number);const end=periodBounds(month,false).end;return period==='year'?periodBounds(month,true):period==='ytd'?{start:`${y}-01-01`,end}:period==='quarter'?{start:`${y}-${String(Math.floor((m-1)/3)*3+1).padStart(2,'0')}-01`,end:periodBounds(`${y}-${String(Math.floor((m-1)/3)*3+3).padStart(2,'0')}`,false).end}:period==='ttm'?{start:`${m===12?y:y-1}-${String(m===12?1:m+1).padStart(2,'0')}-01`,end}:{start:month+'-01',end};}
export function snapshotReconciliation(data:FinanceData,options:ReportOptions){
 const day=new Date(options.start+'T12:00:00Z');day.setUTCDate(day.getUTCDate()-1);const before=day.toISOString().slice(0,10);
 const accounts=data.accounts.filter(a=>isCash(a)&&(!options.accountIds||options.accountIds.includes(a.id))&&(balanceWeight(a,options.start,data,options)>0||balanceWeight(a,options.end,data,options)>0));
 let opening=0,closing=0;const missing:string[]=[];
 for(const a of accounts){const first=data.observations?.find(s=>s.account_id===a.id&&s.observed_on===before&&s.currency===options.currency);const last=data.observations?.find(s=>s.account_id===a.id&&s.observed_on===options.end&&s.currency===options.currency);if(!first||!last){missing.push(a.name);continue;}opening+=Number(first.balance)*balanceWeight(a,before,data,options);closing+=Number(last.balance)*balanceWeight(a,options.end,data,options);}
 const movement=report(data,options).netCash;return {opening,closing,movement,residual:closing-opening-movement,missing,complete:accounts.length>0&&!missing.length};
}
export function cashClassification(data:FinanceData,o:ReportOptions){
 const totals={operating:0,investing:0,financing:0,transfers:0,other:0};
 for(const row of cashLedger(data,o))totals[row.classification]+=row.amount;
 return totals;
}
export function cashLedger(data:FinanceData,o:ReportOptions){
 const rows:{id:string;transactionId:string;date:string;accountId:string;account:string;name:string;amount:number;weight:number;classification:'operating'|'investing'|'financing'|'transfers'|'other';reason:string}[]=[];
 const plans=(data.accountingPlans||[]).filter(p=>!p.is_void);
 for(const t of data.transactions){
  if(t.pending||t.date<o.start||t.date>o.end)continue;
  const a=data.accounts.find(a=>a.id===t.account_id);if(!a||!isCash(a))continue;
  const weight=balanceWeight(a,t.date,data,o);if(!weight)continue;
  const add=(classification:typeof rows[number]['classification'],amount:number,reason:string)=>{if(amount)rows.push({id:t.id+'-'+classification,transactionId:t.id,date:t.date,accountId:a.id,account:a.name,name:t.merchant_name||t.name,amount:-amount*weight,weight,classification,reason});};
  const linked=plans.flatMap(p=>p.payments.map(l=>({p,l}))).find(x=>x.l.transaction_id===t.id);
  if(plans.some(p=>p.disposal_transaction_id===t.id)){add('investing',Number(t.amount),'Asset disposal / deposit recovery');continue;}
  if(linked?.p.kind==='loan'){add('operating',Number(linked.l.interest||0),'Loan interest');add('investing',Number(linked.l.escrow||0),'Escrow funding');add('financing',Number(t.amount)-Number(linked.l.interest||0)-Number(linked.l.escrow||0),'Loan principal');continue;}
  const classification=linked?(['asset','deposit'].includes(linked.p.kind)?'investing':'operating'):isInternal(t)?'transfers':['operating','investing','financing'].includes(t.cash_flow_type)?t.cash_flow_type:'other';
  add(classification as typeof rows[number]['classification'],Number(t.amount),linked?'Linked accounting plan':isInternal(t)?'Transfer / settlement / card payment':'Saved cash-flow classification');
 }
 return rows;
}
export function netWorthReconciliation(data:FinanceData,o:ReportOptions){
 const d=new Date(o.start+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-1);const before=d.toISOString().slice(0,10);let opening=0,closing=0;const missing:string[]=[];
 const accounts=data.accounts.filter(a=>balanceWeight(a,before,data,o)||balanceWeight(a,o.end,data,o));
 for(const a of accounts){const first=data.observations?.find(s=>s.account_id===a.id&&s.observed_on===before&&s.currency===o.currency);const last=data.observations?.find(s=>s.account_id===a.id&&s.observed_on===o.end&&s.currency===o.currency);if(!first||!last){missing.push(a.name);continue;}const sign=['credit','loan'].includes(a.type)?-1:1;opening+=sign*Number(first.balance)*balanceWeight(a,before,data,o);closing+=sign*Number(last.balance)*balanceWeight(a,o.end,data,o);}
 const surplus=analyticalReport(data,{...o,normalized:false}).netIncome;
 return {opening,closing,surplus,residual:closing-opening-surplus,missing,complete:accounts.length>0&&!missing.length};
}
export function periodBounds(month:string,yearly:boolean) {
  const [y,m]=month.split('-').map(Number);
  const last=new Date(y,m,0).getDate();
  return yearly ? {start:`${y}-01-01`,end:`${y}-12-31`} : {start:`${month}-01`,end:`${month}-${last}`};
}
