import {aiUsageLabel} from '@/lib/ai-budget-mode';
import {useMemo,useState} from 'react';
import {Link} from 'react-router-dom';
import {ArrowRight,CheckCheck,Info,Sparkles} from 'lucide-react';
import {useAuth} from '@/hooks/useAuth';
import {useHousehold} from '@/hooks/useHousehold';
import {useAutopilot,allowanceMessage} from '@/hooks/useAutopilot';
import {useAssistantInbox} from '@/hooks/useAutomation';
import {useAICosts} from '@/hooks/useAICosts';
import {useAIConnection} from '@/hooks/useAIConnection';
import {useModules} from '@/hooks/useModules';
import {useExperience} from '@/hooks/useExperience';
import {briefingPeriods,buildCfoBriefing,briefingWork,type BriefingPeriod,type BriefingAction} from '@/lib/cfo-briefing';
import type {FinanceView,ReportOptions} from '@/lib/household-finance';
import {ChoiceField} from '@/components/ui/choice-field';
import {Button} from '@/components/ui/button';

const dateLabel=(date:string)=>new Date(date+'T12:00:00Z').toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
const range=(start:string,end:string)=>dateLabel(start)+' – '+dateLabel(end);
export function CfoBriefing(){
 const h=useHousehold(),{user}=useAuth(),auto=useAutopilot(),inbox=useAssistantInbox(),cost=useAICosts(),connection=useAIConnection(),modules=useModules(),{experience}=useExperience();
 const [period,setPeriod]=useState<BriefingPeriod>('last-month'),[view,setView]=useState<FinanceView>('mine'),[currency,setCurrency]=useState('USD');
 const today=new Date().toISOString().slice(0,10),dates=briefingPeriods(period,today);
 const currencies=[...new Set(['USD',...h.data.accounts.map(a=>a.currency||'USD')])].sort();
 const options:ReportOptions={userId:user?.id||'',partnerId:h.partnerId,linkId:h.linkId,view,basis:'recorded',currency,start:dates.start,end:dates.end};
 const briefing=useMemo(()=>buildCfoBriefing(h.data,options,{...options,start:dates.priorStart,end:dates.priorEnd}),[h.data,JSON.stringify(options),dates.priorStart,dates.priorEnd]);
 const work=briefingWork(auto.data?.work||[],inbox.data||[],user?.id||'',new Date().toISOString());
 const workUnavailable=!!auto.error||!!inbox.error,workLoading=auto.isPending||inbox.isPending;
 const active=connection.data?.connections.find(c=>c.provider===connection.data.active);
 const settings=auto.data?.settings,on=!!settings?.enabled&&!!settings.background_enabled;
 const money=(n:number)=>new Intl.NumberFormat(undefined,{style:'currency',currency,maximumFractionDigits:0}).format(n);
 const dollars=(n:number)=>new Intl.NumberFormat(undefined,{style:'currency',currency:'USD',maximumFractionDigits:n>0&&n<10000?4:2}).format(n/1e6);
 const actions:BriefingAction[]=[...briefing.actions];
 if(work.failed.length&&!auto.error)actions.push({id:'failed',priority:1,title:'Automatic work paused after a failed task',detail:'Saved progress and any charge remain recorded. Review the task before choosing to retry.',href:'/#automatic-work',cta:'Review paused work'});
 if(work.questions.length&&!inbox.error)actions.push({id:'questions',priority:2,title:work.questions.length+' '+(work.questions.length===1?'question needs':'questions need')+' your knowledge',detail:'Answer once so Millie can use the missing facts on its next permitted pass.',href:'/assistant?scope=all&view=needs_input',cta:'Answer questions'});
 if(work.ready.length&&!inbox.error)actions.push({id:'ready',priority:5,title:work.ready.length+' '+(work.ready.length===1?'proposal is':'proposals are')+' ready for a decision',detail:'Review the evidence, edit if needed, and approve in the decision queue.',href:'/assistant?scope=all&view=ready',cta:'Review proposals'});
 if(settings?.status==='limit'&&on&&!auto.error)actions.push({id:'limit',priority:6,title:'Millie has reached an AI limit',detail:allowanceMessage(settings.next_run_at),href:'/customize#ai-spending',cta:'View allowance'});
 if(settings?.attention?.some(x=>!x.optional)&&!auto.error)actions.push({id:'setup',priority:6,title:'Another item needs your input',detail:settings.attention.find(x=>!x.optional)!.title,href:'/assistant?scope=all',cta:'See next step'});
 actions.sort((a,b)=>a.priority-b.priority);
 const [showAll,setShowAll]=useState(false);
 const shown=showAll?actions:actions.slice(0,3);
 const reportHref='/overview?'+new URLSearchParams({briefing:'1',month:dates.start.slice(0,7),period:period.includes('quarter')?'quarter':'month',view,currency,activity:'recorded',basis:'recorded'}).toString();
 const status=auto.error?'Work status unavailable':auto.isPending?'Checking saved work…':!on?'Automatic work is off':settings?.status==='limit'?'Paused at your AI limit':settings?.status==='error'?'A task needs attention':settings?.status==='needs_input'?'Waiting for information':auto.busy?'Millie is working':settings?.status==='idle'?'No automatic task is currently queued':'Checking for useful work';

 return <div className="space-y-6">
  <div className="flex flex-wrap items-end gap-3">
   <label className="text-xs text-muted-foreground space-y-2 min-w-44"><span className="block">Briefing period</span><ChoiceField aria-label="Briefing period" value={period} onChange={e=>setPeriod(e.target.value as BriefingPeriod)}><option value="last-month">Last month</option><option value="this-month">This month so far</option><option value="last-quarter">Last quarter</option><option value="this-quarter">This quarter so far</option></ChoiceField></label>
   <label className="text-xs text-muted-foreground space-y-2 min-w-36"><span className="block">Perspective</span><ChoiceField aria-label="Briefing perspective" value={view} onChange={e=>setView(e.target.value as FinanceView)}><option value="mine">My share</option><option value="household">Household</option><option value="partner">Partner’s share</option></ChoiceField></label>
   {currencies.length>1&&<label className="text-xs text-muted-foreground space-y-2 min-w-24"><span className="block">Currency</span><ChoiceField aria-label="Briefing currency" value={currency} onChange={e=>setCurrency(e.target.value)}>{currencies.map(c=><option key={c} value={c}>{c}</option>)}</ChoiceField></label>}
   <span className="text-xs text-muted-foreground pb-3 sm:ml-auto">{range(dates.start,dates.end)}{dates.partial?' · In progress':''}</span>
  </div>
  <section className="rounded-3xl border bg-card overflow-hidden" aria-label="Financial briefing">
   <div className="p-6 sm:p-8 border-b bg-primary/[0.04]">
    <p className="text-xs font-semibold tracking-widest text-primary mb-4">THE FINANCIAL PICTURE</p>
    <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight max-w-3xl">{!briefing.activity?'There isn’t enough activity for this view yet.':briefing.credits.length?'Recorded surplus: '+money(briefing.book.result.netIncome)+'. Check expense credits first.':Math.abs(briefing.book.result.netIncome)<.005?'Recorded income and expenses balance in the available records.':briefing.book.result.netIncome>0?'Recorded income exceeded expenses by '+money(briefing.book.result.netIncome)+'.':'Recorded expenses exceeded income by '+money(-briefing.book.result.netIncome)+'.'}</h2>
    <p className="text-sm text-muted-foreground mt-3 leading-relaxed">{view==='household'?'Household activity under the sharing arrangements in effect at the time.':view==='partner'?'Your current linked partner’s dated share of available records.':'Your dated share of available records, including retained account history.'} Recorded activity · {currency} · latest evidence.</p>
    <div className="grid grid-cols-1 min-[440px]:grid-cols-3 gap-5 mt-7">{[['Income',briefing.book.result.income],['Expenses',briefing.book.result.expenses],['Net cash movement',briefing.book.result.netCash]].map(([label,value])=><div key={label}><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-semibold tabular-nums mt-1">{briefing.activity?money(Number(value)):'—'}</p></div>)}</div>
   </div>
   <div className="p-6 sm:px-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
    <div className="text-sm space-y-1"><p className="font-medium">{briefing.surplusChange===null?'A comparison needs activity in both periods.':Math.abs(briefing.surplusChange)<.005?'Recorded surplus is unchanged in the imported records.':'Recorded surplus is '+money(Math.abs(briefing.surplusChange))+(briefing.surplusChange>=0?' higher':' lower')+' than the comparison period.'}</p><p className="text-xs text-muted-foreground">Compared with {range(dates.priorStart,dates.priorEnd)}. {dates.partial?'Elapsed days, capped at the prior period end.':''}</p></div>
    <Button asChild variant="outline" className="shrink-0"><Link to={reportHref}>Open supporting report<ArrowRight className="h-4 w-4 ml-2"/></Link></Button>
   </div>
   <div className="px-6 sm:px-8 pb-6 text-xs text-muted-foreground flex gap-2 items-start"><Info className="h-4 w-4 shrink-0"/><p>Amounts are rounded; the supporting report shows cents. Available records are not certified complete bank history. Cash movement includes account funding; it is not the same as surplus. {briefing.latest?'Latest recorded transaction on or before period end: '+dateLabel(briefing.latest)+'. This is not a bank-sync timestamp.':'No dated transaction found in this scope.'}</p></div>
  </section>

  <div className="grid lg:grid-cols-[1.15fr_1fr] gap-5">
   <section className="rounded-3xl border bg-card p-6 sm:p-7" aria-label="Next actions">
    <div className="flex gap-3 items-center justify-between"><h2 className="text-lg font-semibold">What needs you next</h2><span className="text-xs text-muted-foreground">{workLoading||workUnavailable?'Financial checks only':actions.length+' follow-ups'}</span></div>
    {(workLoading||workUnavailable)&&<p className="text-xs text-muted-foreground mt-3">{workUnavailable?'The work queue could not load; it is not being treated as empty.':'Loading questions and automatic work…'} {workUnavailable&&<button className="underline text-primary" onClick={()=>{void auto.refetch();void inbox.refetch();}}>Refresh work queue</button>}</p>}
    <div className="divide-y mt-2">{shown.map((a,i)=><article key={a.id} className="py-5 flex gap-3"><span className="rounded-full bg-muted h-6 w-6 grid place-items-center text-xs shrink-0 mt-0.5">{i+1}</span><div><h3 className="text-sm font-semibold">{a.title}</h3><p className="text-xs text-muted-foreground mt-2 leading-relaxed">{a.detail}</p><Link className="inline-flex items-center gap-1 text-sm text-primary mt-3 font-medium" to={a.href==='/overview'?reportHref:a.href}>{a.cta}<ArrowRight className="w-3.5 h-3.5"/></Link></div></article>)}</div>
    {!actions.length&&!workLoading&&!workUnavailable&&<p className="text-sm text-muted-foreground mt-5">No follow-up was found in these checks. Account completeness and any older work outside the recent queue still need your review.</p>}
    {actions.length>3&&<button className="text-xs text-primary underline" onClick={()=>setShowAll(!showAll)}>{showAll?'Show the top three':'Show all '+actions.length+' follow-ups'}</button>}
   </section>
   <section className="rounded-3xl border bg-card p-6 sm:p-7" aria-label="Expense changes">
    <h2 className="text-lg font-semibold">What changed in expenses</h2><p className="text-xs text-muted-foreground mt-2">Largest category changes in recorded activity.</p>
    {!briefing.comparisonAvailable?<p className="text-sm text-muted-foreground mt-5">Import both periods before interpreting a spending trend. Missing activity is not treated as a saving.</p>:<>
     <div className="divide-y mt-3">{briefing.drivers.filter(d=>Math.abs(d.change)>=.005).slice(0,3).map(d=><div key={d.category} className="py-4 flex items-start gap-4 justify-between"><div><p className="text-sm font-medium">{d.category}</p><p className="text-xs text-muted-foreground mt-1">{money(d.prior)} → {money(d.current)}</p></div><span className="text-sm font-semibold tabular-nums whitespace-nowrap">{d.change>0?'+':'−'}{money(Math.abs(d.change))}</span></div>)}</div>
     {briefing.drivers.every(d=>Math.abs(d.change)<.005)&&<p className="text-sm mt-5">No category change in the available records.</p>}
     <p className="text-xs text-muted-foreground mt-3">All categories combined: {money(briefing.book.result.expenses-briefing.previous.result.expenses)} change. These are differences, not an explanation of why spending changed.</p>
    </>}
    {(briefing.accountCoverageChanged||briefing.sharingChanges>0)&&<p className="text-xs text-amber-800 dark:text-amber-300 bg-amber-500/10 rounded-xl p-3 mt-4">{briefing.accountCoverageChanged?'The accounts with recorded activity differ between periods. ':''}{briefing.sharingChanges?'Dated sharing changes also affect this comparison. ':''}Check scope before calling a change a spending trend.</p>}
    {modules.isEnabled('analyst')&&<Link className="text-sm text-primary inline-flex gap-1 items-center mt-5" to="/analyst">Open quarterly analyst workspace<ArrowRight className="h-3.5 w-3.5"/></Link>}
   </section>
  </div>

  {(experience==='ai'||on||work.completed.length>0||work.questions.length>0||work.ready.length>0)&&<section className="rounded-3xl border bg-card p-6 sm:p-7" aria-label="Millie work briefing">
   <div className="flex flex-wrap items-center gap-3"><Sparkles className="h-5 w-5 text-primary"/><h2 className="text-lg font-semibold">{status}</h2><Link className="text-sm text-primary underline sm:ml-auto" to="/#automatic-work">Work controls</Link></div>
   <p className="text-sm text-muted-foreground mt-3">{workUnavailable?'Saved progress could not be read. No success is being assumed.':workLoading?'Loading saved checkpoints…':work.completed.length?work.completed.length+' automatic '+(work.completed.length===1?'task was':'tasks were')+' checked in the last 7 days. This counts saved task checkpoints, not transactions or approvals.':'No completed automatic task appears in the last 7 days of the recent history.'}{work.answered.length>0&&!inbox.error?' '+work.answered.length+' answered questions are waiting for Millie’s next permitted pass.':''}</p>
   {on&&settings?.status==='limit'&&<p className="text-sm mt-3">{allowanceMessage(settings.next_run_at)}</p>}
   {active&&!connection.error&&<p className="text-xs text-muted-foreground mt-3">{aiUsageLabel(active)}</p>}
   {!cost.error&&cost.data?<p className="text-xs text-muted-foreground mt-3">AI allowance used or reserved today: {dollars(cost.data.usage.day)} / {dollars(cost.data.budget.daily_micros)}. This month: {dollars(cost.data.usage.month)} / {dollars(cost.data.budget.monthly_micros)}. UTC boundaries; earlier unmetered use is excluded. {cost.data.usage.uncertain>0?'An uncertain call still has a reserved charge. ':''}<Link className="underline text-primary" to="/customize#ai-spending">View spending</Link></p>:<p className="text-xs text-muted-foreground mt-3">{cost.error?'AI spending could not load. Your saved limits still govern every paid call.':'Loading spending controls…'}</p>}
   <div className="flex flex-wrap gap-5 mt-5"><Link className="text-sm text-primary" to="/assistant?scope=all">Questions & decisions →</Link><Link className="text-sm text-primary" to="/policies">How Millie learns →</Link></div>
   {!workLoading&&!workUnavailable&&work.completed.length>0&&<details className="mt-5"><summary className="text-sm text-muted-foreground cursor-pointer">Recent completed checks</summary><div className="divide-y mt-2">{work.completed.slice(0,3).map(w=><div key={w.id} className="py-3 flex gap-2"><CheckCheck className="h-4 w-4 text-primary shrink-0 mt-1"/><div><p className="text-sm">{w.summary||'Task checkpoint saved'}</p><p className="text-xs text-muted-foreground mt-1">{new Date(w.updated_at!).toLocaleString()} · {w.kind}</p></div></div>)}</div><p className="text-xs text-muted-foreground">Based on up to 200 recent saved tasks. Open Questions & decisions for the actual proposals and results.</p></details>}
  </section>}
  <details className="rounded-2xl border px-5 py-4 text-sm">
   <summary className="cursor-pointer text-muted-foreground">Evidence, reconciliation & reporting scope</summary>
   <div className="space-y-4 mt-5 text-xs text-muted-foreground">
    <p>This briefing uses the shared reporting engine ({briefing.book.engineVersion}). It is a read-only view of current evidence, not an original closed edition or an analyst-adjusted result. Opening it makes no paid AI call. Closed reports, source transactions and sharing arrangements are unchanged.</p>
    <p>All eligible accounts are included, using dated ownership and sharing. No currencies are converted or combined. Scope: {view} · as lived · recorded activity · {range(dates.start,dates.end)}.</p>
    <ul className="space-y-2">{briefing.checks.map(c=><li key={c.label}>{c.passed?'✓':'Needs attention:'} {c.label}</li>)}</ul>
    <p>These checks verify arithmetic, not complete imports. Dated cash bridge: {briefing.book.cashBridge.status}. Dated account wealth bridge: {briefing.book.netWorthBridge.status}. Missing observations stay missing.</p>
    <Link className="block text-primary underline" to="/context?tab=connections">Check connected evidence & next connections</Link>
   </div>
  </details>
 </div>;
}
