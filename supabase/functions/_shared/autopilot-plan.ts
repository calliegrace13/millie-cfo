import {policyDecision} from './learning-policy.ts';
import {closedForReview,quarterBounds} from './review-periods.ts';
import {receiptEligible} from './receipt-eligibility.ts';
import {groupedAnswerSteps} from './grouped-answer-plan.ts';
export const timingCandidate=(t:any)=>/insurance|annual|tuition|deposit|furniture|computer|laptop|appliance|mattress|airline|flight|hotel|subscription/i.test((t.merchant_name||'')+' '+t.name);
export type AutoStep={kind:string;module:string;task:string;transactionIds?:string[];receiptIds?:string[];start?:string;end?:string;questionIds?:string[];answerId?:string;answerRevision?:number;answerItems?:{id:string;revision:number}[];note?:string;signature:unknown;policySignatures?:Record<string,unknown>};
export function autopilotPlan(x:any){
 const {owner,accounts,transactions,documents,plans,sharing,continuity,offsets,policies,modules,work,items,emails,connection,now}=x;
 const enabled=(module:string,task:string)=>{const p=policies.find((p:any)=>p.module===module);return (module==='transactions'||modules.includes(module))&&p?.mode==='ai'&&p.tasks.includes(task);};
 const available=transactions.filter((t:any)=>t.user_id===owner&&!t.pending&&!sharing.some((s:any)=>s.account_id===t.account_id&&s.duplicate_of)&&!continuity.some((c:any)=>(c.source_id===t.account_id&&t.date<c.starts_on)||(c.original_id===t.account_id&&t.date>=c.starts_on)));
 const blocked=new Set([...offsets.flatMap((o:any)=>[o.parent_transaction_id,o.offset_transaction_id]),...plans.filter((p:any)=>!p.is_void).flatMap((p:any)=>[...(p.payments||[]).map((l:any)=>l.transaction_id),p.disposal_transaction_id])]);
 const eligible=available.filter((t:any)=>!blocked.has(t.id)&&!closedForReview(t,documents,owner)&&receiptEligible(t,accounts.find((a:any)=>a.id===t.account_id))).sort((a:any,b:any)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
 const learned=x.learningPolicies||[];
 const stamp=(id:string)=>{const t=available.find((t:any)=>t.id===id);return t?policyDecision(learned,{...t,currency:accounts.find((a:any)=>a.id===t.account_id)?.currency||'USD'},'assets').signature:[];};
 const attention:any[]=[];const options:AutoStep[]=[];
 if(!accounts.some((a:any)=>!a.is_deleted))attention.push({title:'Connect an account or import a statement',href:'/accounts'});
 const evidence=(rows:any[])=>rows.map(t=>[t.id,t.updated_at,t.category,t.amount,t.date,t.account_id]);
 const touched=(kind:string,id:string)=>work.some((w:any)=>w.kind===kind&&(w.status==='done'||w.status==='skipped'&&w.result?.manualSkip)&&w.payload?.transactionIds?.includes(id)&&JSON.stringify(w.payload?.policySignatures?.[id]||[])===JSON.stringify(stamp(id)));
 const questionFor=(id:string)=>items.some((i:any)=>['needs_input','ready'].includes(i.status)&&i.payload?.transaction_id===id);
 options.push(...groupedAnswerSteps(x,enabled));
 if(enabled('transactions','receipts')){
  const seen=new Set(work.filter((w:any)=>w.kind==='receipts'&&(w.status==='done'||w.status==='skipped'&&w.result?.manualSkip)).flatMap((w:any)=>w.payload.receiptIds||[]));
  const pending=emails.filter((e:any)=>!seen.has(e.id)).sort((a:any,b:any)=>a.sent_at.localeCompare(b.sent_at)||a.id.localeCompare(b.id)).slice(0,10);
  if(pending.length)options.push({kind:'receipts',module:'transactions',task:'receipts',receiptIds:pending.map((e:any)=>e.id),signature:pending.map((e:any)=>[e.id,e.created_at])});
  if(connection?.auto_sync&&(connection.sync_cursor||!connection.last_synced_at||now-Date.parse(connection.last_synced_at)>15*60000))options.push({kind:'sync',module:'transactions',task:'receipts',signature:[connection.last_synced_at,connection.sync_cursor]});
  if(!connection)attention.push({title:'Connect Gmail or import receipt files when useful',href:'/receipts',optional:true});
 }
 const candidates=(kind:string)=>eligible.filter((t:any)=>!questionFor(t.id)&&!touched(kind,t.id));
 const make=(kind:string,module:string,task:string,rows:any[])=>{const first=rows[0];if(!first)return;const quarter=quarterBounds(first.date),batch=rows.filter((t:any)=>t.date>=quarter.start&&t.date<=quarter.end).slice(0,20);options.push({kind,module,task,start:quarter.start,end:quarter.end,transactionIds:batch.map((t:any)=>t.id),policySignatures:Object.fromEntries(batch.map((t:any)=>[t.id,stamp(t.id)])),signature:evidence(batch)});};
 if(enabled('assets','timing'))make('timing','assets','timing',candidates('timing').filter((t:any)=>timingCandidate(t)||policyDecision(learned,{...t,currency:accounts.find((a:any)=>a.id===t.account_id)?.currency||'USD'},'assets').matches.some(p=>['spread_service','asset_review','refundable_deposit'].includes(p.effect))));
 if(enabled('transactions','categories'))make('categories','transactions','categories',candidates('categories').filter((t:any)=>{const d=policyDecision(learned,{...t,currency:accounts.find((a:any)=>a.id===t.account_id)?.currency||'USD'},'transactions');if(['spread_service','asset_review','refundable_deposit'].includes(d.effect||'')){if(!enabled('assets','timing'))attention.push({title:'A policy needs a timing decision. Open Assets and obligations or enable its AI task.',href:'/asset-register'});return false;}return true;}));
 else if(eligible.length)attention.push({title:'Allow expense categorization to work through unreviewed purchases',href:'/customize#mode-transactions'});
 const open=available.filter((t:any)=>!closedForReview(t,documents,owner)).sort((a:any,b:any)=>a.date.localeCompare(b.date));
 if(enabled('close','review')&&open.length){const quarter=quarterBounds(open[0].date),rows=open.filter((t:any)=>t.date<=quarter.end);options.push({kind:'close',module:'close',task:'review',start:quarter.start,end:quarter.end,signature:[evidence(rows),plans.map((p:any)=>[p.id,p.revision,p.updated_at]),documents.filter((d:any)=>d.kind==='close').map((d:any)=>[d.id,d.updated_at])]});}
 // Only already-enabled AI modules get setup proposals; manual modules stay manual.
 for(const [module,task] of Object.entries({everyday:'budget',runway:'review',goals:'plan',household:'review',income:'review',debt:'review',investments:'review',longterm:'review'})){
  if(!x.setupMissing?.[module]||!enabled(module,task)||work.some((w:any)=>w.kind==='setup'&&w.payload.module===module&&['done','skipped'].includes(w.status))||items.some((i:any)=>i.module===module&&['needs_input','ready'].includes(i.status)))continue;
  const quarter=quarterBounds(available.map((t:any)=>t.date).sort().at(-1)||new Date(now).toISOString().slice(0,10));options.push({kind:'setup',module,task,start:quarter.start,end:quarter.end,signature:[module,accounts.map((a:any)=>a.id)]});
 }
 // Answers unblock previously uncertain work. Receipts establish facts before
 // classification; material timing issues precede routine categories and close.
 const rank:Record<string,number>={answer:100,receipts:90,sync:85,timing:80,categories:70,close:60,setup:50};
 options.sort((a,b)=>(rank[b.kind]||0)-(rank[a.kind]||0));
 return {options,attention,eligible,available};
}
