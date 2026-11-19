import {accountingReport} from '@/lib/reporting-engine';
import {applyContinuity} from '@/lib/durable-history';
import {useState} from 'react';
import {Link} from 'react-router-dom';
import {format} from 'date-fns';
import {useAuth} from '@/hooks/useAuth';
import {financeDb,useHousehold} from '@/hooks/useHousehold';
import {analyticalReport,type ReportOptions} from '@/lib/household-finance';
import {closedForReview} from '../../../supabase/functions/_shared/review-periods';
import {confirmAction} from '../ui/confirm-action';
import {Card,CardHeader,CardTitle,CardDescription,CardContent} from '../ui/card';
import {Button} from '../ui/button';
import {ChoiceField} from '../ui/choice-field';
import {Label} from '../ui/label';
import {toast} from 'sonner';
import type {Transaction} from '@/lib/types';
type Quarter={start:string;end:string;label:string;total:number;open:number;remaining:number};
export function QuarterOnboarding({transactions,quarters,quarter,onQuarter,onChanged,loading}:{transactions:Transaction[];quarters:Quarter[];quarter?:Quarter;onQuarter:(date:string)=>void;onChanged:()=>Promise<void>;loading:boolean}){
 const {user}=useAuth();const h=useHousehold();const [busy,setBusy]=useState(false);const today=format(new Date(),'yyyy-MM-dd');const finished=quarters.filter(q=>!q.open).length;
 const closedWaiting=transactions.filter(t=>t.needs_review&&closedForReview(t,h.data.documents||[],user?.id||'')).length;
 const close=async()=>{
  if(!quarter||!user||quarter.remaining||quarter.end>=today)return;
  if(!await confirmAction(`Close ${quarter.label}? Confirm you have imported the available statements and reviewed this quarter. This saves an immutable private snapshot across your imported accounts and currencies. Later data remains visible as restatements. You cannot delete or overwrite this close.`))return;
  setBusy(true);
  try{
   // Server checks the exact source versions and review state before saving.
   const accountIds=[...new Set(transactions.filter(t=>t.user_id===user.id&&!t.pending&&t.date>=quarter.start&&t.date<=quarter.end).map(t=>t.account_id).filter(Boolean))];
   const currentData=applyContinuity({...h.rawData,transactions:[...h.rawData.transactions.filter(t=>t.user_id!==user.id),...transactions.filter(t=>t.user_id===user.id)]},h.continuity);
   const reportAccountIds=[...new Set(currentData.transactions.filter(t=>t.user_id===user.id&&t.date>=quarter.start&&t.date<=quarter.end).map(t=>t.account_id).filter(Boolean))];
   const options:ReportOptions={userId:user.id,partnerId:h.partnerId,linkId:h.linkId,view:'mine',basis:'recorded',currency:'USD',start:quarter.start,end:quarter.end,normalized:false,accountIds:reportAccountIds};
   const currencies=[...new Set(currentData.accounts.filter(a=>reportAccountIds.includes(a.id)).map(a=>a.currency||'USD'))];
   if(currencies.length)options.currency=currencies[0];
   const reports=currencies.map(currency=>{const r=analyticalReport(currentData,{...options,currency});return {currency,accounting:accountingReport(currentData,{...options,currency}),income:r.income,expenses:r.expenses,netCash:r.netCash,lines:r.lines,rows:r.rows,recordCount:r.count};});
   const r=analyticalReport(currentData,options);
   const snapshot={...currentData,documents:[]};
   const payload={version:4,accounting:accountingReport(currentData,options),cadence:'quarter',options,income:r.income,expenses:r.expenses,netCash:r.netCash,rows:r.rows,lines:r.lines,recordCount:r.count,reports,snapshot,capturedAt:new Date().toISOString(),reviewScope:{version:1,ownerId:user.id,start:quarter.start,end:quarter.end,accountIds},coverage:'All posted imported records in the listed accounts, across currencies. Missing history is not zero.'};
   const expected=transactions.filter(t=>t.user_id===user.id&&!t.pending&&t.date>=quarter.start&&t.date<=quarter.end).map(t=>({id:t.id,updated_at:(t as any).updated_at}));
   const result=await financeDb.rpc('finance_close_review_quarter',{_payload:payload,_expected:expected});if(result.error)throw result.error;
   await onChanged();await h.reload();toast.success(`${quarter.label} closed. Your next open quarter is ready.`);
  }catch{await onChanged();await h.reload();toast.error('Could not close this quarter. Check remaining reviews and refresh; changed source records must be reviewed before retrying.');}finally{setBusy(false);}
 };
 return <Card className="mb-6 border-primary/30" id="quarter-onboarding"><CardHeader><CardTitle>Review this quarter</CardTitle><CardDescription>Confirm familiar spending, review exceptions, then hold a close.</CardDescription></CardHeader><CardContent className="space-y-4">
 {loading||h.loading?<p>Loading your review progress…</p>:h.error?<p role="alert">{h.error}</p>:!quarters.length?<p>Connect an account or import a statement to start reviewing your history.</p>:<><p className="text-sm text-muted-foreground">{finished} of {quarters.length} quarters with imported activity closed. Closed periods stay out of your review queue.</p>
 {quarter?<><div className="flex flex-wrap items-end gap-4"><div className="space-y-2"><Label htmlFor="review-quarter">Quarter to review</Label><ChoiceField id="review-quarter" value={quarter.start} onChange={e=>onQuarter(e.target.value)} disabled={busy}>{quarters.filter(q=>q.open>0).map(q=><option key={q.start} value={q.start}>{q.label} · {q.remaining} to review{q.end>=today?' · in progress':''}</option>)}</ChoiceField></div><Button disabled={busy||quarter.remaining>0||quarter.end>=today||loading||h.loading||!!h.error} onClick={close}>{busy?'Saving close…':`Close ${quarter.label} & continue`}</Button></div><p className="font-medium">{quarter.label}: {quarter.remaining} to review · {quarter.open} open posted transactions</p><p className="text-sm text-muted-foreground">{quarter.remaining?'Use categorization suggestions, then review the remaining transactions below. Search and account filters do not reduce the review requirement for closing.':quarter.end>=today?'Reviews are up to date. This quarter can be closed after its last day.':'Reviews are complete. Confirm your imported history is complete before closing this quarter.'}</p></>:<p className="font-medium">Your imported history is closed and up to date. New open periods or newly added accounts will appear here automatically.</p>}
 {closedWaiting>0&&<p className="text-sm">{closedWaiting} flagged records are inside a closed period and are excluded from this queue. Inspect later imports and corrections in restatements or All Transactions.</p>}
 <details className="text-sm"><summary className="cursor-pointer font-medium">How closing protects your history</summary><p className="mt-2 text-muted-foreground">Closing holds an immutable snapshot. Later imports, refunds and corrections remain visible as restatements. Pending transactions wait until they post, and each currency is held separately. Your partner reviews their own records.</p></details><Button asChild variant="link" className="px-0"><Link to="/close#period-close">View held closes and restatements</Link></Button></>}
 </CardContent></Card>;
}
