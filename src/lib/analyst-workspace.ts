import {accountingReport,balanceSheetAt} from './reporting-engine';
import {isCash,expenseWeight,type FinanceData,type ReportOptions} from './household-finance';
import {netPay,type PlanRecord} from '../../supabase/functions/_shared/planning-contract';
import {closedForReview} from '../../supabase/functions/_shared/review-periods';

export const ANALYST_VERSION='1.0.0';
export type AnalystAdjustment={id:string;name:string;income:number;expense:number;reason:string;sourceIds:string[]};
export type Workpaper={id:string;owner_id:string;kind:'adjustment'|'scenario'|'review';name:string;scope:Record<string,any>;payload:any;revision:number;archived:boolean;updated_at:string};
const sum=(xs:number[])=>xs.reduce((s,x)=>s+x,0);
const day=(s:string,n:number)=>new Date(Date.parse(s+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
export function quarterBounds(quarter:string,today=new Date().toISOString().slice(0,10)){
 if(!/^20\d{2}-Q[1-4]$/.test(quarter))throw Error('Choose a valid quarter.');
 const y=Number(quarter.slice(0,4)),q=Number(quarter.at(-1));
 const start=`${y}-${String((q-1)*3+1).padStart(2,'0')}-01`,fullEnd=new Date(Date.UTC(y,q*3,0)).toISOString().slice(0,10);
 return {start,end:today>=start&&today<fullEnd?today:fullEnd,fullEnd,partial:today>=start&&today<fullEnd};
}
export function previousQuarter(q:string,years=false){const y=Number(q.slice(0,4)),n=Number(q.at(-1));return years?`${y-1}-Q${n}`:n===1?`${y-1}-Q4`:`${y}-Q${n-1}`;}
export function defaultQuarter(today=new Date().toISOString().slice(0,10)){return previousQuarter(`${today.slice(0,4)}-Q${Math.floor((Number(today.slice(5,7))-1)/3)+1}`);}
export function comparisonBounds(q:string,years:boolean,today:string){const cur=quarterBounds(q,today),prior=quarterBounds(previousQuarter(q,years),'9999-12-31');return {...prior,end:cur.partial?[day(prior.start,Math.round((Date.parse(cur.end)-Date.parse(cur.start))/86400000)),prior.fullEnd].sort()[0]:prior.fullEnd};}
export function analysisScope(o:ReportOptions){return {start:o.start,end:o.end,view:o.view,basis:o.basis,currency:o.currency,accountIds:o.accountIds?[...o.accountIds].sort():null};}
export const sameAnalysisScope=(a:Record<string,any>,b:Record<string,any>)=>JSON.stringify(analysisScope(a as ReportOptions))===JSON.stringify(analysisScope(b as ReportOptions));
export function activeAdjustments(papers:Workpaper[],o:ReportOptions):AnalystAdjustment[]{return papers.filter(p=>p.owner_id===o.userId&&p.kind==='adjustment'&&!p.archived&&sameAnalysisScope(p.scope,analysisScope(o))).map(p=>({id:p.id,name:p.name,...p.payload}));}

/** Derived analysis only. Never writes into the authoritative statement package. */
export function analystReview(data:FinanceData,o:ReportOptions,priorOptions:ReportOptions,adjustments:AnalystAdjustment[]=[],priorAdjustments:AnalystAdjustment[]=[]){
 const reported=accountingReport(data,{...o,normalized:false}),normalized=accountingReport(data,{...o,normalized:true});
 const priorReported=accountingReport(data,{...priorOptions,normalized:false}),priorNormalized=accountingReport(data,{...priorOptions,normalized:true});
 const adjust=(r:typeof reported.result,a:AnalystAdjustment[])=>({income:r.income+sum(a.map(x=>x.income)),expenses:r.expenses+sum(a.map(x=>x.expense)),surplus:r.netIncome+sum(a.map(x=>x.income-x.expense))});
 const adjusted=adjust(normalized.result,adjustments),prior=adjust(priorNormalized.result,priorAdjustments);
 const old=new Map(reported.result.lines.map(l=>[l.id,l])),next=new Map(normalized.result.lines.map(l=>[l.id,l]));
 const bridge=[...new Set([...old.keys(),...next.keys()])].map(id=>{
  const a=old.get(id),b=next.get(id),l=b||a!,tx=data.transactions.find(t=>t.id===id);
  const income=(b?.income?-b.amount:0)-(a?.income?-a.amount:0),expense=(b&&!b.income?b.amount:0)-(a&&!a.income?a.amount:0);
  const reason=tx?.is_one_time_expense||tx?.is_non_gaap_adjustment?'Explicit one-time / adjustment flag':tx?.recognition_date&&tx.recognition_date!==tx.date?'Recognition timing':data.offsets?.some(x=>x.parent_transaction_id===id||x.offset_transaction_id===id)?'Linked refund / reimbursement':b?.adjustment==='Schedule recognition'||b?.adjustment==='Accrual plan recognition'||tx?.is_amortized?'Recognition schedule':'Accounting treatment';
  const sources=[...new Set([...reported.journal,...normalized.journal].filter(j=>j.id==='activity:'+id).flatMap(j=>j.sourceId.split(' | ')))];
  return {id,name:l.name,category:l.category,date:l.date,income,expense,effect:income-expense,reason,sourceIds:sources};
 }).filter(x=>Math.abs(x.income)>.00001||Math.abs(x.expense)>.00001);
 const categories=[...new Set([...normalized.result.rows,...priorNormalized.result.rows].map(x=>x.category))];
 const drivers=categories.map(category=>{const current=normalized.result.rows.find(x=>x.category===category)?.actual||0,prev=priorNormalized.result.rows.find(x=>x.category===category)?.actual||0;return {category,current,prior:prev,change:current-prev};});
 if(adjustments.length||priorAdjustments.length)drivers.push({category:'Analyst expense adjustments',current:sum(adjustments.map(x=>x.expense)),prior:sum(priorAdjustments.map(x=>x.expense)),change:sum(adjustments.map(x=>x.expense))-sum(priorAdjustments.map(x=>x.expense))});
 drivers.sort((a,b)=>Math.abs(b.change)-Math.abs(a.change));
 const merchantMap=new Map<string,{name:string;current:number;prior:number;count:number;priorCount:number}>();
 for(const [book,key,count]of [[normalized,'current','count'],[priorNormalized,'prior','priorCount']] as const)for(const l of book.result.lines.filter(l=>!l.income)){
  const name=l.name.trim(),row=merchantMap.get(name)||{name,current:0,prior:0,count:0,priorCount:0};row[key]+=l.amount;row[count]++;merchantMap.set(name,row);
 }
 const merchants=[...merchantMap.values()].map(x=>({...x,change:x.current-x.prior})).sort((a,b)=>Math.abs(b.change)-Math.abs(a.change));
 const ids=new Set([...reported.journal,...normalized.journal].flatMap(j=>j.sourceId.split(' | ')));
 const review=data.transactions.filter(t=>ids.has(t.id)&&!t.pending&&!closedForReview(t,data.documents||[],o.userId)&&(t.needs_review||!t.category));
 const opening=balanceSheetAt(data,o,day(o.start,-1)),closing=reported.balance,b=reported.netWorthBridge;
 const wealth={opening,closing,complete:opening.complete&&closing.complete&&b.complete,change:closing.netWorth-opening.netWorth,surplus:reported.result.netIncome,ownership:b.ownership,residual:closing.netWorth-opening.netWorth-reported.result.netIncome-b.ownership};
 const checks=[...reported.checks,...normalized.checks,
  {label:'Reported plus engine and analyst adjustments equals adjusted surplus',difference:reported.result.netIncome+sum(bridge.map(x=>x.effect))+sum(adjustments.map(x=>x.income-x.expense))-adjusted.surplus},
  {label:'All category drivers equal the total expense change',difference:sum(drivers.map(x=>x.change))-(adjusted.expenses-prior.expenses)}].map(c=>({...c,passed:Math.abs(c.difference)<.005}));
 const scopeChanges=data.allocations.filter(a=>a.effective_from>priorOptions.start&&a.effective_from<=o.end&&(!o.accountIds||o.accountIds.includes(a.account_id))).length;
 const creditCategories=[...new Set([...normalized.result.rows,...priorNormalized.result.rows].filter(r=>r.actual<-.005).map(r=>r.category))];
 return {version:ANALYST_VERSION,reported,normalized,priorReported,priorNormalized,adjusted,prior,bridge,adjustments,priorAdjustments,drivers,merchants,review,wealth,checks,scopeChanges,creditCategories};
}

export function compensationQuality(data:FinanceData,o:ReportOptions,records:PlanRecord[]){
 const supported=o.view==='mine'&&!o.accountIds&&o.basis==='recorded';
 const selected=records.filter(r=>r.owner_id===o.userId&&r.domain==='income'&&r.kind==='paycheck'&&r.status==='active'&&r.payload.currency===o.currency&&r.payload.date>=o.start&&r.payload.date<=o.end);
 const uses=new Map<string,number>();for(const r of selected)for(const id of r.payload.transactionIds||[])uses.set(id,(uses.get(id)||0)+1);
 const total=(k:string)=>sum(selected.map(r=>Number(r.payload[k]||0)));
 const gross=total('salary')+total('bonus')+total('otherCash'),deductions=total('taxes')+total('retirement')+total('benefits')+total('deductions');
 const rows=selected.map(r=>{
  const ids:string[]=r.payload.transactionIds||[],issues:string[]=[];let actual=0;
  if(!ids.length)issues.push('No deposit linked');
  for(const id of ids){const t=data.transactions.find(t=>t.id===id),a=data.accounts.find(a=>a.id===t?.account_id);
   if(uses.get(id)!==1)issues.push('Deposit used by multiple paystubs');
   if(!t||!a||t.pending||!isCash(a)||a.currency!==o.currency||Number(t.amount)>=0||t.category?.toLowerCase()!=='income'||t.date<o.start||t.date>o.end||expenseWeight(t,a,data,o)!==1)issues.push('Deposit missing, outside period, shared, or not classified as income');
   else actual-=Number(t.amount);
  }
  return {id:r.id,name:r.name,date:r.payload.date,expected:netPay(r.payload),actual:issues.length?null:actual,issues:[...new Set(issues)],sourceIds:ids};
 });
 return {supported,rows,count:selected.length,gross,deductions,net:gross-deductions+total('reimbursements'),salary:total('salary'),variable:total('bonus')+total('otherCash'),taxes:total('taxes'),retirement:total('retirement'),benefits:total('benefits'),otherDeductions:total('deductions'),reimbursements:total('reimbursements'),employerRetirement:total('employerRetirement'),equity:total('equity'),bank:rows.length&&rows.every(x=>x.actual!==null)?sum(rows.map(x=>x.actual!)):null,matched:rows.filter(x=>x.actual!==null&&Math.abs(x.actual-x.expected)<.01).length};
}

export type IntegratedScenario={start:string;months:number;cash:number|null;investments:number|null;debt:number|null;other:number|null;income:number;expenses:number;incomeChange:number;expenseChange:number;investing:number;principal:number;workingCapital:number;annualReturn:number;incomeGrowth:number;expenseGrowth:number;events:{id:string;month:string;name:string;income:number;expense:number}[];source:string};
export function seedIntegratedScenario(review:ReturnType<typeof analystReview>):IntegratedScenario{
 const cents=(n:number)=>Math.round((n+Number.EPSILON)*100)/100;
 const book=review.reported,b=book.balance,months=new Set(book.result.lines.map(l=>l.date.slice(0,7))).size;
 const classify=(type:string)=>['investment','brokerage','retirement'].includes(type)?'investments':['credit','loan'].includes(type)?'debt':['checking','savings','depository'].includes(type)?'cash':'other';
 const value=(kind:string)=>{const rows=b.rows.filter(r=>classify(r.type)===kind);return rows.some(r=>r.value===null)?null:cents(sum(rows.map(r=>kind==='debt'?Math.max(0,-r.value!):r.value!)));};
 const cash=value('cash'),investments=value('investments'),debt=value('debt');
 // Untracked plan liabilities belong in other net assets, avoiding a second debt.
 const other=b.complete&&cash!==null&&investments!==null&&debt!==null?cents(b.netWorth-cash-investments+debt):null;
 const start=new Date(Date.UTC(Number(book.options.end.slice(0,4)),Number(book.options.end.slice(5,7)),1)).toISOString().slice(0,7);
 const periodMonths=(Number(book.options.end.slice(0,4))-Number(book.options.start.slice(0,4)))*12+Number(book.options.end.slice(5,7))-Number(book.options.start.slice(5,7))+1;
 return {start,months:12,cash,investments,debt,other,income:cents(review.adjusted.income/periodMonths),expenses:cents(review.adjusted.expenses/periodMonths),incomeChange:0,expenseChange:0,investing:0,principal:0,workingCapital:0,annualReturn:0,incomeGrowth:0,expenseGrowth:0,events:[],source:`${book.options.start}–${book.options.end}; ${book.options.view}; ${book.options.currency}; ${book.options.basis}; engine ${book.engineVersion}. Adjusted activity divided by ${periodMonths} calendar months (${months} contain statement lines), rounded to cents. Opening balances require ${book.options.end} observations. Partial months are not annualized. Missing activity is not proof of zero. ${review.creditCategories.length?'Expense credits exceed charges in some categories; validate the baseline before relying on this case.':''}`};
}
export function integratedScenario(s:IntegratedScenario){
 const fail=(error:string)=>({error,rows:[] as ScenarioRow[],minimumCash:null as number|null,checksPassed:false});
 if(!s||![s.cash,s.investments,s.debt,s.other].every(x=>typeof x==='number'&&Number.isFinite(x)))return fail('Enter the missing opening balances before projecting.');
 if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(s.start)||!Number.isInteger(s.months)||s.months<1||s.months>60)return fail('Choose a starting month and 1–60 months.');
 if(![s.income,s.expenses,s.incomeChange,s.expenseChange,s.investing,s.principal,s.workingCapital,s.annualReturn,s.incomeGrowth,s.expenseGrowth].every(Number.isFinite)||Math.min(s.investing,s.principal,s.debt!)<0||Math.min(s.annualReturn,s.incomeGrowth,s.expenseGrowth)<-100||Math.max(s.annualReturn,s.incomeGrowth,s.expenseGrowth)>100)return fail('Check amounts and growth assumptions (−100% to 100%).');
 if(!Array.isArray(s.events)||s.events.length>100||s.events.some(e=>!e.name.trim()||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(e.month)||![e.income,e.expense].every(x=>Number.isFinite(x)&&x>=0)))return fail('Events need a month, name and nonnegative income / expense amounts.');
 let cash=s.cash!,investments=s.investments!,debt=s.debt!,other=s.other!;const rows:ScenarioRow[]=[];
 for(let i=0;i<s.months;i++){
  const month=new Date(Date.UTC(Number(s.start.slice(0,4)),Number(s.start.slice(5,7))-1+i,1)).toISOString().slice(0,7);
  const events=s.events.filter(e=>e.month===month),income=(s.income+s.incomeChange)*Math.pow(1+s.incomeGrowth/100,i/12)+sum(events.map(e=>e.income)),expenses=(s.expenses+s.expenseChange)*Math.pow(1+s.expenseGrowth/100,i/12)+sum(events.map(e=>e.expense));
  if(income<0||expenses<0)return fail('Projected income and expenses must be nonnegative.');
  const openingCash=cash,openingWorth=cash+investments-debt+other,returns=investments*(Math.pow(1+s.annualReturn/100,1/12)-1),principal=Math.min(debt,s.principal),surplus=income-expenses;
  const cashChange=surplus-s.investing-principal-s.workingCapital;
  cash+=cashChange;investments+=s.investing+returns;debt-=principal;other+=s.workingCapital;
  const netWorth=cash+investments-debt+other;
  rows.push({month,income,expenses,surplus,openingCash,cashChange,cash,investments,debt,other,returns,principal,investing:s.investing,workingCapital:s.workingCapital,netWorth,wealthChange:netWorth-openingWorth,check:netWorth-openingWorth-surplus-returns});
 }
 if(s.events.some(e=>e.month<s.start||e.month>rows.at(-1)!.month))return fail('An event falls outside the forecast horizon. Extend the horizon or remove that event.');
 return {error:'',rows,minimumCash:Math.min(s.cash!,...rows.map(r=>r.cash)),checksPassed:rows.every(r=>Math.abs(r.check)<.005)};
}
export type ScenarioRow={month:string;income:number;expenses:number;surplus:number;openingCash:number;cashChange:number;cash:number;investments:number;debt:number;other:number;returns:number;principal:number;investing:number;workingCapital:number;netWorth:number;wealthChange:number;check:number};
