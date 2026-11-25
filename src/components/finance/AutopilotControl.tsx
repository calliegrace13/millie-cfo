import {aiUsageLabel} from '@/lib/ai-budget-mode';
import {useState} from 'react';
import {Link} from 'react-router-dom';
import {Sparkles,Pause,Play,Loader2} from 'lucide-react';
import {AIModels} from './AIModels';
import {AISpending} from './AISpending';
import {useAutopilot,allowanceMessage} from '@/hooks/useAutopilot';
import {useAIConnection,providerName} from '@/hooks/useAIConnection';
import {useAICosts} from '@/hooks/useAICosts';
import {useAutomation,useAssistantInbox} from '@/hooks/useAutomation';
import {useModules} from '@/hooks/useModules';
import {useExperience} from '@/hooks/useExperience';
import {workflowProgress} from '@/lib/workflow-progress';
import {Button} from '@/components/ui/button';

export function AutopilotControl(){
 const a=useAutopilot(),q=useAIConnection(),costs=useAICosts(),automation=useAutomation(),modules=useModules(),inbox=useAssistantInbox(),{choose}=useExperience();
 const [saving,setSaving]=useState(false),[fault,setFault]=useState('');
 const s=a.data?.settings,active=q.data?.connections.find(c=>c.provider===q.data.active),on=!!s?.enabled&&!!s?.background_enabled,unified=s?.workflow_scope==='all_enabled';
 const work=a.data?.work||[],failed=work.filter(w=>w.status==='failed'),recoveries=work.filter(w=>w.result?.previousAttempt);
 const policies=['transactions',...modules.enabled].map(module=>({...automation.policy(module),module}));
 const coverage=workflowProgress(modules.enabled,policies,work,inbox.data||[]),checked=coverage.filter(t=>t.checked).length;
 const ready=!!active&&!a.isPending&&!a.error&&!modules.loading&&!modules.error&&!automation.loading&&!automation.error&&!costs.isPending&&!costs.error&&costs.data?.pricingReady;
 const start=async()=>{setSaving(true);setFault('');try{await a.startWorkflow();choose('ai');}catch(e){setFault((e as Error).message);}finally{setSaving(false);}};
 const pause=async()=>{setSaving(true);setFault('');try{await a.configure(false);}catch(e){setFault((e as Error).message);}finally{setSaving(false);}};
 const title=!on?'Turn on Millie and work through your finances.':a.busy?'Millie is working through your tasks.':s?.status==='limit'?'Waiting for your AI allowance.':unified?'Your AI workflow, in one place.':'Bring all your AI tasks together.';
 return <section className="rounded-3xl border bg-card p-6 sm:p-8 space-y-5" aria-label="Millie AI workflow">
  <div className="flex gap-3 items-center text-primary"><Sparkles className="h-5 w-5"/><p className="text-xs font-semibold tracking-widest">MILLIE AI WORKFLOW</p>{a.busy&&<Loader2 className="h-4 w-4 animate-spin ml-auto"/>}</div>
  <h2 className="text-2xl sm:text-3xl font-semibold max-w-2xl">{title}</h2>
  <p className="text-sm text-muted-foreground max-w-3xl leading-relaxed">One start covers receipt evidence, open purchases, expense timing, and reviews across the tools you have enabled. Millie saves its progress, brings questions and proposals to Needs you, and continues with independent work when one task needs your input.</p>
  <div className="rounded-xl bg-secondary/40 p-4 text-sm space-y-2"><p>Starting enables AI analysis for all {coverage.length} available tasks in your enabled tools, using your connected {active?providerName(active.provider):'AI provider'} and existing request and dollar limits. Owned financial evidence and your permitted receipt context are used for analysis.</p><p className="text-muted-foreground">Your current automatic-save permissions stay in place. Other financial changes remain proposals. Hidden tools, web permissions, spending limits and partner access are preserved. Failed paid calls require an explicit retry.</p></div>
  <div className="flex flex-wrap gap-3 items-center">{active?<Button disabled={saving||a.busy||!ready} onClick={start}><Play className="h-4 w-4 mr-2"/>{saving?'Saving...':'Run Millie across my enabled tools'}</Button>:<Button asChild><Link to="/customize#ai-assistant">Connect your AI</Link></Button>}{on&&<Button variant="outline" disabled={saving||a.isPending} onClick={pause}><Pause className="h-4 w-4 mr-2"/>Pause after current task</Button>}<Button asChild variant="outline"><Link to="/assistant?scope=all">Needs you & saved results</Link></Button></div>
  {on&&<p className="text-sm" role="status">{s?.status==='limit'?(s.summary?.startsWith('Your AI credit')?s.summary:allowanceMessage(s.next_run_at)):s?.summary}</p>}
  {recoveries.length>0&&<p role="status" className="text-sm">Failed-task recovery: {recoveries.filter(w=>w.status==='done').length} completed · {recoveries.filter(w=>w.status==='running').length} queued · {recoveries.filter(w=>w.status==='failed').length} need review. Completed checks can still leave questions under Needs you.</p>}
  {active&&<p className="text-xs text-muted-foreground">{active.model} / {aiUsageLabel(active)} A full pass can span several allowance windows; saved progress resumes automatically.</p>}
  <details className="rounded-xl border p-4"><summary className="cursor-pointer font-medium text-sm">Tasks and progress / {checked} of {coverage.length} areas have recent saved checks</summary><div className="grid sm:grid-cols-2 gap-x-6 divide-y mt-3">{coverage.map(t=><div className="py-3 flex items-center gap-3 text-sm" key={t.module+':'+t.id}><span className="flex-1">{t.name}</span><span className="text-xs text-muted-foreground">{t.state}</span></div>)}</div><p className="text-xs text-muted-foreground mt-3">These are saved checkpoints, not a promise that all records are complete. New evidence may need another pass. Checks rotate across task areas before processing more batches.</p></details>
  <AIModels compact/>
  <AISpending compact/>
  <p className="text-xs text-muted-foreground">Work runs on the server while Millie is closed. Nothing moves money, closes a period or changes sharing automatically. The AI/Manual navigation switch chooses your workspace; this control starts or pauses background analysis.</p>
  {s?.last_finished_at&&<p className="text-xs text-muted-foreground">Last saved checkpoint: {new Date(s.last_finished_at).toLocaleString()}</p>}
  {(fault||a.error||modules.error||automation.error||costs.error)&&<p role="alert" className="text-sm text-destructive">{fault||(typeof a.error==='string'?a.error:a.error?.message)||modules.error||automation.error?.message||costs.error?.message}</p>}
  {(s?.attention||[]).filter(x=>!x.optional).slice(0,5).map(x=><Link className="block rounded-xl border p-3 text-sm text-primary" key={x.href+x.title} to={x.href}>{x.title}</Link>)}
  {failed.length>0&&<div className="space-y-3"><h3 className="font-semibold text-sm">Saved tasks needing review</h3><Button variant="outline" size="sm" disabled={saving} onClick={async()=>{setSaving(true);setFault('');try{const count=await a.retryFailed(failed.slice(0,30).map(w=>w.id));if(!count)setFault('No failed task was ready to queue. Running calls were left alone.');}catch(e){setFault((e as Error).message);}finally{setSaving(false);}}}>Retry failed tasks once within my limits</Button><p className="text-xs text-muted-foreground">Reuses saved responses when available. Otherwise this authorizes one new paid attempt per failed task, one at a time within your dollar and credit limits. Uncertain earlier charges stay held.</p><p className="text-xs text-muted-foreground">{unified?'Other independent tasks can continue. These calls will not retry automatically.':'Starting the expanded workflow lets independent tasks continue while these remain for review.'}</p>{failed.map(w=><div key={w.id} className="border rounded-xl p-4 space-y-3"><p className="text-sm">{w.summary}</p><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={a.busy||saving} onClick={async()=>{try{await a.manage('retry',w.id);}catch(e){setFault((e as Error).message);}}}>Retry this task within my limit</Button><Button variant="ghost" size="sm" disabled={a.busy||saving} onClick={async()=>{try{await a.manage('skip',w.id);}catch(e){setFault((e as Error).message);}}}>Leave for manual review</Button></div></div>)}</div>}
  <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">Recent completed work & advanced settings</summary><div className="space-y-3 mt-4">{work.slice(0,12).map(w=><div key={w.id} className="border-t pt-3"><p className="font-medium capitalize">{w.payload?.module||w.kind} / {w.payload?.task||w.kind} / {w.status}</p><p className="text-muted-foreground text-xs mt-1">{w.summary||'A saved task is in progress.'}</p></div>)}<Link className="block text-primary underline" to="/customize#mode-transactions">Per-task permissions</Link><Link className="block text-primary underline" to="/customize#ai-spending">Provider and spending controls</Link></div></details>
 </section>;
}
