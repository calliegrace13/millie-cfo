import {classify,merchantKey} from './transaction-classifier.ts';
export const movementCategories=['Income','Transfer','Credit Card Payment','Debt Payment','Reimbursement','Settlement','Other','Uncategorized'];
export function routineEligible(t:any,a:any,decision=classify(t,a)){
 return !!a&&Number(t.amount)>0&&!t.pending&&t.needs_review&&!t.classification_locked&&!['user','rule'].includes(t.classification_source)&&!t.linked_transfer_id&&!t.is_transfer_exception&&!t.is_one_time_expense&&!t.is_amortized&&!t.is_non_gaap_adjustment&&!t.recognition_date&&!/\b(payment|pymt|pmt|autopay|transfer|xfer|payroll|salary|paycheck|refund|return|reversal|chargeback)\b/i.test(t.name||'')&&!['INCOME','LOAN_PAYMENTS','TRANSFER_IN','TRANSFER_OUT'].includes(t.provider_metadata?.primary)&&! /^(INCOME|LOAN_PAYMENTS|TRANSFER_IN|TRANSFER_OUT)/.test(t.subcategory||'')&&!['income','transfer','card_payment','debt_payment','unknown'].includes(decision.kind)&&!movementCategories.includes(t.category||'');
}
export function merchantGroups(transactions:any[],accounts:any[]){
 const byAccount=new Map(accounts.map(a=>[a.id,a]));const groups=new Map<string,any>();
 for(const t of transactions){const a=byAccount.get(t.account_id),d=classify(t,a),key=merchantKey(t);
  // Category may be missing or wrong: identity plus spending semantics matters.
  const candidate=routineEligible({...t,category:!t.category||['Other','Uncategorized'].includes(t.category)?'':t.category},a,d);
  if(!key||!candidate)continue;
  const currency=a.currency||'USD',id=key+'|'+currency;
  if(!groups.has(id))groups.set(id,{id,key,currency,label:key==='service:uber-eats'?'Uber Eats':key==='service:uber-rides'?'Uber rides':t.merchant_name||key.replace(/^merchant:/,'').replace(/^entity:/,''),transactions:[],categories:new Map<string,number>()});
  const g=groups.get(id);g.transactions.push(t);if(!movementCategories.includes(d.category))g.categories.set(d.category,(g.categories.get(d.category)||0)+1);
 }
 return [...groups.values()].filter(g=>g.transactions.length>=2).map(g=>{
  const amounts=g.transactions.map((t:any)=>Number(t.amount)).sort((a:number,b:number)=>a-b),median=amounts[Math.floor(amounts.length/2)];
  const ranked=[...g.categories.entries()].sort((a:any,b:any)=>b[1]-a[1]);
  return {...g,category:ranked[0]?.[0]||'',mixed:ranked.length>1,count:amounts.length,max_amount:Math.round(median*3*100)/100,median,samples:[...g.transactions].sort((a:any,b:any)=>Number(b.amount)-Number(a.amount)).slice(0,3)};
 }).sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label));
}
