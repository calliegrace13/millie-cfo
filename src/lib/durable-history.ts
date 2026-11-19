import type {FinanceData,ReportOptions} from './household-finance';
import {analyticalReport} from './household-finance';
export type Continuity={id:string;owner_id:string;original_id:string;source_id:string;starts_on:string};
export function retainAvailable(live:FinanceData,archives:{payload:any;created_at:string}[]):FinanceData{
 const result=structuredClone(live);const coverage=new Map<string,string>();const keys=['accounts','transactions','allocations','categorySplits','observations','schedules','offsets','sharing','accountingPlans'] as const;
 for(const archive of [...archives].sort((a,b)=>b.created_at.localeCompare(a.created_at))){const p=archive.payload;
  const missing=new Set((p.accounts||[]).filter((a:any)=>!live.accounts.some(x=>x.id===a.id)).map((a:any)=>a.id));
  for(const key of keys){const target=((result as any)[key]||=[]) as any[];for(const row of p[key]||[]){const related=key==='schedules'?(p.transactions||[]).find((t:any)=>t.id===row.transaction_id)?.account_id:key==='offsets'?(p.transactions||[]).find((t:any)=>t.id===row.parent_transaction_id)?.account_id:row.account_id;const narrowed=(key==='transactions'||key==='accountingPlans')&&live.sharing.some(s=>s.account_id===row.account_id&&s.enabled&&s.history_from&&(key==='accountingPlans'?row.start_date:row.date)<s.history_from);if(!missing.has(key==='accounts'?row.id:related)&&!narrowed)continue;const accountId=key==='accounts'?row.id:related;const newerFrom=coverage.get(accountId);if(newerFrom&&!(key==='transactions'&&row.date<newerFrom))continue;if(!target.some(x=>key==='sharing'?x.account_id===row.account_id:x.id===row.id))target.push(key==='accounts'?{...row,is_deleted:true,retained_history:true}:row);}}
  for(const a of p.accounts||[])coverage.set(a.id,coverage.has(a.id)?(coverage.get(a.id)!<(p.historyFrom||'0001-01-01')?coverage.get(a.id)!:(p.historyFrom||'0001-01-01')):(p.historyFrom||'0001-01-01'));
 }
 return result;
}
export function applyContinuity(data:FinanceData,links:Continuity[],today=new Date().toISOString().slice(0,10)):FinanceData{
 const result=structuredClone(data);const sources=new Set(links.map(x=>x.source_id));
 const map=new Map<string,{root:string;start:string;end:string}>();
 for(const root of new Set(links.map(x=>x.original_id))){if(!data.accounts.some(a=>a.id===root))continue;const chain=links.filter(x=>x.original_id===root&&data.accounts.some(a=>a.id===x.source_id)).sort((a,b)=>a.starts_on.localeCompare(b.starts_on));
 if(!chain.length)continue;map.set(root,{root,start:'0001-01-01',end:chain[0].starts_on});chain.forEach((x,i)=>map.set(x.source_id,{root,start:x.starts_on,end:chain[i+1]?.starts_on||'9999-12-31'}));
 const latest=chain.filter(x=>x.starts_on<=today).at(-1);if(latest){const old=result.accounts.find(a=>a.id===root)!;const current=data.accounts.find(a=>a.id===latest.source_id)!;Object.assign(old,{current_balance:current.current_balance,available_balance:current.available_balance,is_deleted:current.is_deleted,is_zero_balance:current.is_zero_balance,name:current.name,provider_institution_id:current.provider_institution_id,provider_institution_name:current.provider_institution_name});}
 }
 result.accounts=result.accounts.filter(a=>!sources.has(a.id)||!map.has(a.id));
 result.transactions=result.transactions.flatMap(t=>{const m=map.get(t.account_id||'');return !m?[t]:t.date>=m.start&&t.date<m.end?[{...t,account_id:m.root}]:[];});
 result.accountingPlans=(result.accountingPlans||[]).map(p=>({...p,account_id:map.get(p.account_id)?.root||p.account_id}));
 result.observations=(result.observations||[]).flatMap(o=>{const m=map.get(o.account_id);return !m?[o]:o.observed_on>=m.start&&o.observed_on<m.end?[{...o,account_id:m.root}]:[];});
 result.allocations=result.allocations.filter(r=>!sources.has(r.account_id));result.categorySplits=(result.categorySplits||[]).filter(r=>!sources.has(r.account_id));
 return result;
}
export function closeBounds(date:string,cadence:string){const d=new Date(date+'T12:00:00Z');if(!Number.isFinite(+d))throw Error('Choose a valid date');let start:string,end:string;
 if(cadence==='week'){d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));start=d.toISOString().slice(0,10);d.setUTCDate(d.getUTCDate()+6);end=d.toISOString().slice(0,10);}else{const y=d.getUTCFullYear(),m=cadence==='quarter'?Math.floor(d.getUTCMonth()/3)*3:d.getUTCMonth();start=new Date(Date.UTC(y,m,1)).toISOString().slice(0,10);end=new Date(Date.UTC(y,m+(cadence==='quarter'?3:1),0)).toISOString().slice(0,10);}return {start,end};}
export function restatedClose(snapshot:FinanceData,current:FinanceData,options:ReportOptions){
 // Retain only accounts whose source access has ended. Missing transactions on accessible
 // accounts remain removed; bank corrections must not be resurrected from a close.
 const data=retainAvailable(current,[{payload:snapshot,created_at:''}]);data.budgets=[...current.budgets,...snapshot.budgets.filter(b=>b.owner_id!==options.userId&&!current.budgets.some(x=>x.id===b.id))];return analyticalReport(data,options);
}
