import {aiUsageLabel} from '@/lib/ai-budget-mode';
import {useState} from 'react';import {Link} from 'react-router-dom';import {Sparkles} from 'lucide-react';
import {financeDb} from '@/hooks/useHousehold';
import {AIModels} from './AIModels';
import {AISpending} from './AISpending';
import {useAIConnection,aiRequest,providerName,type AIProvider} from '@/hooks/useAIConnection';
import {Button} from '@/components/ui/button';import {Input} from '@/components/ui/input';import {ChoiceField} from '@/components/ui/choice-field';
function RequestLimit({current,busy,save}:{current:number;busy:boolean;save:(limit:number)=>void}) {
 const [value,setValue]=useState(String(current));
 const limit=Number(value);
 return <form className="flex flex-wrap items-end gap-2" onSubmit={event=>{event.preventDefault();save(limit);}}>
  <label className="text-sm">Requests per rolling 24 hours<Input type="number" required min={1} max={20} step={1} className="mt-1 w-24" value={value} disabled={busy} onChange={event=>setValue(event.target.value)}/></label>
  <Button size="sm" variant="outline" disabled={busy||!Number.isInteger(limit)||limit<1||limit>20||limit===current}>Save request limit</Button>
 </form>;
}
export function AISettings(){
 const q=useAIConnection();const [provider,setProvider]=useState<AIProvider>('openai'),[key,setKey]=useState(''),[models,setModels]=useState<string[]>([]),[model,setModel]=useState(''),[cap,setCap]=useState(3),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function act(fn:()=>Promise<void>){setBusy(true);setMessage('');try{await fn();await q.refresh();}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}
 const existing=q.data?.connections.find(c=>c.provider===provider);
 return <section id="ai-assistant" aria-label="Your AI assistant" className="rounded-2xl border bg-card p-5 space-y-4 scroll-mt-6"><div className="flex gap-3"><Sparkles className="h-5 w-5 text-primary mt-1"/><div><h2 className="text-lg font-semibold">Your AI, inside Millie</h2><p className="text-sm text-muted-foreground mt-1">Connect your provider once, then choose Manual or AI for each module. Enable only the tasks and evidence sources you want it to use. Missing facts stay in your work queue, and supported changes remain editable.</p></div></div>
 <p className="text-sm text-muted-foreground">Connect an API account below. Use a provider API key for this connection. Eligible ChatGPT plans may include API credits after linking an API organization. A Claude subscription and Claude API billing are separate.</p>
 {q.isLoading&&<p role="status">Loading your connections…</p>}{q.error&&<p role="alert" className="text-sm text-destructive">AI settings could not load. <button className="underline" onClick={()=>q.refetch()}>Retry</button></p>}
 <AIModels/>
 <details className="rounded-xl border p-4"><summary className="cursor-pointer text-sm font-medium">Advanced connection settings & optional request caps</summary><div className="mt-3 space-y-3">{q.data?.connections.map(c=><div key={c.provider} className="rounded-xl border p-3 space-y-2"><p className="font-medium text-sm">{providerName(c.provider)} · {q.data?.active===c.provider?'Active':'Saved'} · key ending {c.suffix}</p><p className="text-xs text-muted-foreground">{c.model} · {aiUsageLabel(c)}</p>
 <p className="text-xs text-muted-foreground">{c.requestLimitEnabled===false?'Your saved daily and monthly dollar budgets are the spending limits.':'An optional request-count cap is also enabled.'}</p><Button size="sm" variant="outline" disabled={busy} onClick={()=>act(async()=>{const r=await financeDb.rpc('finance_set_ai_limit_mode',{_provider:c.provider,_request_limited:c.requestLimitEnabled===false,_expected:c.revision});if(r.error)throw Error(r.error.message);setMessage('AI limit mode saved. Your dollar budgets are unchanged.');})}>{c.requestLimitEnabled===false?'Add an optional request cap':'Use dollar budgets only'}</Button>
 {c.requestLimitEnabled!==false&&<RequestLimit key={c.revision} current={c.requestLimit} busy={busy} save={limit=>act(async()=>{
  const result=await financeDb.rpc('finance_set_ai_request_limit',{_provider:c.provider,_limit:limit,_expected:c.revision});
  if(result.error)throw Error(result.error.message);
  setMessage('Request limit saved. Millie has checked when background work can resume.');
 })}/>}<div className="flex gap-2"><Button size="sm" variant="ghost" disabled={busy} onClick={()=>act(async()=>{await aiRequest({action:'disconnect',provider:c.provider});setMessage('API key removed. Your financial history is unchanged.');})}>Disconnect and erase key</Button></div></div>)}
 </div></details>
 <AISpending/>
 <details className="rounded-xl border p-4" open={!q.data?.connections.length}><summary className="cursor-pointer font-medium text-sm">Connect or replace a provider</summary><div className="mt-4 space-y-3">
 <label className="block text-sm">Provider<ChoiceField aria-label="AI provider" value={provider} disabled={busy} onChange={e=>{setProvider(e.target.value as AIProvider);setKey('');setModels([]);setModel('');setConsent(false);}}><option value="openai">OpenAI API</option><option value="anthropic">Claude API</option></ChoiceField></label>
 <label className="block text-sm">API key<Input type="password" autoComplete="off" aria-label="Provider API key" placeholder="Paste your provider API key" value={key} disabled={busy} onChange={e=>{setKey(e.target.value);setModels([]);setModel('');}}/></label>
 <Button variant="outline" disabled={busy||!key.trim()} onClick={()=>act(async()=>{const r=await aiRequest({action:'probe',provider,key:key.trim()});setModels(r.models);setModel('');setMessage(r.models.length?'Connection verified. Choose a model that supports structured output.':'No supported text models were found for this key.');})}>Check key and load models</Button>
 {!!models.length&&<label className="block text-sm">Model<ChoiceField aria-label="AI model" value={model} disabled={busy} onChange={e=>setModel(e.target.value)}><option value="">Choose a text model</option>{models.map(m=><option key={m} value={m}>{m}</option>)}</ChoiceField></label>}
 <p className="text-sm">New connections use your saved daily and monthly dollar budgets. You can add an optional request-count cap after connecting.</p>
 <p className="text-xs text-muted-foreground">Set a spending limit in your provider account. Millie enforces shared daily and monthly dollar limits and output size, plus a request-count cap only if you enable one. Failed attempts may still be billed; there is no automatic retry or fallback provider.</p>
 <label className="flex gap-2 text-sm"><input type="checkbox" checked={consent} disabled={busy} onChange={e=>setConsent(e.target.checked)}/>I authorize this connection and understand that my provider charges for analysis.</label>
 <Button disabled={busy||!model||!consent||!key||!Number.isInteger(cap)||cap<1||cap>20||!q.data} onClick={()=>act(async()=>{await aiRequest({action:'connect',provider,key:key.trim(),model,requestLimit:cap,expected:existing?.revision??null,consent:true});setKey('');setModels([]);setModel('');setConsent(false);setMessage('Your private AI connection is ready.');})}>{busy?'Working…':'Save private connection'}</Button>
 </div></details>
 <p role="status" className="text-sm">{message}</p><div className="rounded-xl bg-muted/50 p-3 text-sm space-y-2"><p><strong>Start with saved email receipts</strong></p><p>Import .eml, .txt or .html files, or paste receipt text in receipt review. Or connect Gmail in receipt review for read-only receipt syncing. Syncing and AI analysis are separate choices.</p><div className="flex flex-wrap gap-4"><Link to="/transactions#patterns" className="text-primary underline">Review repeat spending →</Link><Link to="/transactions#receipt-review" className="text-primary underline">Match purchase receipts →</Link></div><p className="text-xs text-muted-foreground">Keys are encrypted on the server and private to your login. Module runs send the owned-account evidence described in that workspace, including selected transaction details and enabled receipt evidence. Public merchant lookup sends only merchant names to search. Receipt matching still compares extracted receipts against bank transactions inside Millie. Source files are not saved. Extracted items and analysis results are retained privately for request recovery. Your provider’s own data policy also applies.</p></div></section>;
}
