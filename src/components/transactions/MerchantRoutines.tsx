import {useEffect,useMemo,useState} from 'react';
import {useLocation} from 'react-router-dom';
import {useAuth} from '@/hooks/useAuth';
import {financeDb,useHousehold} from '@/hooks/useHousehold';
import {merchantGroups,movementCategories,routineEligible} from '../../../supabase/functions/_shared/merchant-routines';
import {isAmazonPurchase,reviewSnapshot} from '@/lib/merchant-review';
import {closedForReview} from '../../../supabase/functions/_shared/review-periods';
import type {Account,Transaction} from '@/lib/types';
import {PatternAssistant} from './PatternAssistant';
import {AmazonReview} from './AmazonReview';
import {Card,CardContent,CardHeader,CardTitle,CardDescription} from '../ui/card';
import {Button} from '../ui/button';import {Input} from '../ui/input';import {Label} from '../ui/label';import {ChoiceField} from '../ui/choice-field';
import {toast} from 'sonner';
const money=(amount:number,currency:string)=>new Intl.NumberFormat('en-US',{style:'currency',currency}).format(amount);
export function MerchantRoutines({transactions,accounts,categories,onChanged,offsets}:{transactions:Transaction[];accounts:Account[];categories:string[];onChanged:()=>Promise<void>;offsets:{parent_transaction_id:string;offset_transaction_id:string}[]}){
 const {user}=useAuth(),h=useHousehold();
 const {hash}=useLocation();
 const [opened,setOpened]=useState(true),[limit,setLimit]=useState(6),[busy,setBusy]=useState(false),[prefs,setPrefs]=useState<any[]>([]),[error,setError]=useState(''),[selected,setSelected]=useState<string[]>([]),[picks,setPicks]=useState<string[]>([]),[purchaseCategories,setPurchaseCategories]=useState<Record<string,string>>({}),[choices,setChoices]=useState<Record<string,{category:string;max:string}>>({});
 const refresh=async()=>{const r=await financeDb.from('finance_merchant_preferences').select('id,merchant_key,category,currency,auto_approve,max_amount').order('updated_at',{ascending:false});if(r.error){setError('Merchant routines are unavailable. Refresh before saving.');return;}setPrefs(r.data||[]);setError('');};
 useEffect(()=>{void refresh();},[user?.id]);
 const own=useMemo(()=>{
  const excluded=new Set(offsets.flatMap(o=>[o.parent_transaction_id,o.offset_transaction_id]));
  for(const p of h.rawData.accountingPlans||[]){if(p.is_void)continue;for(const l of p.payments||[])excluded.add(l.transaction_id);if(p.disposal_transaction_id)excluded.add(p.disposal_transaction_id);}
  return transactions.filter(t=>t.user_id===user?.id&&!excluded.has(t.id)&&!closedForReview(t,h.data.documents||[],user?.id||'')&&!h.rawData.sharing.some(s=>s.account_id===t.account_id&&s.duplicate_of)&&!h.continuity.some(c=>(c.source_id===t.account_id&&t.date<c.starts_on)||(c.original_id===t.account_id&&t.date>=c.starts_on)));
 },[transactions,user?.id,h.rawData,h.data.documents,h.continuity,offsets]);
 const groups=useMemo(()=>merchantGroups(own,accounts).filter(g=>!g.transactions.some(isAmazonPurchase)),[own,accounts]);
 const amazon=useMemo(()=>own.filter(t=>isAmazonPurchase(t)&&routineEligible({...t,category:!t.category||['Other','Uncategorized'].includes(t.category)?'':t.category},accounts.find(a=>a.id===t.account_id))),[own,accounts]);
 useEffect(()=>{if(hash==='#amazon-purchase-review')setOpened(true);},[hash]);
 useEffect(()=>{if(opened&&hash==='#amazon-purchase-review'){const frame=requestAnimationFrame(()=>document.getElementById('amazon-purchase-review')?.scrollIntoView({block:'start'}));return()=>cancelAnimationFrame(frame);}},[opened,hash,amazon.length]);
 const options=[...new Set([...categories,'Groceries','Shopping','Entertainment','Services'])].filter(c=>!movementCategories.includes(c));
 const choice=(g:any)=>choices[g.id]||{category:g.mixed?'':g.category,max:String(g.max_amount)};
 const edit=(g:any,patch:Partial<{category:string;max:string}>)=>setChoices(c=>({...c,[g.id]:{...choice(g),...patch}}));
 const eligible=(g:any)=>g.transactions.filter((t:Transaction)=>t.amount<=Number(choice(g).max));
 const valid=(g:any)=>!!choice(g).category&&Number.isFinite(Number(choice(g).max))&&Number(choice(g).max)>0&&Number(choice(g).max)<1e9&&eligible(g).length>0;
 const selectedGroups=groups.filter(g=>selected.includes(g.id)),selectedPurchases=amazon.filter(t=>picks.includes(t.id)),count=selectedGroups.reduce((n,g)=>n+eligible(g).length,0)+selectedPurchases.length;
 const invalid=selectedGroups.some(g=>!valid(g))||selectedPurchases.some(t=>!purchaseCategories[t.id]);
 const toggle=(ids:string[],on:boolean)=>setSelected(s=>on?[...new Set([...s,...ids])]:s.filter(id=>!ids.includes(id)));
 const pick=(ids:string[],on:boolean)=>setPicks(s=>on?[...new Set([...s,...ids])]:s.filter(id=>!ids.includes(id)));
 const setCategory=(ids:string[],category:string)=>{setPurchaseCategories(s=>({...s,...Object.fromEntries(ids.map(id=>[id,category]))}));if(category)pick(ids,true);};
 const save=async()=>{
  if(!count||invalid||busy)return;setBusy(true);setError('');
  try{
   const r=await financeDb.rpc('finance_save_merchant_review_batch',{_routines:selectedGroups.map(g=>({key:g.key,category:choice(g).category,currency:g.currency,max:Number(choice(g).max),expected:eligible(g).map(reviewSnapshot)})),_purchases:selectedPurchases.map(t=>({category:purchaseCategories[t.id],expected:reviewSnapshot(t)}))});
   if(r.error)throw r.error;
   setSelected([]);setPicks([]);toast.success(`${r.data.purchases} purchases approved together. ${r.data.routines} merchant rules saved. Amazon decisions apply only to the selected purchases.`);
   await onChanged();await h.reload();await refresh();
  }catch(e:any){setError(e.message||'Could not confirm the batch. Refresh history before retrying.');toast.error('The batch could not be confirmed. Refresh before retrying.');}finally{setBusy(false);}
 };
 return <Card className="mb-6 border-primary/20"><CardHeader><CardTitle>Confirm repeat spending once</CardTitle><CardDescription>Across all open periods, review several merchants and approve them together. Keep mixed retailers separate from repeatable routines.</CardDescription></CardHeader><CardContent className="space-y-4">
 <div className="flex flex-wrap items-center gap-3"><Button variant={opened?'outline':'default'} disabled={h.loading||!!h.error||busy} onClick={()=>{setOpened(o=>!o);void refresh();}}>{opened?'Hide merchant groups':'Review common merchants'}</Button><p className="text-sm text-muted-foreground">{groups.length} recurring groups · {amazon.length} Amazon purchases to inspect</p></div>
 {error&&<div role="alert" className="space-y-2"><p className="text-sm text-destructive">{error}</p><Button variant="outline" size="sm" disabled={busy} onClick={async()=>{await onChanged();await h.reload();await refresh();}}>Refresh review</Button></div>}
 {opened&&<>
 <PatternAssistant groups={groups} busy={busy} hasDraft={id=>!!choices[id]} onSuggest={(id,category)=>{const g=groups.find(g=>g.id===id);if(g)edit(g,{category});}}/>
 <p className="text-sm text-muted-foreground">Check each category and amount limit, select the groups you want, then approve once below. Your review stays open afterward. Refunds, movements, individual corrections, special accounting and closed periods are excluded. Matching purchases under saved routine limits skip future review.</p>
 {amazon.length>0&&<a href="#amazon-purchase-review" className="inline-block text-primary underline text-sm">Review all Amazon purchases together ({amazon.length}) ↓</a>}
 {!!groups.length&&<Button size="sm" variant="outline" disabled={busy} onClick={()=>toggle(groups.slice(0,limit).filter(valid).map(g=>g.id),true)}>Select ready groups on this page</Button>}
 {!groups.length&&!amazon.length&&<p>No repeated eligible merchants remain. Use individual review for remaining exceptions.</p>}
 {groups.slice(0,limit).map(g=>{const c=choice(g),n=eligible(g).length;return <section className={`rounded-2xl border p-4 sm:p-5 space-y-4 ${selected.includes(g.id)?'border-primary bg-primary/5':''}`} key={g.id}>
 <div className="flex flex-wrap justify-between gap-2"><div><h3 className="font-semibold">{g.label}</h3><p className="text-sm text-muted-foreground">{g.count} purchases · typical {money(g.median,g.currency)}{g.mixed?' · category evidence varies; choose carefully':''}</p></div><label className="flex gap-2 text-sm items-center"><input type="checkbox" aria-label={'Select merchant '+g.label} disabled={busy||!valid(g)} checked={selected.includes(g.id)} onChange={e=>toggle([g.id],e.target.checked)}/>Include in approval</label></div>
 <details><summary className="cursor-pointer text-sm">Inspect purchases ({g.count})</summary><div className="mt-3 max-h-64 overflow-y-auto space-y-2">{[...g.transactions].sort((a:Transaction,b:Transaction)=>b.amount-a.amount).map((t:Transaction)=>{const a=accounts.find(a=>a.id===t.account_id);return <div key={t.id} className="border-t py-2 text-sm"><div className="flex justify-between gap-3"><span>{t.date} · {t.name}</span><span className="shrink-0">{money(t.amount,g.currency)}</span></div><p className="text-muted-foreground">{a?.provider_institution_name} · {a?.name}{a?.mask?' · ••'+a.mask:''} · {t.category||'Uncategorized'}{t.amount>Number(c.max)?' · remains for review':''}</p></div>;})}</div></details>
 <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor={'routine-category-'+g.id}>Categorize matching purchases as</Label><ChoiceField id={'routine-category-'+g.id} disabled={busy} value={c.category} onChange={e=>edit(g,{category:e.target.value})}><option value="">Choose a spending category</option>{options.map(o=><option key={o} value={o}>{o}</option>)}</ChoiceField></div><div className="space-y-2"><Label htmlFor={'routine-max-'+g.id}>Auto-approve up to ({g.currency})</Label><Input id={'routine-max-'+g.id} disabled={busy} inputMode="decimal" type="number" min="0.01" step="0.01" value={c.max} onChange={e=>edit(g,{max:e.target.value})}/></div></div>
 <p className="text-xs text-muted-foreground">Suggested limit: three times the typical purchase. {n} included; {g.count-n} remain for review. Review this limit before selecting the group. It is not a spending budget.</p>
 </section>;})}
 {groups.length>limit&&<Button variant="outline" onClick={()=>setLimit(n=>n+6)}>Show more merchants</Button>}
 {(amazon.length>0||hash==='#amazon-purchase-review')&&<div id="amazon-purchase-review" className="scroll-mt-4"><AmazonReview transactions={amazon} accounts={accounts} categories={options} selected={picks} choices={purchaseCategories} onSelect={pick} onCategory={setCategory} busy={busy}/></div>}
 <div aria-label="Merchant approval basket" className="sticky bottom-3 z-20 rounded-2xl border bg-background p-4 shadow-lg space-y-3"><p className="font-medium">{selectedGroups.length} merchant groups + {selectedPurchases.length} individual Amazon purchases · {count} purchases total</p><p className="text-xs text-muted-foreground">Only selected groups create future rules. Amazon classifications apply to selected purchases only. All approvals save together; if any preview is stale, none of the batch is applied.</p>{invalid&&<p className="text-sm text-amber-700">Finish the category and amount choices for selected items before approving.</p>}{(count>5000||selectedGroups.length>100)&&<p className="text-sm text-destructive">Approve up to 100 groups and 5,000 purchases at once.</p>}<div className="flex flex-wrap gap-2"><Button disabled={busy||h.loading||!!h.error||!!error||!count||invalid||count>5000||selectedGroups.length>100} onClick={save}>{busy?'Approving selections…':`Approve selected (${count})`}</Button><Button variant="ghost" disabled={busy||!count} onClick={()=>{setSelected([]);setPicks([]);}}>Clear selections</Button></div></div>
 <details><summary className="cursor-pointer font-medium">Saved routines ({prefs.filter(p=>p.auto_approve).length} active)</summary><div className="mt-3 space-y-3">{!prefs.length&&<p className="text-sm text-muted-foreground">Your confirmed routines will appear here.</p>}{prefs.map(p=><div key={p.id} className="flex flex-wrap items-center justify-between gap-3 border-t pt-3"><p className="text-sm">{p.merchant_key.replace(/^(merchant:|entity:|service:)/,'')} · {p.category} {p.auto_approve?'· auto-approve up to '+money(Number(p.max_amount),p.currency):'· automatic approval paused'}</p>{p.auto_approve&&<Button size="sm" variant="outline" disabled={busy} onClick={async()=>{setBusy(true);const r=await financeDb.rpc('finance_pause_merchant_routine',{_id:p.id});if(r.error)toast.error('Could not pause this routine.');else{await refresh();toast.success('Future imports will need review. Previously approved history is preserved.');}setBusy(false);}}>Pause auto-approval</Button>}</div>)}</div></details>
 </>}
 </CardContent></Card>;
}
