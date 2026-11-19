import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {Link} from 'react-router-dom';
import {useAuth} from '@/hooks/useAuth';
import {financeDb} from '@/hooks/useHousehold';
import {Button} from '@/components/ui/button';
import {emailRequest} from './EmailReceiptInbox';
import {ManualReceiptMatch} from './ManualReceiptMatch';
import type {Account,Transaction} from '@/lib/types';

type Question={source_key:string;name:string;reason:string;email_id:string|null};
type Props={transactions:Transaction[];accounts:Account[];categories:string[];disabled:boolean;onCategory:(ids:string[],category:string)=>void};
export function ReceiptQuestions({review}:{review?:Props}){
 const {user}=useAuth();
 const queue=useQuery({queryKey:['receipt-questions',user?.id],enabled:!!user,refetchInterval:15000,queryFn:async()=>{
  const r=await financeDb.rpc('finance_receipt_review_queue');
  if(r.error)throw Error('Receipt questions could not load.');
  return r.data as Question[];
 }});
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[preview,setPreview]=useState<{key:string;text:string}|null>(null);
 async function act(fn:()=>Promise<void>){setBusy(true);setMessage('');try{await fn();}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}
 if(queue.error)return <p role="alert" className="text-sm">Receipt questions could not load. <button className="underline" onClick={()=>queue.refetch()}>Try again</button></p>;
 if(!queue.data?.length)return null;
 if(!review)return <Link className="block rounded-xl border p-4 text-sm text-primary" to="/receipts#receipt-questions">Review {queue.data.length} receipt {queue.data.length===1?'question':'questions'} →</Link>;
 return <section id="receipt-questions" className="space-y-3 rounded-2xl border bg-card p-5" aria-label="Receipt questions">
  <h2 className="font-semibold">Receipt questions · {queue.data.length}</h2>
  <p className="text-sm text-muted-foreground">Millie checked these receipts and needs your help. The rest of the batch can continue. Reviewing a receipt here uses no AI requests.</p>
  {queue.data.map(q=><details key={q.source_key} className="rounded-xl border p-4"><summary className="cursor-pointer text-sm font-medium">{q.name}</summary>
   <div className="mt-3 space-y-3"><p className="text-sm">{q.reason}</p>
   {q.email_id&&<Button size="sm" variant="outline" disabled={busy} onClick={()=>act(async()=>{const r=await emailRequest({action:'load',ids:[q.email_id]});setPreview({key:q.source_key,text:r.sources[0].text});})}>Read original email</Button>}
   {preview?.key===q.source_key&&<pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-muted p-3 text-xs">{preview.text}</pre>}
   <ManualReceiptMatch {...review}/>
   <Button size="sm" variant="outline" disabled={busy} onClick={()=>act(async()=>{const r=await financeDb.rpc('finance_finish_receipt_review',{_key:q.source_key});if(r.error)throw Error('Could not finish this receipt review.');await queue.refetch();})}>Dismiss this question</Button>
   </div></details>)}
  {message&&<p role="alert" className="text-sm">{message}</p>}
 </section>;
}
