import {receiptMatches,type MatchTransaction} from '../../supabase/functions/_shared/receipt-matching';
import type {Receipt} from '../../supabase/functions/_shared/receipt-contract';

// Context evidence links do not grant permission to recategorize transactions.
export function contextReceiptMatches<T extends MatchTransaction>(receipts:Receipt[],transactions:T[],accounts:{id:string;currency?:string}[]){
 const matches=receiptMatches(receipts,transactions,accounts).map(m=>{
  const sameDay=m.candidates.filter(t=>t.date===m.receipt.date);
  return {...m,candidates:sameDay.length?sameDay:m.candidates,sameDay:sameDay.length>0};
 });
 return matches.map((m,i)=>{
  const competingReceipt=m.candidates.some(t=>matches.some((other,j)=>j!==i&&other.candidates.some(o=>o.id===t.id)&&(other.sameDay||!m.sameDay)));
  return {...m,competingReceipt,unique:m.candidates.length===1&&!competingReceipt,linkRule:m.sameDay?'same_day' as const:'single_candidate' as const};
 });
}

export function contextEvidenceQueue<T extends {archived:boolean;transaction_ids:string[];title:string;notes:string;kind:string}>(records:T[],filter='review',search=''){
 const query=search.toLowerCase();
 return records.filter(r=>(filter==='archived'?r.archived:!r.archived)&&
  (filter!=='review'||r.transaction_ids.length===0)&&(filter!=='linked'||r.transaction_ids.length>0)&&
  (!query||(r.title+' '+r.notes+' '+r.kind).toLowerCase().includes(query)));
}
