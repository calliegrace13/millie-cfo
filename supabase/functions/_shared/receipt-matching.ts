import type {Receipt} from './receipt-contract.ts';
export type MatchTransaction={id:string;date:string;amount:number;account_id?:string|null;merchant_name?:string;name?:string;pending?:boolean};
function words(value:string){return value.toLowerCase().replace(/amzn|amazon\.com/g,'amazon').replace(/[^a-z0-9]+/g,' ').trim().split(/\s+/).filter(w=>w.length>=3&&!['www','com','inc','llc','store','purchase','payment','card','online','marketplace','mktpl'].includes(w));}
export function receiptMerchantMatches(receipt:Receipt,t:MatchTransaction){if(!receipt.merchant)return false;const merchant=words(receipt.merchant),bank=words((t.merchant_name||'')+' '+(t.name||''));return merchant.length>0&&merchant.every(w=>bank.includes(w));}
export function receiptMatches<T extends MatchTransaction>(receipts:Receipt[],transactions:T[],accounts:{id:string;currency?:string}[]){
 // A repeated source row must never manufacture a second candidate. Different
 // bank IDs are kept even when the date, merchant and amount are identical.
 const seen=new Set<string>(),distinct=transactions.filter(t=>!seen.has(t.id)&&!!seen.add(t.id));
 const candidates=receipts.map(r=>distinct.filter(t=>{const days=(Date.parse(t.date)-Date.parse(r.date))/86400000;return !t.pending&&t.amount>0&&Math.round(t.amount*100)===Math.round(r.amount*100)&&accounts.find(a=>a.id===t.account_id)?.currency===r.currency&&days>=-1&&days<=10;}).sort((a,b)=>Math.abs(Date.parse(a.date)-Date.parse(r.date))-Math.abs(Date.parse(b.date)-Date.parse(r.date))||a.id.localeCompare(b.id)));
 return receipts.map((r,i)=>{const merchantCandidates=candidates[i].filter(t=>receiptMerchantMatches(r,t)),ids=merchantCandidates.map(t=>t.id),overlap=ids.some(id=>candidates.some((list,j)=>j!==i&&list.some(t=>t.id===id)));const cats=[...new Set(r.items.map(x=>x.category))];return {receipt:r,candidates:merchantCandidates.length?merchantCandidates:candidates[i],matchBasis:merchantCandidates.length?'merchant' as const:'amount_date' as const,competingReceipt:overlap,category:cats.length===1&&cats[0]!=='Other'?cats[0]:null,unique:ids.length===1&&!overlap};});
}
export function trustedReceiptChoices<T extends MatchTransaction>(receipts:Receipt[],transactions:T[],accounts:{id:string;currency?:string}[],categories:string[]){
 return receiptMatches(receipts,transactions,accounts)
  .filter(m=>m.unique&&m.category&&categories.includes(m.category))
  .map(m=>({id:m.candidates[0].id,category:m.category!}));
}
