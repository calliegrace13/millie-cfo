import type {FinanceData} from './household-finance';
import type {Transaction} from './types';
import {addDays,cashName,matchCardPayments,occurrenceDate,occurrences,type CashPlan} from './cash-runway';

export type RunwaySuggestion={key:string;account_id:string;name:string;kind:'Paycheck'|'Bill'|'Card payment';amount:number;first_date:string;frequency:CashPlan['frequency'];count:number;low:number;high:number;variable:boolean;evidence:string[];last_date:string;blocked:string|null;review_reason?:string;estimate_note?:string;card_id?:string};
const gap=(a:string,b:string)=>(Date.parse(b)-Date.parse(a))/86400000;
const median=(xs:number[])=>{const s=xs.slice().sort((a,b)=>a-b);return s[Math.floor(s.length/2)];};
const similar=(a:string,b:string)=>{const x=cashName(a),y=cashName(b);return !!x&&!!y&&(x===y||(Math.min(x.length,y.length)>=5&&(x.includes(y)||y.includes(x))));};

// Read-only evidence discovery: dates and amounts remain estimates until accepted.
export function discoverRunway(data:FinanceData,plans:CashPlan[],user:string,currency:string,today:string,options:{cardChargesOnly?:boolean}={}):RunwaySuggestion[]{
 const accounts=new Map(data.accounts.filter(a=>a.user_id===user&&!a.is_deleted&&!a.retained_history&&['checking','savings','depository'].includes(a.type)&&(a.currency||'USD')===currency&&!data.sharing.some(s=>s.account_id===a.id&&s.duplicate_of)).map(a=>[a.id,a]));
 const groups=new Map<string,{kind:RunwaySuggestion['kind'];name:string;tx:Transaction[]}>();const ids=new Set<string>(),fingerprints=new Set<string>();
 const allAccounts=new Map(data.accounts.map(a=>[a.id,a]));
 const matched=matchCardPayments(data,user,currency,today);
 // Fill a missing receipt only when that exact bank description has always
 // resolved to one card. Generic transfer descriptions cannot supply identity.
 const aliases=new Map<string,Set<string>>();
 for(const t of data.transactions){const card=matched.get(t.id);if(!card)continue;const alias=t.account_id+'|'+cashName(t.merchant_name||t.name);const cards=aliases.get(alias)||new Set<string>();cards.add(card);aliases.set(alias,cards);}
 for(const t of data.transactions){
  if(!accounts.has(t.account_id||'')||t.user_id!==user||t.pending||t.date>today||t.date<addDays(today,-550)||!Number.isFinite(Number(t.amount))||!Number(t.amount)||ids.has(t.id))continue;
  ids.add(t.id);const text=[t.name,t.merchant_name,t.category,t.classification_kind,JSON.stringify(t.provider_metadata||{})].join(' ').toLowerCase();
  const explicitCard=Number(t.amount)>0&&(/credit[ _-]?card[ _-]?payment|loan_payments_credit_card|transfer_in_credit_card/.test(text)||/\b(?:card|crd|amex|visa|mastercard)\b.*\b(?:payment|pmt|pymt|autopay)\b|\b(?:payment|pmt|pymt|autopay)\b.*\b(?:card|crd|amex|visa|mastercard)\b/.test(text));
  const alias=aliases.get(t.account_id+'|'+cashName(t.merchant_name||t.name));
  const cardId=matched.get(t.id)||(explicitCard&&alias?.size===1?[...alias][0]:null);
  const card=!!cardId||explicitCard;
  // Cash-to-cash movements and P2P deposits are never inferred as income/bills.
  if(!card&&(t.linked_transfer_id||t.classification_kind==='transfer'||/\b(?:transfer|settlement|reimbursement|venmo|zelle|paypal)\b/.test(text)))continue;
  const paycheck=Number(t.amount)<0&&(t.income_type==='salary'||/\b(?:payroll|paycheck|salary)\b|income_wages|\bdir(?:ect)?\s+dep(?:osit)?\b/.test(text))&&!/\b(?:interest|dividend|refund|cashback)\b/.test(text);
  if(!card&&!paycheck&&(Number(t.amount)<0||/\b(?:food|dining|restaurant|grocer|shopping|travel|transport|coffee|refund|reward|cashback|bonus)\b/.test(text)))continue;
  const kind:RunwaySuggestion['kind']=card?'Card payment':paycheck?'Paycheck':'Bill';
  const target=cardId?allAccounts.get(cardId):null;
  const name=target?`${target.provider_institution_name||'Card'} · ${target.name}${target.mask?' •••• '+target.mask.slice(-4):''}`:(t.merchant_name||t.name||'').trim();const keyName=cardId?'card:'+cardId:cashName(name);
  // Generic ACH descriptions do not establish a counterparty. Never merge them.
  if(keyName.length<3||/^(?:thank you|received|bill|income|direct|bank|check|payment|payment thank you)$/.test(keyName))continue;
  const key=[user,t.account_id,currency,kind,keyName].join('|');
  const fingerprint=[key,t.date,Number(t.amount).toFixed(2)].join('|');if(fingerprints.has(fingerprint))continue;fingerprints.add(fingerprint);
  const group=groups.get(key)||{kind,name,tx:[]};group.tx.push(t);groups.set(key,group);
 }
 const out:RunwaySuggestion[]=[];
 // Common twice-monthly payroll is two calendar schedules, never a 14-day
 // approximation. Require three observations of each half before splitting.
 const streams=[...groups].flatMap(([key,g]):[string,typeof g][]=>{
  if(g.kind!=='Paycheck')return [[key,g]];
  const ordered=g.tx.slice().sort((a,b)=>a.date.localeCompare(b.date));const gaps=ordered.slice(1).map((t,i)=>gap(ordered[i].date,t.date));
  if(gaps.length&&gaps.every(n=>Math.abs(n-14)<=3)&&Math.abs(gaps.reduce((s,n)=>s+n,0)/gaps.length-14)<.75)return [[key,g]];
  const first=g.tx.filter(t=>Number(t.date.slice(8))>=12&&Number(t.date.slice(8))<=18),last=g.tx.filter(t=>Number(t.date.slice(8))>=26);
  if(first.length>=3&&last.length>=3&&first.length+last.length===g.tx.length)return [[key+'|midmonth',{...g,name:g.name+' · mid-month',tx:first}],[key+'|monthend',{...g,name:g.name+' · month-end',tx:last}]];
  return [[key,g]];
 });
 for(const [key,g] of streams){
  const tx=g.tx.sort((a,b)=>a.date.localeCompare(b.date));if(tx.length<3)continue;
  let recent=tx.slice(-8);const intervals=recent.slice(1).map((t,i)=>gap(recent[i].date,t.date));let typical=median(intervals);
  const strongBill=tx.some(t=>/bill|utilit|rent|mortgage|insurance|subscription|housing|phone|internet/i.test(t.category||''));
  let review_reason:string|undefined,estimate_note:string|undefined,monthlyAmount:number|undefined,monthlyLow:number|undefined,monthlyHigh:number|undefined,monthlyDay:number|undefined;
  let frequency:CashPlan['frequency']|null=null;
  if(intervals.every(n=>Math.abs(n-7)<=2))frequency='weekly';
  else if(intervals.every(n=>Math.abs(n-14)<=3)&&Math.abs(intervals.reduce((s,n)=>s+n,0)/intervals.length-14)<.75)frequency='biweekly';
  else for(const [f,months] of [['monthly',1],['quarterly',3],['yearly',12]] as const){if(intervals.every(n=>Math.abs(n-months*30.4375)<=Math.max(5,months*2))){frequency=f;break;}}
  // Payment days can move and months can be missing. Recognize calendar cycles
  // rather than insisting that every adjacent transaction is exactly a month.
  if(g.kind!=='Paycheck'&&!frequency){
   const months=[...new Set(tx.map(t=>t.date.slice(0,7)))].slice(-8);
   const index=(m:string)=>Number(m.slice(0,4))*12+Number(m.slice(5,7));
   const span=months.length?index(months.at(-1)!)-index(months[0])+1:0;
   if(months.length>=3&&months.length/Math.max(1,span)>=.6&&gap(tx.at(-1)!.date,today)<=65){
    recent=tx.filter(t=>months.includes(t.date.slice(0,7)));
    const totals=months.map(m=>recent.filter(t=>t.date.startsWith(m)).reduce((s,t)=>s+Math.abs(Number(t.amount)),0));
    const multi=months.some(m=>recent.filter(t=>t.date.startsWith(m)).length>1);
    const stable=Math.max(...totals)<=Math.min(...totals)*1.15;
    if(g.kind==='Card payment'||strongBill||stable){
     frequency='monthly';typical=30.4375;
     const latestDays=months.slice(-3).map(m=>Number(recent.filter(t=>t.date.startsWith(m)).at(multi?0:-1)!.date.slice(8)));
     const lastTwo=latestDays.slice(-2);monthlyDay=Math.abs(lastTwo[0]-lastTwo[1])<=5?Math.round(median(lastTwo)):Math.min(...latestDays);
     if(multi){const complete=months.map((m,i)=>({m,value:totals[i]})).filter(x=>x.m<today.slice(0,7));monthlyAmount=g.kind==='Card payment'?Math.max(complete.at(-1)?.value||0,totals.at(-1)!):median(complete.length?complete.map(x=>x.value):totals);monthlyLow=Math.min(...totals);monthlyHigh=Math.max(...totals);}
     estimate_note=multi?'Monthly payment allowance based on the full bank debits in each cycle, including extra payments. The full allowance is placed near the first observed payment day to avoid overstating cash before later payments. It is one cash forecast, not one forecast per transaction.':'Monthly pattern recognized despite changed payment dates or missing cycles.';
     review_reason='Confirm this monthly estimate and next date. Payment dates moved, cycles are missing, or more than one payment occurred in a month.';
    }
   }
  }
  if(!frequency||typical<=0)continue;
  // Monthly streams must stay near one day of month (including month-end).
  const last=recent.at(-1)!;if(frequency==='monthly'&&!review_reason&&recent.some(t=>{const d=Number(t.date.slice(8)),l=Number(last.date.slice(8));return Math.abs(d-l)>5&&!(d>=26&&l>=26);})){
   if(g.kind==='Paycheck')continue;review_reason='Confirm the next date: this recurring payment has shifted within the month.';
  }
  const amounts=recent.map(t=>Math.abs(Number(t.amount))),low=monthlyLow??Math.min(...amounts),high=monthlyHigh??Math.max(...amounts),estimate=monthlyAmount??median(amounts);
  if(g.kind==='Bill'&&!strongBill&&!options.cardChargesOnly&&high>low*1.15)continue;
  const anchor=frequency==='monthly'?recent.reduce((a,b)=>Number(a.date.slice(8))>Number(b.date.slice(8))?a:b).date:last.date;
  const monthJump=frequency==='monthly'?(Number(last.date.slice(0,4))-Number(anchor.slice(0,4)))*12+Number(last.date.slice(5,7))-Number(anchor.slice(5,7)):0;
  let next=occurrenceDate(anchor,frequency,monthJump+1);
  if(next<=addDays(today,-Math.max(5,Math.round(typical*.25)))){
   if(g.kind==='Paycheck'||frequency!=='monthly'||gap(last.date,today)>65)continue;
   review_reason='A recent expected payment has no posted match. Confirm whether it was paid or is still due; the next-cycle estimate does not include an overdue bill.';
  }
  for(let i=monthJump+2;next<=today&&i<400;i++)next=occurrenceDate(anchor,frequency,i);
  if(monthlyDay!=null){const month=last.date.slice(0,7)+'-01';for(let i=0;i<4;i++){const first=occurrenceDate(month,'monthly',i);const maxDay=Number(addDays(occurrenceDate(month,'monthly',i+1),-1).slice(8));const candidate=first.slice(0,8)+String(Math.min(monthlyDay,maxDay)).padStart(2,'0');if(candidate>today){next=candidate;break;}}}
  if(next<=today)continue;
  const card_id=key.split('|')[4].startsWith('card:')?key.split('|')[4].slice(5):undefined;
  const suggestionKey=g.kind==='Card payment'&&estimate_note?key+'|monthly-allowance':key;
  const s:RunwaySuggestion={key:suggestionKey,account_id:last.account_id!,name:g.name.slice(0,150),kind:g.kind,amount:g.kind==='Paycheck'?Math.min(...amounts):-(g.kind==='Card payment'&&monthlyAmount==null?Math.abs(Number(last.amount)):estimate),first_date:next,frequency,count:recent.length,low,high,variable:high-low>Math.max(.01,estimate*.05),evidence:recent.map(t=>t.id),last_date:last.date,blocked:null,review_reason,estimate_note,card_id};
  // Include paused/archived records: discovery must not undo a deliberate pause.
  for(const p of plans.filter(p=>p.owner_id===user&&p.account_id===s.account_id)){
   const rec=data.recurring?.find(r=>r.id===p.recurring_id),project=data.documents?.find(d=>d.id===p.project_id);
   const amount=rec?-Number(rec.expected_amount):project?-Number(project.payload.committed):Number(p.amount);
   const dates=occurrences({...p,status:'active',frequency:(rec?.frequency||p.frequency) as CashPlan['frequency'],first_date:rec?.next_expected_date||p.first_date},addDays(next,-5),addDays(next,5));
   const sameEvidence=p.discovery_evidence?.transactionIds?.some(id=>s.evidence.includes(id));
   const legacyIdentity=p.discovery_key?.split('|')[4];const sameLegacy=!!legacyIdentity&&recent.some(t=>cashName(t.merchant_name||t.name)===legacyIdentity);
   const genericCardPlan=s.kind==='Card payment'&&amount<0&&!p.discovery_key&&/\b(?:card|crd|amex|visa|mastercard)\b/i.test(p.name)&&dates.length;
   const sameCard=!!card_id&&p.discovery_key?.split('|')[4]==='card:'+card_id;
   if(p.discovery_key===s.key||sameCard||sameEvidence||sameLegacy||genericCardPlan||similar(p.name,s.name)||recent.some(t=>similar(p.name,t.merchant_name||t.name))||similar(rec?.name||project?.name||'',s.name)||(Math.sign(amount)===Math.sign(s.amount)&&Math.abs(Math.abs(amount)-Math.abs(s.amount))<=Math.max(1,Math.abs(s.amount)*.1)&&dates.length)){
    s.blocked='Already covered or potentially overlapping: '+p.name+' ('+p.status+'). Review the saved plan instead.';break;
   }
  }
  if(!s.blocked){const r=data.recurring?.find(r=>r.user_id===user&&similar(r.name,s.name)&&Math.sign(Number(r.expected_amount))===-Math.sign(s.amount));if(r)s.blocked='An existing recurring item may cover this: '+r.name+'. Link that item using the form below instead of adding a second schedule.';}
  out.push(s);
 }
 // Switching payer accounts is a review decision, not two automatic forecasts.
 for(const s of out)if(s.card_id&&out.some(other=>other!==s&&other.card_id===s.card_id&&other.account_id!==s.account_id))s.review_reason='This card has payments from more than one bank account. Confirm which payer accounts will continue; do not select a former payer just because its history exists.';
 return out.sort((a,b)=>Number(!!a.blocked)-Number(!!b.blocked)||a.first_date.localeCompare(b.first_date)||a.name.localeCompare(b.name));
}

export function discoverCardBills(data:FinanceData,user:string,currency:string,today:string){
 const cards=data.accounts.filter(a=>a.user_id===user&&a.type==='credit'&&!a.is_deleted&&!a.retained_history&&(a.currency||'USD')===currency);
 const ids=new Set(cards.map(a=>a.id));
 // Reuse recurrence detection, but never return these as bank cash suggestions.
 // They are explanatory card charges whose cash settlement is the card payment.
 const virtual:FinanceData={...data,accounts:cards.map(a=>({...a,type:'checking'})),transactions:data.transactions.filter(t=>ids.has(t.account_id||'')&&Number(t.amount)>0&&!t.linked_transfer_id&&!/credit card payment|transfer|reimbursement|settlement/i.test(t.category||'')&&!/\b(?:fee|interest)\b/i.test(t.name)),documents:[],recurring:[]};
 return discoverRunway(virtual,[],user,currency,today,{cardChargesOnly:true}).filter(s=>s.kind==='Bill').map(s=>({...s,card_id:s.account_id}));
}
