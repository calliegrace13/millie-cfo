export type AccountingPlan={is_void?:boolean;id:string;owner_id:string;account_id:string;name:string;kind:'service'|'lease'|'asset'|'deposit'|'loan'|'deferred_income';category:string;total_amount:number;residual_value:number;start_date:string;end_date:string;opening_settled:number;stop_date?:string|null;balance_account_id?:string|null;opening_escrow?:number;escrow_charges?:{date:string;amount:number;category:string}[];payments:{transaction_id:string;interest:number;escrow?:number}[];disposal_date?:string|null;disposal_transaction_id?:string|null;updated_at?:string};
const cents=(x:number)=>Math.round((x+Number.EPSILON)*100)/100;
const previous=(date:string)=>new Date(Date.parse(date+'T12:00:00Z')-86400000).toISOString().slice(0,10);
export function planMonths(p:AccountingPlan){if(!/^\d{4}-\d{2}-\d{2}$/.test(p.start_date)||!/^\d{4}-\d{2}-\d{2}$/.test(p.end_date)||p.end_date<p.start_date)return [];const out:{start:string;end:string;weight:number}[]=[];for(let m=p.start_date.slice(0,7)+'-01';m<=p.end_date&&out.length<1200;){const y=Number(m.slice(0,4)),n=Number(m.slice(5,7)),last=new Date(Date.UTC(y,n,0)).toISOString().slice(0,10);const start=m<p.start_date?p.start_date:m,end=last>p.end_date?p.end_date:last;out.push({start,end,weight:(Date.parse(end)-Date.parse(start)+86400000)/(Number(last.slice(8))*86400000)});m=new Date(Date.UTC(y,n,1)).toISOString().slice(0,10);}return out;}
export function earnedThrough(p:AccountingPlan,date:string){if(date<p.start_date||['deposit','loan'].includes(p.kind))return 0;const capped=p.stop_date&&date>p.stop_date?p.stop_date:date;const stop=p.disposal_date&&capped>p.disposal_date?p.disposal_date:capped;const months=planMonths(p),full=months.reduce((s,m)=>s+m.weight,0);let elapsed=0;for(const m of months){if(stop<m.start)continue;const end=stop<m.end?stop:m.end;elapsed+=m.weight*(Date.parse(end)-Date.parse(m.start)+86400000)/(Date.parse(m.end)-Date.parse(m.start)+86400000);}const amount=Number(p.total_amount)-(p.kind==='asset'?Number(p.residual_value):0);return cents(amount*Math.min(1,elapsed/(full||1)));}
export function planEntries(p:AccountingPlan,start:string,end:string){return planMonths(p).flatMap(m=>{const a=m.start>start?m.start:start,b=m.end<end?m.end:end;if(a>b)return [];const amount=cents(earnedThrough(p,b)-earnedThrough(p,previous(a)));return amount?[{date:b,amount}]:[];});}
export function planState(p:AccountingPlan,transactions:any[],date:string){
 const payments=p.payments.map(l=>({link:l,tx:transactions.find(t=>t.id===l.transaction_id&&!t.pending)}));const missing=payments.filter(x=>!x.tx).length+(p.disposal_transaction_id&&!transactions.some(t=>t.id===p.disposal_transaction_id&&!t.pending)?1:0);
 const incoming=p.kind==='deferred_income';const posted=payments.filter(x=>x.tx&&x.tx.date<=date);
 const paid=cents((date>=p.start_date?Number(p.opening_settled):0)+posted.reduce((s,x)=>s+Number(x.tx.amount)*(incoming?-1:1),0));
 const escrow=cents((date>=p.start_date?Number(p.opening_escrow||0):0)+posted.reduce((s,x)=>s+Number(x.link.escrow||0),0)-(p.escrow_charges||[]).filter(x=>x.date<=date).reduce((s,x)=>s+Number(x.amount),0));
 const escrowPaid=posted.reduce((s,x)=>s+Number(x.link.escrow||0),0);
 const interest=cents(posted.reduce((s,x)=>s+Number(x.link.interest||0),0)),earned=earnedThrough(p,date),total=date>=p.start_date?Number(p.total_amount):0;
 const canceled=!!p.stop_date&&date>=p.stop_date;let asset=0,liability=0,commitment=0;
 if(p.kind==='service'){asset=Math.max(0,paid-earned);liability=Math.max(0,earned-paid);commitment=canceled?0:Math.max(0,total-earned);}
 if(p.kind==='lease'){asset=canceled?Math.max(0,paid-earned):Math.max(0,total-earned)+Math.max(0,paid-total);liability=Math.max(0,(canceled?earned:total)-paid);commitment=canceled?0:Math.max(0,total-earned);}
 if(p.kind==='asset'){asset=Math.max(0,total-earned)+Math.max(0,paid-total);liability=Math.max(0,total-paid);}
 if(p.kind==='deposit')asset=Math.max(0,paid);
 if(p.kind==='loan'){liability=Math.max(0,total-paid+interest+escrowPaid);asset=Math.max(0,paid-interest-escrowPaid-total)+Math.max(0,escrow);}
 if(p.kind==='deferred_income'){liability=Math.max(0,paid-earned);asset=Math.max(0,earned-paid);commitment=canceled?0:Math.max(0,total-earned);}
 if(p.disposal_date&&date>=p.disposal_date&&['asset','deposit'].includes(p.kind))asset=0;
 return {paid,earned,interest,escrow,asset:cents(asset),liability:cents(liability),commitment:cents(commitment),missing,overpaid:p.kind==='deposit'?paid<0:p.kind==='loan'?(paid-interest-escrowPaid>Number(p.total_amount)||escrow<0):paid>Number(p.total_amount)};
}

export function disposalExpense(p:AccountingPlan,transactions:any[]){if(!p.disposal_date)return 0;const before=planState({...p,disposal_date:null},transactions,p.disposal_date);const sale=transactions.find(t=>t.id===p.disposal_transaction_id&&!t.pending);return cents(before.asset-(sale?Math.max(0,-Number(sale.amount)):0));}
