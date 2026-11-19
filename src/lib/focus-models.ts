export function watchlistAnalysis(payload:any,transactions:any[],accounts:any[],month:string){
 const today=new Date().toLocaleDateString('en-CA'),end=month===today.slice(0,7)?today:month+'-31';
 const rows=transactions.filter(t=>!t.pending&&t.date.startsWith(month)&&t.date<=end&&accounts.find(a=>a.id===t.account_id)?.currency===payload.currency&&!t.linked_transfer_id&&!['transfer','card_payment','income'].includes(t.classification_kind)&&!['Transfer','Credit Card Payment','Debt Payment','Income','Salary'].includes(t.category)&&
 (payload.field==='category'?t.category===payload.value:(t.merchant_name||t.name||'').toLowerCase().includes(payload.value.toLowerCase())));
 const spending=Math.round(rows.reduce((n,t)=>n+t.amount,0)*100)/100;
 return {rows,spending,remaining:Number(payload.target)-spending};
}
export function recoveryAnalysis(payload:any,transactions:any[]){
 const ids: string[]=payload.receivedIds||[],live=new Map(transactions.map(t=>[t.id,t]));
 const round=(n:number)=>Math.round((n+Number.EPSILON)*100)/100;
 const received=round(ids.reduce((n,id)=>{const t=live.get(id)||(payload.receivedSnapshots||[]).find((s:any)=>s.id===id);return n+(t?-Number(t.amount):0);},0)),expected=round(Number(payload.expected)),outstanding=Math.max(0,round(expected-received));
 return {received,outstanding,excess:Math.max(0,round(received-expected)),missing:ids.filter(id=>!live.has(id)),expense:live.get(payload.expenseId)||payload.expenseSnapshot};
}
