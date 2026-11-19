import {BudgetTargets} from '@/components/BudgetTargets';
import {useModules} from '@/hooks/useModules';
import {HouseholdTimeline} from '@/components/HouseholdTimeline';
import {ShareHouseholdAccounts} from '@/components/ShareHouseholdAccounts';
import {HouseholdLifecycle,HouseholdPlanning} from '@/components/HouseholdLifecycle';
import {LegacyBudgetMigration} from '@/components/LegacyBudgetMigration';
import {SeparationControls} from '@/components/AccountLifeChanges';
import { useState, useEffect } from 'react';
import { Link,useLocation } from 'react-router-dom';
import { format, addDays } from 'date-fns';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from '@/components/ui/alert-dialog';
import { PartnerPairing } from '@/components/settings/PartnerPairing';
import { useAuth } from '@/hooks/useAuth';
import { useHousehold, financeDb } from '@/hooks/useHousehold';
import { allocationAt } from '@/lib/household-finance';
import { toast } from 'sonner';
import type { Account } from '@/lib/types';
const accountIdentity=(a:Account)=>`${a.provider_institution_name?a.provider_institution_name+' · ':''}${a.name}${a.mask?` •••• ${a.mask.slice(-4)}`:''} · ${a.subtype||a.type}`;
export default function Household() {
 const {isEnabled}=useModules();
 const {user}=useAuth(); const {data,partnerId,loading,error,reload}=useHousehold();const route=useLocation();
 const initialAccount=new URLSearchParams(location.search).get('account');
 const [step,setStep]=useState(location.hash==='#timeline'||location.hash==='#budget'?4:location.hash==='#access'?2:5);
 const [budgetsOpen,setBudgetsOpen]=useState(location.hash==='#budget');
 const [splitSelection,setSplitSelection]=useState<string[]|null>(()=>initialAccount?[initialAccount]:null);
 const navigate=(target:number)=>{setStep(target===0||target===2?2:target===3||target===4?4:5);if(target===3)setBudgetsOpen(true);};
 useEffect(()=>{const requested=new URLSearchParams(route.search).get('account');if(requested){setSplitSelection([requested]);navigate(1);}else if(route.hash==='#budget')navigate(3);else if(route.hash==='#splits')navigate(1);else if(route.hash==='#timeline')navigate(4);else if(route.hash==='#access')navigate(2);},[route.hash,route.search]);
 const sections=[{id:5,title:'Accounts & splits',description:'Choose accounts, dates and responsibility.'},{id:2,title:'Partner access',description:'Link your partner and choose what they see.'},{id:4,title:'Timeline & planning',description:'Review changes, compare phases and set targets.'}];
 const today=format(new Date(),'yyyy-MM-dd');const [date,setDate]=useState(format(addDays(new Date(),1),'yyyy-MM-dd'));
 const [pct,setPct]=useState('50');const [included,setIncluded]=useState(true);const [note,setNote]=useState('Combining finances');const [initial,setInitial]=useState(false);const [preview,setPreview]=useState(false);const [busy,setBusy]=useState(false);
 const [account,setAccount]=useState('');const [share,setShare]=useState(false);const [from,setFrom]=useState(today);const [duplicate,setDuplicate]=useState('none');const [sharingPreview,setSharingPreview]=useState(false);
 const [category,setCategory]=useState('');const [budgetView,setBudgetView]=useState('mine');const [currency,setCurrency]=useState('USD');const [month,setMonth]=useState(today.slice(0,7));const [amount,setAmount]=useState('');
 useEffect(()=>{void reload();},[reload]);
 const own=data.accounts.filter(a=>a.user_id===user?.id&&!a.is_deleted);
 const splitOwn=own.filter(a=>splitSelection?splitSelection.includes(a.id):data.allocations.some(r=>r.account_id===a.id&&r.effective_from!=='0001-01-01'&&(r.effective_from>today||r.id===allocationAt(data.allocations,a.id,today)?.id)&&r.partner_id===partnerId&&(r.included||Number(r.owner_pct)<100||Number(r.balance_pct??r.owner_pct)<100)));
 const splitIds=splitOwn.map(a=>a.id);
 const selected=splitIds;
 useEffect(()=>setPreview(false),[splitIds.join(',')]);
 const selectAccount=(id:string)=>{setAccount(id);const s=data.sharing.find(s=>s.account_id===id);setShare(s?.enabled||false);setFrom(s?.history_from||today);setDuplicate(s?.duplicate_of||'none');};
 const run=async(name:string,args:any,success:string)=>{setBusy(true);try{const r=await financeDb.rpc(name,args);if(r.error)throw r.error;toast.success(success);await reload();return true;}catch(e:any){toast.error(e.message||'Unable to save');return false;}finally{setBusy(false);}};
 const schedule=async()=>{if(await run(initial?'finance_retroactive':'finance_schedule',{_accounts:selected,_date:date,_pct:Number(pct),_included:included,_note:note},'Dated arrangement saved')){setPreview(false);}};
 return <AppLayout>
  <PageHeader title="Household" description="Manage how you split finances and what you share, with history preserved." actions={<Button asChild variant="outline"><Link to="/?view=household&basis=comparable">View household reports</Link></Button>} />
  <nav aria-label="Household sections" className="flex flex-wrap gap-2 mb-3">{sections.map(section=><button type="button" key={section.id} aria-current={step===section.id?'page':undefined} onClick={()=>setStep(section.id)} className={`rounded-xl border px-4 py-2.5 text-left transition-colors ${step===section.id?'border-primary bg-primary/5':'hover:bg-muted/40'}`}><span className="block font-semibold">{section.title}</span></button>)}</nav><p className="text-sm text-muted-foreground mb-6">{sections.find(section=>section.id===step)?.description}</p>
  <div className="max-w-5xl mx-auto space-y-6">
   <div hidden={step!==5}><HouseholdLifecycle navigate={navigate} selectedAccounts={splitIds} onSelectedAccounts={setSplitSelection}/></div>
   <div hidden={step!==2}><PartnerPairing onChanged={reload}/></div>
   <div className="space-y-6">
    {loading?<p role="status">Loading arrangements…</p>:error?<p role="alert">{error} <Button variant="outline" onClick={reload}>Retry</Button></p>:<>
    <details hidden={step!==5} className="border rounded-lg p-4"><summary className="cursor-pointer font-medium">Advanced: custom bulk change without changing lifecycle phase</summary><Card className="mt-4"><CardHeader><CardTitle>Choose financial accounts for a bulk change</CardTitle><CardDescription>Choose a split starting today, in the future, or retroactively. Use retroactive setup to reflect how you actually shared finances in earlier periods.</CardDescription></CardHeader><CardContent className="space-y-5">
     <div className="rounded-lg bg-muted/40 p-4 space-y-2 text-sm"><p className="font-medium">Uses the {splitOwn.length} accounts selected above</p>{splitOwn.map(a=><p key={a.id}>{accountIdentity(a)}</p>)}{!splitOwn.length&&<p>Select the affected accounts above first.</p>}<Button variant="link" onClick={()=>document.getElementById('phase-date')?.scrollIntoView({behavior:'smooth',block:'center'})}>Change selected accounts</Button></div>
     <label className="flex items-center gap-3 text-sm"><Checkbox checked={initial} onCheckedChange={v=>{setInitial(v===true);setDate(today);}} />Apply a split retroactively</label>
     {initial&&<p className="text-sm text-muted-foreground">Choose any past start date, including for accounts you have already set up. This changes historical report allocations until the next saved arrangement for each account. A rule on the same date is replaced and retained in the audit history. Bank transaction amounts are unchanged. Sharing older transactions is configured in Partner access.</p>}
     <div className="grid sm:grid-cols-2 gap-4"><div className="space-y-2"><Label htmlFor="change-date">Effective date</Label><Input id="change-date" type="date" min={initial?undefined:today} max={initial?today:undefined} value={date} onChange={e=>setDate(e.target.value)} /></div><div className="space-y-2"><Label htmlFor="owner-share">My share (%)</Label><Input id="owner-share" type="number" min="0" max="100" value={pct} onChange={e=>setPct(e.target.value)} /></div></div>
     <p className="text-sm text-muted-foreground">Your partner’s share is {pct===''?'—':100-Number(pct)}%. Household total always counts an included account once at 100%. A 50/50 personal split is optional, even when finances are combined.</p>
     <label className="flex items-center gap-3 text-sm"><Checkbox checked={included} onCheckedChange={v=>setIncluded(v===true)} />Include these accounts in household reports</label>
     <div className="space-y-2"><Label htmlFor="change-label">Label (optional)</Label><Input id="change-label" value={note} maxLength={300} onChange={e=>setNote(e.target.value)} placeholder="Marriage, new split, separate finances…" /></div>
     {!partnerId&&<p className="text-sm text-muted-foreground">Link your partner before assigning a share to them. You can include your own accounts with a 100% personal share meanwhile.</p>}
     <Button disabled={busy||!selected.length||!date||(!initial&&date<today)||(initial&&date>today)||pct===''||Number(pct)<0||Number(pct)>100||(!partnerId&&Number(pct)!==100)} onClick={()=>setPreview(true)}>Preview change</Button>
    </CardContent></Card></details>
    {step===5&&<div className="flex flex-wrap gap-3"><Button variant="outline" onClick={()=>navigate(2)}>Review partner access</Button><Button variant="ghost" onClick={()=>navigate(4)}>View timeline</Button></div>}
    <Card hidden={step!==2}><CardHeader><CardTitle>Choose what your partner can see</CardTitle><CardDescription>You control access separately from expense splits. Choose a past start date to share older transactions, even if you linked your partner recently. Access begins when you confirm.</CardDescription></CardHeader><CardContent className="space-y-4">
     <ShareHouseholdAccounts/>
     <details className="border rounded-lg p-4"><summary className="cursor-pointer font-medium text-sm">Manage visibility or duplicates for one account</summary><div className="space-y-4 mt-4">
     <Select value={account} onValueChange={selectAccount}><SelectTrigger aria-label="Account to configure"><SelectValue placeholder="Choose one of your accounts" /></SelectTrigger><SelectContent>{own.map(a=><SelectItem key={a.id} value={a.id}>{accountIdentity(a)}</SelectItem>)}</SelectContent></Select>
     {account&&<><label className="flex items-center gap-3 text-sm"><Checkbox checked={share} disabled={!partnerId} onCheckedChange={v=>setShare(v===true)} />Share this account with my linked partner</label><div className="space-y-2"><Label htmlFor="history-start">Share transactions from (past dates allowed)</Label><Input id="history-start" type="date" disabled={!share} value={from} onChange={e=>setFrom(e.target.value)} /></div>
     <Button type="button" variant="outline" size="sm" disabled={!share||!data.transactions.some(t=>t.account_id===account)} onClick={()=>setFrom(data.transactions.filter(t=>t.account_id===account).map(t=>t.date).sort()[0])}>Use earliest imported transaction</Button><p className="text-sm text-muted-foreground">{from&&share?data.transactions.filter(t=>t.account_id===account&&t.date>=from).length.toLocaleString()+" currently imported transactions from "+from+" onward will be visible.":""}</p><p className="text-sm text-muted-foreground">Sharing includes the account’s current balance and transaction details from this date. Disabling stops future access and updates. Previously shared history may remain in your partner’s retained records. Historical split rules stay unchanged.</p>
     <div className="space-y-2"><Label>Duplicate bank connection</Label><Select value={duplicate} onValueChange={setDuplicate}><SelectTrigger aria-label="Primary copy for duplicate account"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">This is the primary copy</SelectItem>{data.accounts.filter(a=>a.id!==account&&!data.sharing.find(s=>s.account_id===a.id)?.duplicate_of).map(a=><SelectItem key={a.id} value={a.id}>Use {accountIdentity(a)} instead</SelectItem>)}</SelectContent></Select></div>
     <p className="text-sm text-muted-foreground">Mark a duplicate only after confirming it is the same real bank account. Its balances and transactions will be excluded from all household-engine reports while the primary copy is available. Choose the copy with complete history.</p>
     <Button variant="outline" disabled={busy||(share&&!from)} onClick={()=>setSharingPreview(true)}>Review sharing changes</Button></>}
    </div></details></CardContent></Card>
    <details hidden={step!==2} className="border rounded-xl p-4"><summary className="cursor-pointer font-medium">End expense sharing</summary><SeparationControls/></details>
    <div hidden={step!==4} className="space-y-6">
    {step===4&&<HouseholdTimeline navigate={navigate}/>}
    {isEnabled('everyday')&&<details className="rounded-xl border p-4"><summary className="cursor-pointer font-medium">Household budget targets</summary><div className="mt-4"><BudgetTargets/></div></details>}
    <details className="border rounded-xl p-4"><summary className="cursor-pointer font-medium">Compare phases &amp; reconcile your views</summary><div className="mt-4"><HouseholdPlanning/></div></details>
    <details className="border rounded-xl p-4"><summary className="cursor-pointer font-medium">How personal and household views work</summary><div className="space-y-3 text-sm mt-4"><p><strong>My share / Partner’s share:</strong> use the allocation effective on each transaction date.</p><p><strong>Comparable household:</strong> includes available history for the same selected accounts in every period.</p><p><strong>As recorded:</strong> includes accounts only once their household arrangement starts.</p><p className="text-muted-foreground">Choosing a report view does not grant access. Each person chooses what to share. Account ownership and bank connections stay unchanged.</p></div></details>
    </div>
    </>}
   </div>
  </div>
  <AlertDialog open={preview} onOpenChange={setPreview}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{initial?'Review retroactive split':'Review your dated arrangement'}</AlertDialogTitle><AlertDialogDescription>{initial?'This changes historical report totals. Any rule on the selected date is replaced; later dated rules are preserved.':''} From {date} until each account’s next saved arrangement, these accounts use a {pct}% / {100-Number(pct)}% split. Dates before {date} retain their existing rules. {included?'They will appear in household reports. Comparable household will also include their available earlier history.':'They stop appearing in the as-recorded household view from that date.'} This does not grant partner access.</AlertDialogDescription></AlertDialogHeader><div className="max-h-60 overflow-auto space-y-2">{own.filter(a=>selected.includes(a.id)).map(a=><p className="text-sm" key={a.id}>{accountIdentity(a)}: {allocationAt(data.allocations,a.id,date)?.owner_pct??100}% → {pct}% for you. {data.allocations.filter(r=>r.account_id===a.id&&r.effective_from>date).sort((a,b)=>a.effective_from.localeCompare(b.effective_from))[0]?.effective_from ? 'Next saved arrangement: '+data.allocations.filter(r=>r.account_id===a.id&&r.effective_from>date).sort((a,b)=>a.effective_from.localeCompare(b.effective_from))[0].effective_from : 'Continues until you add another arrangement.'}</p>)}</div><AlertDialogFooter><AlertDialogCancel disabled={busy}>Back</AlertDialogCancel><Button disabled={busy} onClick={schedule}>Confirm dated change</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
  <AlertDialog open={sharingPreview} onOpenChange={setSharingPreview}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Confirm account visibility</AlertDialogTitle><AlertDialogDescription>{share?`Your linked partner will see this account’s current balance and all available transactions, including historical and future imports, from ${from}.`:'Your partner will no longer receive live access or future updates. Previously shared history may remain in their retained records.'} {duplicate!=='none'?'This duplicate copy will also be excluded from reports when the primary copy is available.':'This account will be treated as a primary copy.'} No bank records are deleted.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>Back</AlertDialogCancel><Button disabled={busy} onClick={async()=>{if(await run('finance_share_account',{_account:account,_enabled:share,_from:from||null,_duplicate:duplicate==='none'?null:duplicate},'Account visibility saved'))setSharingPreview(false);}}>Confirm visibility</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
 </AppLayout>;
}
