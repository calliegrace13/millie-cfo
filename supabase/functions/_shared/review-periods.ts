// Shared by the review UI and authenticated classification service.
export function closedForReview(t:any,documents:any[],owner:string):boolean {
 if(t.user_id!==owner)return false;
 return documents.some(d=>{
  if(d.kind!=='close'||d.owner_id!==owner)return false;
  const p=d.payload||{},s=p.reviewScope;
  if(s?.version===1)return s.ownerId===owner&&t.date>=s.start&&t.date<=s.end&&s.accountIds.includes(t.account_id);
  // Older report closes only attest to contributing records, not all source rows
  // stored in their broad recovery snapshot. Never suppress unrelated accounts.
  return p.options?.basis!=='proforma'&&(p.lines||[]).some((l:any)=>l.id===t.id);
 });
}
export function quarterBounds(date:string){const y=Number(date.slice(0,4)),m=Math.floor((Number(date.slice(5,7))-1)/3)*3;return {start:`${y}-${String(m+1).padStart(2,'0')}-01`,end:new Date(Date.UTC(y,m+3,0)).toISOString().slice(0,10),label:`Q${m/3+1} ${y}`};}
export function reviewQuarters(transactions:any[],documents:any[],owner:string){
 const groups=new Map<string,any>();
 for(const t of transactions){if(t.user_id!==owner||t.pending)continue;const b=quarterBounds(t.date);if(!groups.has(b.start))groups.set(b.start,{...b,total:0,open:0,remaining:0});const q=groups.get(b.start);q.total++;if(!closedForReview(t,documents,owner)){q.open++;if(t.needs_review)q.remaining++;}}
 return [...groups.values()].sort((a,b)=>a.start.localeCompare(b.start));
}
