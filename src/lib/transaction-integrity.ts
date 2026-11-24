// These are review candidates, never an instruction to remove financial data.
export function similarTransactionGroups<T extends {id:string;account_id?:string|null;date:string;amount:number;name:string;pending?:boolean}>(transactions:T[]) {
 const groups=new Map<string,T[]>(),seen=new Set<string>();
 for(const t of transactions){
  if(t.pending||!t.account_id||seen.has(t.id))continue;
  seen.add(t.id);
  const key=JSON.stringify([t.account_id,t.date,Math.round(Number(t.amount)*100),t.name.trim().toLowerCase()]);
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key)!.push(t);
 }
 return [...groups.values()].filter(g=>g.length>1).sort((a,b)=>b[0].date.localeCompare(a[0].date)||a[0].id.localeCompare(b[0].id));
}
