import {autopilotPlan} from './autopilot-plan.ts';
import {ASSISTANT_TASKS} from './assistant-tasks.ts';
import {quarterBounds} from './review-periods.ts';

// Legacy opt-ins retain their original task scope. The expanded workflow is an
// explicit new opt-in and never retries a failed request behind the user's back.
export function workflowPlan(x:any){
 if(x.workflowScope!=='all_enabled')return autopilotPlan(x);
 const failed=x.work.filter((w:any)=>w.status==='failed');
 const blockedTx=new Set(failed.flatMap((w:any)=>w.payload?.transactionIds||[]));
 const blockedReceipts=new Set(failed.flatMap((w:any)=>w.payload?.receiptIds||[]));
 const blockedAnswers=new Set(failed.map((w:any)=>w.payload?.answerId).filter(Boolean));
 const core=autopilotPlan({...x,transactions:x.transactions.filter((t:any)=>!blockedTx.has(t.id)),emails:x.emails.filter((e:any)=>!blockedReceipts.has(e.id))});
 core.eligible=core.eligible.filter((t:any)=>!blockedTx.has(t.id));
 core.options=core.options.filter(o=>o.kind!=='setup'&&!blockedAnswers.has(o.answerId)&&
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
    documents:stamps(x.documents),plans:stamps(x.plans),budgets:stamps(x.budgets),cash:stamps(x.cashSettings),records:stamps(x.moduleRecords),context:stamps(x.contextRecords)};
   core.options.push({kind:'review',module:task.module,task:task.id,start:scope.start,end:scope.end,signature});
  }
 }
 // Give each area a turn before draining the next receipt/category batch. Saved
 // answers take precedence; the scheduler and budgets still execute one step.
 const last=(o:any)=>Math.max(0,...x.work.filter((w:any)=>w.status==='done'&&w.payload?.module===o.module&&w.payload?.task===o.task&&w.kind===o.kind).map((w:any)=>Date.parse(w.updated_at||w.created_at)||0));
 core.options.sort((a,b)=>Number(b.kind==='answer')-Number(a.kind==='answer')||last(a)-last(b));
 for(const w of failed)core.attention.push({title:`A saved ${w.kind} task needs review. Other independent checks can continue.`,href:'/#automatic-work'});
 core.attention=core.attention.slice(0,30);
 return core;
}
