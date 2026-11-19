import {closedForReview} from './review-periods.ts';
import {connectedContextSources} from './connected-context.ts';
// This service sees only owned data. Shared household data is not consent to send
// a partner's records to another person's AI provider.
export async function assistantContext(client:any,owner:string,module:string,start:string,end:string,transactionIds?:string[],includeReceipts=false){
 const rows=async(table:string,column='owner_id',columns='*')=>{const r=await client.from(table).select(columns).eq(column,owner).order(table==='finance_account_sharing'?'account_id':'id').limit(500);if(r.error)throw Error('Could not load evidence. No analysis was started.');return r.data||[];};
 const [accounts,transactions,docs,plans,sharing,continuity,offsets]=await Promise.all([
  rows('accounts','user_id','id,user_id,name,type,currency,is_deleted,current_balance'),
  (async()=>{let query=client.from('transactions').select('id,user_id,account_id,name,merchant_name,date,amount,category,pending,updated_at,needs_review,classification_locked,classification_source,classification_kind,linked_transfer_id,is_amortized,is_one_time_expense,is_non_gaap_adjustment,recognition_date,is_transfer_exception,cash_flow_type').eq('user_id',owner).gte('date',start).lte('date',end).order('date',{ascending:false}).order('id').limit(201);if(transactionIds?.length)query=query.in('id',transactionIds);const r=await query;if(r.error)throw Error('Could not load transaction evidence.');return r.data||[];})(),
  rows('finance_documents'),rows('finance_accounting_plans'),rows('finance_account_sharing'),rows('finance_account_continuity'),
  (async()=>{const r=await client.from('transaction_offsets').select('parent_transaction_id,offset_transaction_id').limit(1000);if(r.error)throw Error('Could not check linked purchases.');return r.data||[];})()
 ]);
 const omitted=transactions.length>200;const selected=transactions.slice(0,200);
 const assigned=new Set(plans.filter((p:any)=>!p.is_void).flatMap((p:any)=>[...p.payments.map((l:any)=>l.transaction_id),p.disposal_transaction_id]));
 const excluded=new Set(offsets.flatMap((o:any)=>[o.parent_transaction_id,o.offset_transaction_id]));
 const tx=selected.filter((t:any)=>!sharing.some((s:any)=>s.account_id===t.account_id&&s.duplicate_of)&&!continuity.some((c:any)=>(c.source_id===t.account_id&&t.date<c.starts_on)||(c.original_id===t.account_id&&t.date>=c.starts_on))).map((t:any)=>{
  const a=accounts.find((a:any)=>a.id===t.account_id),closed=closedForReview(t,docs,owner);
  const eligible=!!a&&!a.is_deleted&&!['loan','investment'].includes(a.type)&&t.amount>0&&!t.pending&&t.needs_review&&!closed&&!assigned.has(t.id)&&!excluded.has(t.id)&&!t.classification_locked&&!['user','rule'].includes(t.classification_source)&&!t.linked_transfer_id&&!t.is_amortized&&!t.is_one_time_expense&&!t.is_non_gaap_adjustment&&!t.recognition_date&&!t.is_transfer_exception&&(!t.cash_flow_type||t.cash_flow_type==='operating')&&!['income','transfer','card_payment','debt_payment','refund'].includes(t.classification_kind)&&!['Income','Transfer','Credit Card Payment','Debt Payment','Reimbursement','Settlement'].includes(t.category)&&!/\b(payment|pymt|pmt|autopay|transfer|xfer|payroll|salary|paycheck|refund|reversal|chargeback)\b/i.test(t.name||'');
  return {id:t.id,account_id:t.account_id,merchant:t.merchant_name||t.name,date:t.date,amount:Number(t.amount),currency:a?.currency||'USD',category:t.category,needs_review:t.needs_review,closed,pending:t.pending,eligible};
 });
 const budgets=await rows('finance_budget_versions');
 const readLearning=async()=>{const r=await client.from('finance_learning_state').select('revision').eq('owner_id',owner).maybeSingle();if(r.error)throw Error('Could not load learned policies. No analysis was started.');return r.data?.revision||0;};
 const learningState=await readLearning();
 const [learningPolicies,answers]=await Promise.all([rows('finance_learning_policies'),(async()=>{if(!tx.length)return [];const r=await client.from('finance_assistant_items').select('id,revision,answer,status,payload').eq('owner_id',owner).neq('answer','').in('payload->>transaction_id',tx.map((t:any)=>t.id)).order('updated_at',{ascending:false}).limit(101);if(r.error||r.data.length>100)throw Error('Could not load complete saved answers. Choose a smaller window.');return r.data;})()]);
 if(await readLearning()!==learningState)throw Error('Your policies changed while evidence was loading. Try again.');
 const sources:{name:string;text:string}[]=[{name:'Scope',text:JSON.stringify({start,end,scope:'Owned accounts only, full account amounts before personal/partner allocation. Do not label these as personal-share or household totals.',selection:omitted?'Most recent 200 transactions; older activity omitted':'Up to 200 transactions in this window',otherRecords:'Each collection is bounded to 500 records; verify completeness in its module. No credentials or account numbers included.'})}];
 // Individual purchase sources let the validator require direct ID evidence.
 for(const t of tx.filter((t:any)=>t.eligible).slice(0,40))sources.push({name:'Purchase '+t.date,text:JSON.stringify(t)});
 const overview=tx.reduce((out:any,t:any)=>{if(t.pending)return out;const k=t.currency+' / '+(t.category||'Unknown');out[k]=(out[k]||0)+t.amount;return out;},{});
 sources.push({name:'Window overview',text:JSON.stringify({categoryActivity:overview,transactionsInScope:tx.length,unreviewed:tx.filter((t:any)=>t.needs_review&&!t.closed).length,accounts:accounts.map(({user_id,...a}:any)=>a)})});
 const context:any={};
 if(['everyday','analyst','close'].includes(module))context.budgets=budgets;
 if(['assets','close','analyst'].includes(module))context.accountingPlans=plans;
 if(module==='runway'){context.cashPlans=await rows('finance_cash_plans');context.recurring=await rows('recurring_transactions','user_id');}
 if(module==='household'){context.allocations=await rows('finance_allocations');context.sharing=sharing.map(({recipient_id,owner_id,...s}:any)=>s);}
 if(['goals','close','longterm'].includes(module))context.documents=docs.filter((d:any)=>module==='close'?d.kind==='close':['goal','project','scenario'].includes(d.kind)).map((d:any)=>({id:d.id,name:d.name,kind:d.kind,payload: d.kind==='close'?{reviewScope:d.payload?.reviewScope}:d.payload}));
 if(['income','investments','debt','longterm'].includes(module)){const r=await rows('finance_module_records');context.records=r.filter((r:any)=>r.domain===({income:'income',investments:'investments',debt:'debt',longterm:'long_term'} as any)[module]||r.domain===module);}
 if(['watchlists','recoveries'].includes(module))context.records=(await rows('finance_focus_records')).filter((r:any)=>r.domain===module);
 if(module==='rewards'){context.cards=await rows('credit_cards','user_id');context.benefits=await rows('credit_card_benefits','user_id');context.usage=await rows('benefit_usage','user_id');context.note='Recorded benefit details may be stale; do not infer enrollment or eligibility from a generic account label.';}
 const safe=JSON.stringify(context);if(safe.length<=15000)sources.push({name:'Existing module configuration',text:safe});else sources.push({name:'Existing module configuration',text:'Configuration exceeds the context limit. Ask the user which existing record to review; do not claim it is absent.'});
 for(const p of learningPolicies.filter((p:any)=>p.enabled&&(p.module==='all'||p.module===module)&&p.starts_on<=end&&(!p.ends_on||p.ends_on>=start)))sources.push({name:'Your confirmed policy',text:JSON.stringify(p)});
 // A saved answer remains useful after its original work item is completed.
 // Bind it to its purchase; never borrow coverage facts from another purchase.
 for(const a of answers.filter((a:any)=>a.answer?.trim()&&a.status!=='dismissed'&&tx.some((t:any)=>t.id===a.payload?.transaction_id)))sources.push({name:'Your answers',text:JSON.stringify({transaction_id:a.payload.transaction_id,question:a.payload.question,answer:a.answer,answer_revision:a.revision})});
 sources.push(...await connectedContextSources(client,owner,tx.map((t:any)=>t.id),includeReceipts));
 const snapshot={learning_revision:learningState,answer_values:Object.fromEntries(answers.map((a:any)=>[a.id,a.answer])),transactions:Object.fromEntries(selected.map((t:any)=>[t.id,{id:t.id,updated_at:t.updated_at,amount:t.amount,date:t.date,account_id:t.account_id,category:t.category??null}])),budgets};
 return {sources,learningPolicies,transactions:tx.filter((t:any)=>t.eligible).slice(0,40),snapshot,merchants:[...new Set(tx.filter((t:any)=>t.eligible).map((t:any)=>String(t.merchant).replace(/\d+/g,'').replace(/[^\p{L} .&'-]/gu,'').trim()).filter((n:string)=>n.length>=3&&n.length<=60))].slice(0,3)};
}
