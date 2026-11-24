import {aiUsageLabel} from '@/lib/ai-budget-mode';
import {useAutomation} from '@/hooks/useAutomation';
import {useState} from 'react';import {Link} from 'react-router-dom';
import {aiRequest,useAIConnection,providerName} from '@/hooks/useAIConnection';import {Button} from '@/components/ui/button';
import {patternCandidates,patternInput,usablePatternDrafts} from '@/lib/pattern-assistance';
export function PatternAssistant({groups,onSuggest,hasDraft=()=>false,busy:parentBusy}:{groups:any[];onSuggest:(id:string,category:string)=>void;hasDraft?:(id:string)=>boolean;busy:boolean}){
 const automation=useAutomation(); const allowed=automation.enabled('transactions','patterns');
 const q=useAIConnection(),active=q.data?.connections.find(c=>c.provider===q.data?.active);
 const [consent,setConsent]=useState(false),[includeKnown,setIncludeKnown]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[result,setResult]=useState<any[]>([]),[request,setRequest]=useState<ReturnType<typeof patternInput>|null>(null),[finished,setFinished]=useState(false),[analyzed,setAnalyzed]=useState<string[]>([]);
 const candidates=patternCandidates(groups,analyzed,hasDraft,includeKnown),drafts=usablePatternDrafts(result,groups,hasDraft),checking=!!request&&!finished;
 async function analyze(){if(!allowed)return;const input=checking?request!:patternInput(candidates);if(!input.sources.length)return;setRequest(input);setFinished(false);setBusy(true);setMessage('');
  try{const r=await aiRequest({action:'analyze',task:'patterns',requestId:input.id,sources:input.sources,consent:true,provider:active?.provider,model:active?.model});
   if(r.status==='succeeded'){setResult(r.result.patterns.map((p:any)=>({...p,id:input.ids[p.source],label:groups.find(g=>g.id===input.ids[p.source])?.label||'Merchant'})));setAnalyzed(ids=>[...new Set([...ids,...input.ids])]);setFinished(true);setMessage('Suggestions are ready. Use them as drafts, then approve the categories and future amount limits below.');}
   else setMessage(r.status==='failed'?'This attempt failed. Checking it again will not retry a paid call.':'Analysis is still running; check the same request again.');
   await q.refresh();
  }catch(e){setMessage((e as Error).message);}finally{setBusy(false);}
 }
 function useDraft(id:string,category:string){onSuggest(id,category);setResult(rows=>rows.filter(p=>p.id!==id));}
 if(!allowed)return <p className="text-sm text-muted-foreground">Merchant AI is off. Your guided review and saved rules still work. <Link className="underline" to="/customize#mode-transactions">Change task settings</Link></p>;
 return <details open={!!active} className="rounded-xl border bg-primary/5 p-4"><summary className="cursor-pointer font-medium text-sm">AI help for unresolved merchant categories</summary><div className="mt-3 space-y-3">
 <p className="text-sm text-muted-foreground">Millie already suggests familiar merchants without AI. Your provider can help with the ambiguous groups, starting with the ones that remove the most repetitive review. It never approves entries or creates future rules on its own.</p>
 {!active?<Link className="text-sm text-primary underline" to="/customize#ai-assistant">Connect your AI provider</Link>:<p className="text-sm">{providerName(active.provider)} · {active.model} · {aiUsageLabel(active)}</p>}
 <label className="flex gap-2 text-sm"><input type="checkbox" checked={includeKnown} disabled={busy||checking} onChange={e=>setIncludeKnown(e.target.checked)}/>Also consider merchants Millie already categorized</label>
 <p className="text-sm">{candidates.length} merchant groups ready for this analysis · {candidates.reduce((n,g)=>n+g.count,0)} open purchases represented{!candidates.length&&!checking?' — review the existing suggestions below; AI is optional.':''}</p>
 <label className="flex gap-2 text-sm"><input type="checkbox" disabled={!active||busy} checked={consent} onChange={e=>setConsent(e.target.checked)}/>Send merchant names and up to three sample bank descriptions per group to my provider for a paid analysis. No balances, account records or full transaction history are included.</label>
 <Button size="sm" disabled={!active||!consent||busy||parentBusy||(!checking&&!candidates.length)} onClick={analyze}>{busy?'Analyzing…':checking?'Check this analysis':analyzed.length?'Analyze the next merchant groups':'Suggest unresolved categories'}</Button>
 <p role="status" className="text-sm">{message}</p>
 {!!drafts.length&&<Button size="sm" variant="outline" disabled={parentBusy||busy} onClick={()=>{for(const p of drafts)onSuggest(p.id,p.category);setResult(rows=>rows.filter(p=>!drafts.some(d=>d.id===p.id)));}}>Use {drafts.length} suggested categories as drafts</Button>}
 {result.map(p=><div key={p.source} className="border-t pt-3 space-y-2"><p className="text-sm font-medium">{p.label} → {p.category}</p><p className="text-xs text-muted-foreground">{p.reason}</p>{p.category!=='Other'&&groups.some(g=>g.id===p.id)?<Button size="sm" variant="outline" disabled={parentBusy||busy} onClick={()=>useDraft(p.id,p.category)}>{hasDraft(p.id)?'Replace my draft category':'Use as draft category'}</Button>:<p className="text-xs text-muted-foreground">Keep this for individual review or use receipt evidence.</p>}</div>)}
 </div></details>;
}
