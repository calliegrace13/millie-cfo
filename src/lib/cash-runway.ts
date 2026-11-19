import type {FinanceData,FinanceDocument} from './household-finance';
export type CashPlan={id:string;owner_id:string;account_id:string;name:string;amount:number;first_date:string;frequency:'once'|'weekly'|'biweekly'|'monthly'|'quarterly'|'yearly';end_date:string|null;status:'active'|'paused'|'archived';recurring_id?:string|null;project_id?:string|null;discovery_key?:string|null;discovery_evidence?:{transactionIds:string[];lastPostedDate:string;kind:string};revision:number;created_at?:string};
export const cashName=(name:string)=>name.toLowerCase().replace(/\b(?:ppd|web|ctx)\s+id\s*:\s*\S+|\b(?:ref|trace|confirmation)\s*[:#]\s*\S+/g,' ').replace(/\bdir(?:ect)?\s+dep(?:osit)?\b/g,' ').replace(/\bcrd\b/g,'card').replace(/\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g,' ').replace(/\b(?:ach|debit|credit|purchase|online|automatic|autopay|payment|pmt|payroll|salary|deposit)\b/g,' ').replace(/[^a-z0-9]+/g,' ').trim();
// A bank payment and its receipt on a card are one cash movement. Require
// a unique match in both directions; same-amount payments to two cards are
// ambiguous. Matching never edits classifications or creates transfer links.
export function matchCardPayments(data:FinanceData,user:string,currency:string,today:string){
 const accounts=new Map(data.accounts.filter(a=>a.user_id===user&&(a.currency||'USD')===currency&&!data.sharing.some(s=>s.account_id===a.id&&s.duplicate_of)).map(a=>[a.id,a]));
 const seen=new Set<string>();const tx=data.transactions.filter(t=>{
  if(t.user_id!==user||t.pending||t.date>today||!accounts.has(t.account_id||''))return false;
  const key=[t.account_id,t.date,Number(t.amount),cashName(t.merchant_name||t.name)].join('|');if(seen.has(key))return false;seen.add(key);return true;
 });
 const all=new Map(tx.map(t=>[t.id,t]));const card=tx.filter(t=>accounts.get(t.account_id!)?.type==='credit'&&Number(t.amount)<0&&(/payment|autopay|pymt|pmt|thank you/i.test(t.name+' '+t.category)||!!t.linked_transfer_id));
 const cash=tx.filter(t=>['checking','savings','depository'].includes(accounts.get(t.account_id!)?.type||'')&&Number(t.amount)>0&&(/payment|autopay|pymt|pmt|credit.?card/i.test(t.name+' '+t.category)||!!t.linked_transfer_id));
 const forward=new Map<string,typeof card>(),reverse=new Map<string,string[]>();
 for(const bank of cash){
  const explicit=all.get(bank.linked_transfer_id||'');
  if(bank.linked_transfer_id&&!explicit)continue;
  // An explicit cash-to-cash link takes priority over an accidental amount match.
  if(explicit&&accounts.get(explicit.account_id!)?.type!=='credit')continue;
  const matches=card.filter(c=>Math.abs(Number(c.amount)+Number(bank.amount))<.00001&&Math.abs(Date.parse(c.date)-Date.parse(bank.date))<=7*86400000&&(!explicit||c.id===explicit.id)&&(!c.linked_transfer_id||c.linked_transfer_id===bank.id));
  forward.set(bank.id,matches);for(const c of matches)reverse.set(c.id,[...(reverse.get(c.id)||[]),bank.id]);
 }
 const result=new Map<string,string>();
 for(const [id,candidates] of forward)if(candidates.length===1&&reverse.get(candidates[0].id)?.length===1)result.set(id,candidates[0].account_id!);
 // Some banks post before the card receipt arrives. An explicit issuer/card
 // description may follow its established, single-card identity; a generic
 // transfer or an ambiguous amount match may not borrow that identity.
 const aliases=new Map<string,Set<string>>();
 for(const bank of cash){const card=result.get(bank.id);if(!card)continue;const alias=bank.account_id+'|'+cashName(bank.merchant_name||bank.name);const set=aliases.get(alias)||new Set<string>();set.add(card);aliases.set(alias,set);}
 for(const bank of cash){
  if(result.has(bank.id)||(forward.get(bank.id)?.length||0)>0||bank.linked_transfer_id)continue;
  if(!/\b(?:card|crd|amex|visa|mastercard)\b.*\b(?:payment|pmt|pymt|autopay)\b|\b(?:payment|pmt|pymt|autopay)\b.*\b(?:card|crd|amex|visa|mastercard)\b/i.test(bank.name+' '+bank.category))continue;
  const alias=aliases.get(bank.account_id+'|'+cashName(bank.merchant_name||bank.name));if(alias?.size===1)result.set(bank.id,[...alias][0]);
 }
 const matchedFingerprints=new Map(cash.filter(t=>result.has(t.id)).map(t=>[[t.account_id,t.date,Number(t.amount),cashName(t.merchant_name||t.name)].join('|'),result.get(t.id)!]));
 for(const t of data.transactions)if(t.user_id===user&&!t.pending&&t.date<=today){const card=matchedFingerprints.get([t.account_id,t.date,Number(t.amount),cashName(t.merchant_name||t.name)].join('|'));if(card)result.set(t.id,card);}
 return result;
}
export const addDays=(date:string,n:number)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
export function occurrenceDate(first:string,frequency:CashPlan['frequency'],i:number){
  if(frequency==='once')return first;
  if(frequency==='weekly'||frequency==='biweekly')return addDays(first,i*(frequency==='weekly'?7:14));
  const base=new Date(first+'T12:00:00Z');const day=base.getUTCDate();base.setUTCDate(1);base.setUTCMonth(base.getUTCMonth()+i*({monthly:1,quarterly:3,yearly:12}[frequency]));
  base.setUTCDate(Math.min(day,new Date(Date.UTC(base.getUTCFullYear(),base.getUTCMonth()+1,0)).getUTCDate()));return base.toISOString().slice(0,10);
}
export function occurrences(plan:CashPlan,start:string,end:string){
 const dates:string[]=[];if(plan.status!=='active')return dates;
 const monthGap=(Number(start.slice(0,4))-Number(plan.first_date.slice(0,4)))*12+Number(start.slice(5,7))-Number(plan.first_date.slice(5,7));
 const dayGap=(Date.parse(start)-Date.parse(plan.first_date))/86400000;
 const jump=plan.frequency==='weekly'?Math.floor(dayGap/7):plan.frequency==='biweekly'?Math.floor(dayGap/14):plan.frequency==='monthly'?monthGap:plan.frequency==='quarterly'?Math.floor(monthGap/3):plan.frequency==='yearly'?Math.floor(monthGap/12):0;
 for(let i=Math.max(0,jump-1),count=0;count<400;count++,i++){const date=occurrenceDate(plan.first_date,plan.frequency,i);if(date>end||(plan.end_date&&date>plan.end_date))break;if(date>=start)dates.push(date);if(plan.frequency==='once')break;}return dates;
}
export function goalProgress(goal:FinanceDocument,today:string){const p=goal.payload;const reserved=Number(p.reserved)||0,target=Number(p.target)||0;const remaining=Math.max(0,target-reserved);const days=p.deadline?Math.ceil((Date.parse(p.deadline)-Date.parse(today))/86400000):null;const months=days==null?null:Math.max(1,Math.ceil(days/30.4375));return {reserved,target,remaining,percent:target>0?Math.min(100,100*reserved/target):0,monthly:months?remaining/months:null,overdue:days!=null&&days<0&&remaining>0};}
export function cashRunway(data:FinanceData,plans:CashPlan[],userId:string,currency:string,today:string,days:number,buffer:number,variableMonthly:number,spendingAccount:string){
 const accounts=data.accounts.filter(a=>a.user_id===userId&&!a.is_deleted&&!a.retained_history&&['checking','savings','depository'].includes(a.type)&&(a.currency||'USD')===currency&&!data.sharing.find(s=>s.account_id===a.id)?.duplicate_of);
 const valid=new Set(accounts.map(a=>a.id));const end=addDays(today,Math.min(366,Math.max(1,days)));const start=addDays(today,1);
 const warnings:string[]=[];for(const a of accounts)if(a.current_balance==null||!Number.isFinite(Number(a.current_balance)))warnings.push('A selected account has no usable balance: '+a.name);
 const opening=accounts.reduce((s,a)=>s+(a.is_zero_balance?0:Number(a.current_balance)||0),0);
 const reservations=(data.documents||[]).filter(d=>d.owner_id===userId&&d.kind==='goal'&&d.payload.status!=='archived'&&valid.has(d.payload.accountId)&&d.payload.currency===currency).reduce((s,d)=>s+Math.max(0,Number(d.payload.reserved)||0),0);
 const entries:{id:string;date:string;accountId:string;name:string;amount:number;source:string}[]=[];
 const cardMatches=plans.some(p=>p.discovery_key?.split('|')[4]?.startsWith('card:'))?matchCardPayments(data,userId,currency,today):new Map<string,string>();
 const transactionsById=new Map(data.transactions.map(t=>[t.id,t]));const unresolvedPayments=new Set<string>();
 for(const p of plans.filter(p=>p.owner_id===userId&&valid.has(p.account_id)&&p.status==='active')){
  const project=p.project_id?data.documents?.find(d=>d.id===p.project_id&&d.kind==='project'):null;
  if(p.project_id&&(!project||project.payload.status==='archived'))continue;
  if(project&&project.payload.currency!==currency){warnings.push('Project currency differs from its cash account; update cash timing: '+project.name);continue;}
  const recurring=p.recurring_id?data.recurring?.find(r=>r.id===p.recurring_id):null;
  if(p.recurring_id&&(!recurring||!recurring.is_active)){warnings.push('Inactive or unavailable recurring item is excluded: '+p.name);continue;}
  const effective:CashPlan=recurring?{...p,name:recurring.name,amount:-Number(recurring.expected_amount),frequency:recurring.frequency as CashPlan['frequency'],first_date:recurring.next_expected_date||p.first_date,end_date:recurring.end_date||p.end_date}:project?{...p,name:project.name,frequency:'once',amount:-Math.max(0,Number(project.payload.committed)||0)}:p;
  const allowance=effective.frequency==='monthly'&&Number(effective.amount)<0&&p.discovery_key?.endsWith('|monthly-allowance');
  for(const scheduledDate of occurrences(effective,allowance?today.slice(0,7)+'-01':start,end)){
   const date=allowance&&scheduledDate<=today?start:scheduledDate;
   if(date>end||(p.end_date&&date>p.end_date))continue;
   // An early posted payment is already in opening cash. Match one nearby
   // occurrence only, with the original counterparty, payer and cash direction.
   const identity=p.discovery_key?.split('|')[4];
   if(identity?.startsWith('card:')&&scheduledDate.slice(0,7)===today.slice(0,7)&&(allowance||scheduledDate<=addDays(today,5))){
    const ambiguous=data.transactions.filter(t=>t.user_id===userId&&t.account_id===p.account_id&&!t.pending&&Number(t.amount)>0&&t.date<=today&&t.date.slice(0,7)===scheduledDate.slice(0,7)&&t.date>(p.discovery_evidence?.lastPostedDate||'')&&!cardMatches.has(t.id)&&/payment|autopay|pymt|pmt/i.test(t.name+' '+t.category)&&!/venmo|zelle|paypal/i.test(t.name)&&!data.accounts.some(a=>a.id===transactionsById.get(t.linked_transfer_id||'')?.account_id&&['checking','savings','depository'].includes(a.type)));
    if(ambiguous.length){for(const t of ambiguous)unresolvedPayments.add(t.id);warnings.push('A posted bank payment may overlap this card forecast: '+effective.name+'. The affected estimate is excluded until its card receipt is matched. Sync or review the bank payment; projection coverage is incomplete.');continue;}
   }
   const posted=p.discovery_key?data.transactions.filter(t=>t.user_id===userId&&t.account_id===p.account_id&&!t.pending&&t.date<=today&&(allowance?t.date.slice(0,7)===scheduledDate.slice(0,7):t.date>=addDays(date,-(p.frequency==='weekly'?2:5))&&t.date>(p.discovery_evidence?.lastPostedDate||'')&&!p.discovery_evidence?.transactionIds.includes(t.id))&&Math.sign(Number(t.amount))===-Math.sign(Number(effective.amount))&&(identity?.startsWith('card:')?cardMatches.get(t.id)===identity.slice(5):cashName(t.merchant_name||t.name)===identity)):[];
   const distinct=new Map(posted.map(t=>[[t.date,Number(t.amount),cashName(t.merchant_name||t.name)].join('|'),Math.abs(Number(t.amount))]));
   const paid=[...distinct.values()].reduce((s,n)=>s+n,0);
   // Partial bill/card debits reduce the remaining estimate, rather than
   // incorrectly treating a small early payment as the entire commitment.
   const amount=paid?(Number(effective.amount)>0?0:-Math.max(0,Math.abs(Number(effective.amount))-paid)):Number(effective.amount);
   if(paid)warnings.push((amount?'Partly posted; only the remaining estimate is forecast: ':'Already posted; excluded from future cash movements: ')+effective.name+' · '+scheduledDate);
   if(allowance&&scheduledDate<=today&&amount)warnings.push('Remaining '+scheduledDate.slice(0,7)+' card-payment allowance is held tomorrow; confirm actual timing: '+effective.name);
   if(!amount)continue;
   entries.push({id:p.id+':'+scheduledDate,date,accountId:p.account_id,name:effective.name,amount,source:p.recurring_id?'Linked recurring bill':p.project_id?'Linked project commitment':allowance?'Remaining monthly card-payment allowance; posted bank debits deducted':p.discovery_key?'Reviewed transaction pattern':'Cash plan'});
  }
  if(effective.frequency==='once'&&effective.first_date<=today)warnings.push('Past-due plan is excluded; confirm whether it was paid: '+effective.name);
 }
 if(variableMonthly>0&&!valid.has(spendingAccount))warnings.push('Choose a cash account for variable spending. No variable spending estimate has been included.');
 const balances=Object.fromEntries(accounts.map(a=>[a.id,a.is_zero_balance?0:Number(a.current_balance)||0]));const rows:{date:string;opening:number;inflow:number;outflow:number;closing:number;available:number;accounts:Record<string,number>}[]=[];
 let cash=opening;let minimum=opening;let lowDate:string|null=null;
 for(let date=start;date<=end;date=addDays(date,1)){
  if(variableMonthly>0&&valid.has(spendingAccount)){const d=new Date(date+'T12:00:00Z');const count=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();const factor=10**new Intl.NumberFormat('en',{style:'currency',currency}).resolvedOptions().maximumFractionDigits;const units=Math.round(variableMonthly*factor);const day=d.getUTCDate();const amount=-(Math.round(units*day/count)-Math.round(units*(day-1)/count))/factor;entries.push({id:'variable:'+date,date,accountId:spendingAccount,name:'Variable spending estimate',amount,source:'Assumption; exclude scheduled bills from this amount'});}
  const daily=entries.filter(e=>e.date===date);const before=cash;let inflow=0,outflow=0;
  for(const e of daily){balances[e.accountId]+=e.amount;cash+=e.amount;if(e.amount>0)inflow+=e.amount;else outflow-=e.amount;}
  minimum=Math.min(minimum,cash);const available=cash-Math.max(0,buffer)-reservations;if(available<0&&!lowDate)lowDate=date;
  rows.push({date,opening:before,inflow,outflow,closing:cash,available,accounts:{...balances}});
 }
 for(const a of accounts){const shortfall=rows.find(r=>r.accounts[a.id]<0);if(shortfall)warnings.push(a.name+' is projected below zero on '+shortfall.date+'. Money in another account is not automatically transferred.');}
 return {complete:accounts.length>0&&accounts.every(a=>a.current_balance!=null&&Number.isFinite(Number(a.current_balance)))&&!unresolvedPayments.size,unresolvedPayments:unresolvedPayments.size,accounts,opening,reservations,minimum,buffer:Math.max(0,buffer),lowDate,rows,entries:entries.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id)),warnings,availableToday:opening-Math.max(0,buffer)-reservations,ending:cash};
}
