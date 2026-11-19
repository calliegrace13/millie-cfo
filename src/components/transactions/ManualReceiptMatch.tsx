import {useState} from 'react';
import type {Account,Transaction} from '@/lib/types';
import {Input} from '@/components/ui/input';
import {Button} from '@/components/ui/button';
import {ChoiceField} from '@/components/ui/choice-field';

export function ManualReceiptMatch({transactions,accounts,categories,disabled,onCategory}:{transactions:Transaction[];accounts:Account[];categories:string[];disabled:boolean;onCategory:(ids:string[],category:string)=>void}){
 const [search,setSearch]=useState(''),[selected,setSelected]=useState(''),[category,setCategory]=useState(''),[message,setMessage]=useState('');
 const account=(t:Transaction)=>accounts.find(a=>a.id===t.account_id);
 const label=(t:Transaction)=>{const a=account(t);return `${t.date} · ${t.merchant_name||t.name} · ${a?.currency||''} ${Math.abs(t.amount).toFixed(2)} · ${a?.provider_institution_name||''} ${a?.name||t.account_name||''}${a?.mask?' ••'+a.mask:''}`;};
 const matching=transactions.filter(t=>label(t).toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
 const purchase=transactions.find(t=>t.id===selected);
 return <section className="rounded-xl border bg-background p-4 space-y-3" aria-label="Match a receipt yourself">
  <div><h3 className="font-semibold">Choose the purchase and category</h3><p className="text-sm text-muted-foreground mt-1">Read the receipt above, then compare its date, merchant, amount and card with an open purchase. Your choice joins the review basket below.</p></div>
  <label className="block text-sm space-y-1"><span>Find a purchase</span><Input aria-label="Find a purchase for this receipt" placeholder="Merchant, date, amount or card" value={search} disabled={disabled} onChange={e=>{setSearch(e.target.value);setSelected('');setMessage('');}}/></label>
  <label className="block text-sm space-y-1"><span>Matching purchase</span><ChoiceField aria-label="Purchase for manual receipt review" value={selected} disabled={disabled} onChange={e=>{setSelected(e.target.value);setMessage('');}}><option value="">Choose a purchase</option>{matching.slice(0,100).map(t=><option key={t.id} value={t.id}>{label(t)}</option>)}</ChoiceField></label>
  {matching.length>100&&<p className="text-xs text-muted-foreground">Showing the first 100 purchases. Narrow your search to find the right one.</p>}
  {!matching.length&&<p className="text-sm text-muted-foreground">No open purchase matches. It may be outside the transaction date window, already reviewed, or in a closed period. Use Find &amp; edit for previously reviewed purchases.</p>}
  {purchase&&<p className="text-sm">{label(purchase)} · Current category: {purchase.category||'Uncategorized'}</p>}
  <label className="block text-sm space-y-1"><span>Category from your receipt</span><ChoiceField aria-label="Manual receipt category" value={category} disabled={disabled} onChange={e=>setCategory(e.target.value)}><option value="">Choose a category</option>{categories.map(c=><option key={c} value={c}>{c}</option>)}</ChoiceField></label>
  <Button disabled={disabled||!purchase||!categories.includes(category)} onClick={()=>{if(!purchase)return;onCategory([purchase.id],category);setMessage('Added to the review basket. Add another purchase, or approve the basket below.');setSelected('');}}>Add to review basket</Button>
  <p role="status" className="text-sm">{message}</p><p className="text-xs text-muted-foreground">This saves a category and review decision when you approve the basket. It does not upload a receipt attachment, split a mixed purchase, or change amounts, dates or closed reports.</p>
 </section>;
}
