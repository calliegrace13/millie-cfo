import type {Trip,TripLink} from '@/hooks/useTrips';
import type {Transaction,Account} from './types';
import {expenseWeight,isInternal,type FinanceData} from './household-finance';
export function tripPurchase(t:Transaction,accounts:Account[]){const a=accounts.find(a=>a.id===t.account_id);return !!a&&t.amount>0&&!t.pending&&!isInternal(t)&&!['income','salary','investment','investments','debt payment'].includes((t.category||'').toLowerCase())&&!['transfer','card_payment','income','investment','debt_principal','debt_payment'].includes(t.classification_kind||'')&&!['investment','loan'].includes(a.type);}
export function tripDateCandidates(t:Transaction,trips:Trip[]){return trips.filter(p=>!p.archived&&p.auto_dates&&t.date>=p.starts_on&&t.date<=p.ends_on&&(!p.account_ids.length||p.account_ids.includes(t.account_id||'')));}
export function tripCosts(data:FinanceData,links:TripLink[],tripId:string,userId:string){
 const linked=new Set(links.filter(l=>l.trip_id===tripId&&!l.excluded).map(l=>l.transaction_id));
 const childIds=new Set((data.offsets||[]).filter(o=>linked.has(o.parent_transaction_id)).map(o=>o.offset_transaction_id));
 const totals:Record<string,{full:number;mine:number}>={};
 const rows=data.transactions.filter(t=>linked.has(t.id)||childIds.has(t.id)).flatMap(t=>{
  const a=data.accounts.find(a=>a.id===t.account_id);if(!a||t.pending||data.sharing.some(s=>s.account_id===a.id&&s.duplicate_of))return [];
  const refund=childIds.has(t.id)&&t.amount<0;
  if(!refund&&!tripPurchase(t,data.accounts))return [];
  const currency=a.currency||'USD',weight=expenseWeight(t,a,data,{userId,partnerId:null,linkId:null,view:'mine',basis:'recorded',currency,start:t.date,end:t.date});
  const cents=Math.round(Number(t.amount)*100),myCents=Math.round(Number(t.amount)*weight*100);
  const total=totals[currency]||={full:0,mine:0};total.full+=cents/100;total.mine+=myCents/100;
  return [{transaction:t,account:a,refund,weight,mine:myCents/100}];
 });
 return {totals,rows,unavailable:[...linked].filter(id=>!rows.some(r=>r.transaction.id===id))};
}
