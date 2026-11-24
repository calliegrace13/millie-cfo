import {useState} from 'react';
import {Link} from 'react-router-dom';
import {Check,ArrowRightLeft} from 'lucide-react';
import {useAIConnection,aiRequest,providerName,type AIConnection} from '@/hooks/useAIConnection';
import {financeDb} from '@/hooks/useHousehold';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {ChoiceField} from '@/components/ui/choice-field';

const usd=(n:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n/1e6);
const date=(d:string)=>new Date(d+'T12:00:00Z').toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
type Model={id:string;inputRate:number;outputRate:number};

function CreditEditor({connection,busy,run}:{connection:AIConnection;busy:boolean;run:(fn:()=>Promise<void>,message:string)=>Promise<void>}){
 const credit=connection.credit;
 const [amount,setAmount]=useState(credit?String(credit.remainingMicros/1e6):''),[expires,setExpires]=useState(credit?.expiresOn||'');
 const valid=amount.trim()!==''&&Number.isFinite(+amount)&&+amount>=0&&+amount<=1000&&/^\d{4}-\d{2}-\d{2}$/.test(expires);
 return <details className="border-t pt-3"><summary className="cursor-pointer text-sm underline">{credit?'Update credit balance':'Add API credit'}</summary><form className="space-y-3 mt-3" onSubmit={e=>{e.preventDefault();if(valid)void run(async()=>{const r=await financeDb.rpc('finance_set_ai_credit',{_provider:connection.provider,_amount:Math.round(+amount*1e6),_expires:expires,_expected:credit?.revision??null});if(r.error)throw Error(r.error.message);},'Credit saved. Existing dollar limits still apply.');}}>
  <label className="block text-sm">Remaining provider credit (USD)<Input aria-label={providerName(connection.provider)+' credit balance'} type="number" min="0" max="1000" step="0.01" required value={amount} onChange={e=>setAmount(e.target.value)} disabled={busy}/></label>
  <label className="block text-sm">Valid through (UTC)<Input aria-label={providerName(connection.provider)+' credit expiry'} type="date" required value={expires} onChange={e=>setExpires(e.target.value)} disabled={busy}/></label>
  <p className="text-xs text-muted-foreground">Enter the balance shown by your provider now. Millie subtracts its new usage and pending calls. Spending elsewhere is excluded; refresh this balance if you use other apps. This is an estimate, not a verified provider balance.</p>
  <p className="text-xs text-muted-foreground">While a credit is tracked, new calls on this provider pause when it expires or cannot cover the next call’s maximum cost. There is no automatic switch to paid usage or another provider.</p>
  <Button size="sm" disabled={busy||!valid}>Save credit balance</Button>
  {credit&&<Button className="ml-2" type="button" size="sm" variant="ghost" disabled={busy} onClick={()=>void run(async()=>{const r=await financeDb.rpc('finance_clear_ai_credit',{_provider:connection.provider,_expected:credit.revision});if(r.error)throw Error(r.error.message);},'Credit protection removed. Your daily and monthly dollar limits still apply.')}>Stop tracking; use dollar limits</Button>}
 </form></details>;
}

function ModelEditor({connection,busy,run}:{connection:AIConnection;busy:boolean;run:(fn:()=>Promise<void>,message:string)=>Promise<void>}){
 const [models,setModels]=useState<Model[]|null>(null),[model,setModel]=useState(connection.model);
 return <div className="space-y-3">
  {!models?<Button size="sm" variant="ghost" disabled={busy} onClick={()=>void run(async()=>{const r=await aiRequest({action:'models',provider:connection.provider});setModels(r.models);},'Available models loaded using your saved key. No AI analysis was purchased.')}>Change model</Button>:<form className="space-y-2" onSubmit={e=>{e.preventDefault();void run(async()=>{await aiRequest({action:'model',provider:connection.provider,model,expected:connection.revision});setModels(null);},'Model saved for upcoming tasks. Your key, progress and spending limits are preserved.');}}>
   <label className="block text-sm">Model for {providerName(connection.provider)}<ChoiceField aria-label={providerName(connection.provider)+' model'} value={model} disabled={busy} onChange={e=>setModel(e.target.value)}>{!models.some(m=>m.id===connection.model)&&<option value={connection.model} disabled>{connection.model} · unavailable</option>}{models.map(m=><option key={m.id} value={m.id}>{m.id}</option>)}</ChoiceField></label>
   <p className="text-xs text-muted-foreground">Only models available to your key with current verified pricing are listed. Changing models keeps completed results.</p>
   {models.find(m=>m.id===model)&&<p className="text-xs text-muted-foreground">Standard price per million tokens: ${models.find(m=>m.id===model)!.inputRate} input / ${models.find(m=>m.id===model)!.outputRate} output.</p>}
   <Button size="sm" disabled={busy||model===connection.model||!models.some(m=>m.id===model)}>Save model</Button>
  </form>}
 </div>;
}

export function AIModels({compact=false}:{compact?:boolean}){
 const q=useAIConnection(),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 const run=async(fn:()=>Promise<void>,success:string)=>{setBusy(true);setError('');setMessage('');try{await fn();await q.refresh();setMessage(success);}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 if(q.isPending)return <p role="status">Loading models & credits…</p>;
 if(q.error)return <p role="alert">Models could not load. <button className="underline" onClick={()=>q.refetch()}>Try again</button></p>;
 const connections=q.data?.connections||[];
 const eligible=connections.filter(c=>c.credit&&!c.credit.expired&&c.credit.remainingMicros>0&&c.pricingReady!==false).sort((a,b)=>a.credit!.expiresOn.localeCompare(b.credit!.expiresOn));
 const first=eligible[0];
 return <section aria-label="Models and credits" className="rounded-2xl border bg-card p-4 sm:p-5 space-y-4" id={compact?undefined:'ai-models'}>
  <div className="flex flex-wrap justify-between items-center gap-2"><h3 className="font-semibold flex items-center gap-2"><ArrowRightLeft className="h-4 w-4"/>Models & credits</h3>{compact&&<Link to="/customize#ai-models" className="text-sm text-primary underline">Manage models & credits</Link>}</div>
  <p className="text-sm text-muted-foreground">Switch the model for upcoming work in one click. Your saved progress and dollar limits follow you.</p>
  {first&&q.data?.active!==first.provider&&<p className="rounded-lg bg-primary/5 p-3 text-sm">Use {providerName(first.provider)} next: your entered credit expires first, on {date(first.credit!.expiresOn)}. Select it below to use it within your dollar limits.</p>}
  {!connections.length&&<Link className="underline text-primary" to="/customize#ai-assistant">Connect an API provider</Link>}
  <div className="grid sm:grid-cols-2 gap-3">{connections.map(c=>{const active=q.data?.active===c.provider,blocked=!!c.credit&&(c.credit.expired||c.credit.remainingMicros<=0);return <div key={c.provider} className={'rounded-xl border p-4 space-y-3 '+(active?'border-primary bg-primary/5':'')}>
   <div className="flex justify-between items-center gap-2"><p className="font-medium text-sm">{providerName(c.provider)}</p>{active&&<span className="text-xs text-primary flex gap-1 items-center"><Check className="h-3 w-3"/>In use</span>}</div>
   <p className="text-sm break-all">{c.model}</p>
   {c.credit?<div className="text-sm"><p className="font-medium">{usd(c.credit.remainingMicros)} estimated credit left</p><p className="text-xs text-muted-foreground">{c.credit.expired?'Expired':'Valid through'} {date(c.credit.expiresOn)} (UTC)</p>{!compact&&<p className="text-xs text-muted-foreground mt-1">Manually entered {new Date(c.credit.recordedAt).toLocaleDateString()}; includes Millie’s pending calls.</p>}{blocked&&<p className="text-xs text-amber-700 dark:text-amber-300 mt-1">Credit protection pauses new paid calls. Update the balance or choose another provider.</p>}</div>:<p className="text-xs text-muted-foreground">No credit tracked · uses your dollar limits</p>}
   {c.pricingReady===false&&<p className="text-xs text-destructive">Pricing needs verification before new paid calls.</p>}
   <Button size="sm" className="w-full" variant={active?'outline':'default'} disabled={busy||active||blocked||c.pricingReady===false} onClick={()=>void run(async()=>{await aiRequest({action:'choose',provider:c.provider});},providerName(c.provider)+' selected for upcoming tasks. A call already sent may finish on the previous model.')} aria-label={'Use '+c.model}>{active?'Selected':'Use '+(c.provider==='openai'?'OpenAI':'Claude')+(c.credit?' credit':'')}</Button>
   {!compact&&<><ModelEditor key={'model:'+c.revision} connection={c} busy={busy} run={run}/><CreditEditor key={'credit:'+(c.credit?.revision??0)} connection={c} busy={busy} run={run}/></>}
  </div>;})}</div>
  {!compact&&<p className="text-xs text-muted-foreground">API credits belong to the provider account, not each model. ChatGPT subscriptions and API billing are separate. Credits do not increase Millie’s daily or monthly limits, and Millie won’t generate unnecessary work just to spend a credit.</p>}
  {message&&<p role="status" className="text-sm">{message}</p>}{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
 </section>;
}
