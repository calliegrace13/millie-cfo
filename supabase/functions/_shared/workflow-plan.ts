import {autopilotPlan} from './autopilot-plan.ts';
import {ASSISTANT_TASKS} from './assistant-tasks.ts';
import {quarterBounds} from './review-periods.ts';
import {matchingAnswerMemories} from './answer-context.ts';

// Legacy opt-ins retain their original task scope. The expanded workflow is an
// explicit new opt-in and never retries a failed request behind the user's back.
export function workflowPlan(x:any){
 if(x.workflowScope!=='all_enabled')return autopilotPlan(x);
 const failed=x.work.filter((w:any)=>w.status==='failed');
 const blockedTx=new Set(failed.flatMap((w:any)=>w.payload?.transactionIds||[]));
 const blockedReceipts=new Set(failed.flatMap((w:any)=>w.payload?.receiptIds||[]));
 const blockedAnswers=new Set(failed.flatMap((w:any)=>[w.payload?.answerId,...(w.payload?.answerItems||[]).map((a:any)=>a.id)]).filter(Boolean));
 const core=autopilotPlan({...x,transactions:x.transactions.filter((t:any)=>!blockedTx.has(t.id)),emails:x.emails.filter((e:any)=>!blockedReceipts.has(e.id))});
 core.eligible=core.eligible.filter((t:any)=>!blockedTx.has(t.id));
 core.options=core.options.filter(o=>o.kind!=='setup'&&!blockedAnswers.has(o.answerId)&&!o.answerItems?.some(a=>blockedAnswers.has(a.id))&&
  !(o.kind==='close'&&failed.some((w:any)=>w.payload?.module===o.module&&w.payload?.task===o.task)));
 const available=autopilotPlan(x).available;
 const latest=available.map((t:any)=>t.date).sort().at(-1);
 if(latest){
  const scope=quarterBounds(latest);
  const evidence=available.filter((t:any)=>t.date>=scope.start&&t.date<=scope.end).sort((a:any,b:any)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id)).slice(-200).map((t:any)=>[t.id,t.updated_at,t.amount,t.category]);
  const stamps=(rows:any[]=[])=>rows.map(r=>[r.id,r.revision,r.updated_at]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])));
  for(const task of ASSISTANT_TASKS){
   if(task.module==='assets'||task.module==='close'||task.module==='transactions'&&task.id!=='patterns')continue;
   const p=x.policies.find((p:any)=>p.module===task.module);
   if(task.module!=='transactions'&&!x.modules.includes(task.module)||p?.mode!=='ai'||!p.tasks.includes(task.id))continue;
   if(failed.some((w:any)=>w.payload?.module===task.module&&w.payload?.task===task.id))continue;
   const signature={version:1,module:task.module,task:task.id,scope,evidence,
    documents:stamps(x.documents),plans:stamps(x.plans),budgets:stamps(x.budgets),cash:stamps(x.cashSettings),records:stamps(x.moduleRecords),context:stamps(x.contextRecords),trips:stamps(x.trips)};
   core.options.push({kind:'review',module:task.module,task:task.id,start:scope.start,end:scope.end,signature});
  }
 }
 if(x.reconciliationEnabled){
  const seen=new Set<string>();
  for(const q of [...x.items].reverse()){
   const id=q.payload?.transaction_id,key=q.module+':'+q.task+':'+id;if(q.status!=='needs_input'||q.answer||!id||seen.has(key)||!((q.module==='transactions'&&q.task==='categories')||(q.module==='assets'&&q.task==='timing'))||blockedTx.has(id))continue;
   const t=core.eligible.find((t:any)=>t.id===id);if(!t)continue;
   const p=x.policies.find((p:any)=>p.module===q.module);if(p?.mode!=='ai'||!p.tasks.includes(q.task))continue;
   const records=(x.contextRecords||[]).filter((r:any)=>!r.archived&&r.transaction_ids?.includes(id));
   // Date-window membership is handled for free. It does not answer what an
   // unrelated purchase bought, so it must not trigger a paid recheck by itself.
   const links=(x.tripLinks||[]).filter((l:any)=>l.transaction_id===id&&!l.excluded&&l.trip_id&&(l.source==='receipt'||l.manual===true));
   const words=String(t.merchant_name||t.name||'').toLowerCase().match(/[a-z]{4,}/g)||[];
   const calendar=(x.calendarEvents||[]).filter((e:any)=>e.payload.starts_on<=t.date&&e.payload.ends_on>=t.date&&words.some((word:string)=>!['payment','purchase','online','hotel','flight','reservation'].includes(word)&&String(e.payload.title+' '+e.payload.location).toLowerCase().includes(word)));
   const memories=x.automaticAnswerMemory?matchingAnswerMemories(x.answerMemories||[],{...t,currency:x.accounts.find((a:any)=>a.id===t.account_id)?.currency||'USD'},x.owner,q.module):[];
   if(!records.length&&!links.length&&!calendar.length&&!memories.length)continue;seen.add(key);
   const scope=quarterBounds(t.date);
   const stable=(rows:any[])=>rows.sort((a,b)=>String(a[0]).localeCompare(String(b[0])));
   const evidence={calendar:stable(calendar.map((e:any)=>[e.event_id,e.updated_at])),records:stable(records.map((r:any)=>[r.id,r.revision])),trips:stable(links.map((l:any)=>[l.trip_id,l.revision,(x.trips||[]).find((t:any)=>t.id===l.trip_id)?.revision])),memories:stable(memories.map((m:any)=>[m.id,m.revision]))};
   // A replacement question is not new evidence. Reuse this guard across model
   // changes and older checkpoints so unanswered questions cannot spend in a loop.
   const sameEvidence=(s:any)=>!!s&&JSON.stringify({calendar:stable([...(s.calendar||[])]),records:stable([...(s.records||[])]),trips:stable([...(s.trips||[])]),memories:stable([...(s.memories||[])])})===JSON.stringify(evidence);
   if(x.work.some((w:any)=>w.kind==='resolve'&&(w.status==='done'||w.status==='skipped'&&w.result?.manualSkip)&&w.payload?.module===q.module&&w.payload?.task===q.task&&w.payload?.transactionIds?.includes(id)&&sameEvidence(w.payload.signature)))continue;
   core.options.push({kind:'resolve',module:q.module,task:q.task,transactionIds:[id],questionIds:[q.id],start:scope.start,end:scope.end,signature:evidence} as any);
  }
 }
 // Give each area a turn before draining the next receipt/category batch. Saved
 // answers take precedence; the scheduler and budgets still execute one step.
 const last=(o:any)=>Math.max(0,...x.work.filter((w:any)=>w.status==='done'&&w.payload?.module===o.module&&w.payload?.task===o.task&&w.kind===o.kind).map((w:any)=>Date.parse(w.updated_at||w.created_at)||0));
 core.options.sort((a,b)=>Number(['answer','resolve'].includes(b.kind))-Number(['answer','resolve'].includes(a.kind))||last(a)-last(b));
 for(const w of failed)core.attention.push({title:`A saved ${w.kind} task needs review. Other independent checks can continue.`,href:'/#automatic-work'});
 core.attention=core.attention.slice(0,30);
 return core;
}
