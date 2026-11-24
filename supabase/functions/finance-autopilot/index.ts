import {categoryMayAutoApply} from '../_shared/learning-policy.ts';
import {serve} from 'https://deno.land/std@0.168.0/http/server.ts';
import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
import {workerClient} from '../_shared/worker-context.ts';
import {timingCandidate} from '../_shared/autopilot-plan.ts';
import {workflowPlan} from '../_shared/workflow-plan.ts';
import {digest,stageId} from '../_shared/assistant-provider.ts';
import {receiptMatches} from '../_shared/receipt-matching.ts';
import {receiptCategories} from '../_shared/receipt-contract.ts';
import {closedForReview} from '../_shared/review-periods.ts';
const env=(key:string)=>Deno.env.get(key)||'';
serve(async req=>{
 const origin=req.headers.get('origin')||'',allowed=env('MILLIE_ALLOWED_ORIGINS').split(',').map(s=>s.trim());
 const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','Access-Control-Allow-Origin':allowed.includes(origin)?origin:'','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS'};
 const reply=(v:unknown,status=200)=>new Response(JSON.stringify(v),{headers,status});
 if(origin&&!allowed.includes(origin))return reply({error:'Origin not allowed'},403);if(req.method==='OPTIONS')return reply({});if(req.method!=='POST')return reply({error:'Method not allowed'},405);
 let owner='',lease='',workId='';let admin:any;
 try{
  const raw=await req.text();if(raw.length>2000)throw Error('Request is too large.');const body=JSON.parse(raw);
  if(!['step','retry','skip','recheck'].includes(body.action))throw Error('Choose an automatic work action.');
  admin=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'));
  const background=typeof body.workerOwner==='string';
  let client:any=createClient(env('SUPABASE_URL'),env('SUPABASE_ANON_KEY'),{global:{headers:{Authorization:req.headers.get('authorization')||''}}});
  if(background){
   if(origin||body.action!=='step'||!/^[0-9a-f-]{36}$/i.test(body.workerOwner))return reply({error:'Automatic work authorization is invalid.'},403);
   const ok=await admin.rpc('finance_scheduler_authorized',{_token:(req.headers.get('authorization')||'').replace(/^Bearer /,'')});
   if(ok.error||ok.data!==true)return reply({error:'Automatic work authorization is invalid.'},403);
   owner=body.workerOwner;
   const preference=await admin.from('finance_autopilot_settings').select('enabled,background_enabled').eq('owner_id',owner).single();if(preference.error||!preference.data.enabled||!preference.data.background_enabled)return reply({paused:true});
  }else{const auth=await client.auth.getUser();if(auth.error||!auth.data.user)return reply({error:'Sign in to continue automatic work.'},401);owner=auth.data.user.id;}
  if(body.action==='recheck'){
   await admin.from('finance_autopilot_settings').update({failure_count:0,next_run_at:new Date().toISOString()}).eq('owner_id',owner);
   const failed=await admin.from('finance_autopilot_work').select('id').eq('owner_id',owner).eq('status','failed').limit(1);if(failed.error)throw Error('Your saved work could not be checked.');if(failed.data.length)throw Error('A saved task needs review before retrying.');
   const r=await admin.from('finance_autopilot_settings').update({status:'ready',summary:'Rechecking saved evidence.'}).eq('owner_id',owner).eq('enabled',true).eq('status','error');if(r.error)throw Error('Your saved work could not be refreshed.');return reply({ok:true});
  }
  if(body.action!=='step'){
   if(typeof body.id!=='string'||!/^[0-9a-f-]{36}$/i.test(body.id))throw Error('Choose a saved work item.');
   const prior=await admin.from('finance_autopilot_work').select('request_id').eq('owner_id',owner).eq('id',body.id).eq('status','failed').single();if(prior.error)throw Error('This work changed. Refresh first.');
   const research=await admin.from('finance_ai_receipt_runs').select('status').eq('owner_id',owner).eq('request_id',await stageId(prior.data.request_id,'research')).maybeSingle();if(research.error)throw Error('Your earlier research could not be checked.');if(body.action==='retry'&&research.data?.status==='running')throw Error('An analysis is still running. Wait before checking this task.');
   const paid=await admin.from('finance_ai_receipt_runs').select('status').eq('owner_id',owner).eq('request_id',prior.data.request_id).maybeSingle();if(paid.error)throw Error('Your previous analysis could not be checked.');if(body.action==='retry'&&paid.data?.status==='running')throw Error('An analysis is still running. Wait before checking the same work again.');
   const r=await admin.from('finance_autopilot_work').update(body.action==='retry'?{status:'running',request_id:paid.data?.status==='succeeded'?prior.data.request_id:crypto.randomUUID(),result:{},summary:'Retry explicitly authorized',updated_at:new Date().toISOString()}:{status:'skipped',result:{manualSkip:true},summary:'Left for manual review',updated_at:new Date().toISOString()}).eq('owner_id',owner).eq('id',body.id).eq('status','failed').select('id');
   if(r.error||!r.data?.length)throw Error('This work changed. Refresh first.');
   await admin.from('finance_autopilot_settings').update({status:'ready',failure_count:0,next_run_at:new Date().toISOString(),summary:'Ready to continue.'}).eq('owner_id',owner);return reply({ok:true});
  }
  // Old open tabs may still send ticks. Once opted in, only the scheduler executes.
  if(!background){const existing=await admin.from('finance_autopilot_settings').select('background_enabled,status,summary').eq('owner_id',owner).maybeSingle();if(existing.error)throw Error('Your automatic work settings could not load.');if(existing.data?.background_enabled)return reply({status:existing.data.status,summary:existing.data.summary});}
  const begin=await admin.rpc('finance_autopilot_begin',{_owner:owner});if(begin.error)throw Error('Automatic work could not be locked.');if(!begin.data?.lease)return reply(begin.data);const settings=begin.data;lease=settings.lease;if(background)client=workerClient(admin,owner,lease);
  const end=async(status:string,summary:string,attention:any[]=[])=>{const r=await admin.rpc('finance_autopilot_end',{_owner:owner,_lease:lease,_status:status,_summary:summary,_attention:attention});if(r.error)throw Error('Automatic work status could not be saved.');lease='';return reply({status,summary,attention});};
  const status=await client.rpc('finance_ai_status');if(status.error)throw Error('Your AI budget could not be checked.');const connection=status.data?.connections?.find((c:any)=>c.provider===status.data.active);
  if(!connection)return end('needs_input','Connect an AI provider to continue.',[{title:'Connect your AI',href:'/customize#ai-assistant'}]);
  if(connection.provider!==settings.provider||connection.model!==settings.model)return end('needs_input','Your provider or model changed. Review and re-enable automatic work before sending more evidence.',[{title:'Review the new provider',href:'/customize#ai-assistant'}]);
  const rpc=async(name:string,args:any)=>{const r=await client.rpc(name,args);if(r.error)throw Error(r.error.message);return r.data;};
  // Browser requests keep caller auth. Background requests carry the scheduler
  // credential plus an expiring, owner-bound lease, verified by every service.
  const call=async(fn:string,input:any)=>{
   const current=await admin.from('finance_autopilot_settings').select('enabled,revision').eq('owner_id',owner).single();
   if(current.error||!current.data.enabled||current.data.revision!==settings.revision)throw Error('Automatic work was paused or settings changed.');
   const r=await fetch(env('SUPABASE_URL')+'/functions/v1/'+fn,{method:'POST',headers:{Authorization:req.headers.get('authorization')||'',apikey:env('SUPABASE_ANON_KEY'),'Content-Type':'application/json',...(origin?{Origin:origin}:{}),...(background?{'x-millie-owner':owner,'x-millie-lease':lease}:{})},body:JSON.stringify(input),signal:AbortSignal.timeout(140000)});
   const d=await r.json();if(!r.ok||d.error)throw Error(d.error||'The task could not finish.');return d;
  };
  const rows=async(table:string,columns='*',column='owner_id',useClient=false)=>{const out:any[]=[];for(let offset=0;offset<=5000;offset+=1000){let q=(useClient?client:admin).from(table).select(columns).order(table==='finance_account_sharing'?'account_id':table==='finance_cash_settings'?'currency':table==='finance_ai_policies'?'module':'id').range(offset,offset+999);if(column)q=q.eq(column,owner);const r=await q;if(r.error){console.error('autopilot_evidence_read',{table,code:r.error.code||'unknown'});throw Error(table==='finance_ai_policies'?'Your AI task settings could not be loaded. No new analysis was started.':'Your saved financial evidence could not be loaded. No new analysis was started.');}out.push(...r.data);if(out.length>5000)throw Error('This history needs a narrower review window. Open quarterly review.');if(r.data.length<1000)return out;}return out;};
  const [accounts,transactions,documents,plans,sharing,continuity,offsets,policies,work,items,emails,mail,modules,learningPolicies]=await Promise.all([
   rows('accounts','id,user_id,name,type,currency,is_deleted','user_id'),rows('transactions','*','user_id'),rows('finance_documents'),rows('finance_accounting_plans'),rows('finance_account_sharing'),rows('finance_account_continuity'),rows('transaction_offsets','parent_transaction_id,offset_transaction_id,id','',true),rows('finance_ai_policies'),rows('finance_autopilot_work'),rows('finance_assistant_items'),
   (async()=>{const r=await admin.from('finance_email_receipts').select('id,sent_at,created_at').eq('owner_id',owner).eq('dismissed',false).gt('expires_at',new Date().toISOString()).order('sent_at').limit(5000);if(r.error)throw Error('Your receipt queue could not load.');return r.data||[];})(),
   (async()=>{const r=await admin.from('finance_email_connections').select('auto_sync,last_synced_at,sync_cursor,window_days').eq('owner_id',owner).maybeSingle();if(r.error)throw Error('Your Gmail preferences could not load.');return r.data;})(),
   (async()=>{const r=await client.from('finance_module_preferences').select('enabled_modules').eq('owner_id',owner).maybeSingle();if(r.error)throw Error('Your module choices could not load.');return r.data?.enabled_modules||['everyday','runway','goals','analyst','household','close','assets','rewards','income','investments','debt','longterm','watchlists','recoveries'];})(),rows('finance_learning_policies')
  ]);
  const [budgets,cashSettings,moduleRecords,contextRecords]=await Promise.all([rows('finance_budget_versions'),rows('finance_cash_settings','*'),rows('finance_module_records'),settings.workflow_scope==='all_enabled'?rows('finance_context_records','id,revision,updated_at'):Promise.resolve([])]);
  const setupMissing={everyday:!budgets.length,runway:!cashSettings.length,goals:!documents.some((d:any)=>['goal','project'].includes(d.kind)),household:!sharing.length,income:!moduleRecords.some((r:any)=>r.domain==='income'),debt:!moduleRecords.some((r:any)=>r.domain==='debt'),investments:!moduleRecords.some((r:any)=>r.domain==='investments'),longterm:!moduleRecords.some((r:any)=>r.domain==='long_term')};
  const unified=settings.workflow_scope==='all_enabled';
  const plan=workflowPlan({workflowScope:settings.workflow_scope,owner,accounts,transactions,documents,plans,sharing,continuity,offsets,policies,modules,work,items,emails,connection:mail,setupMissing,learningPolicies,budgets,cashSettings,moduleRecords,contextRecords,now:Date.now()});
  const canReceipt=policies.some((p:any)=>p.module==='transactions'&&p.mode==='ai'&&p.tasks.includes('receipts'));
  const autoReceipt=canReceipt&&policies.some((p:any)=>p.module==='transactions'&&p.auto_tasks.includes('receipts'));
  // Reconcile saved receipt evidence against new bank imports without another AI call.
  const savedReceipts=work.filter((w:any)=>w.kind==='receipts'&&w.status==='done').flatMap((w:any)=>w.result.receipts||[]);
  const timingOn=modules.includes('assets')&&policies.some((p:any)=>p.module==='assets'&&p.mode==='ai'&&p.tasks.includes('timing'));
  const receiptEligible=plan.eligible.filter((t:any)=>categoryMayAutoApply(learningPolicies,{...t,currency:accounts.find((a:any)=>a.id===t.account_id)?.currency||'USD'})&&!items.some((i:any)=>i.module==='assets'&&i.status==='needs_input'&&i.payload?.transaction_id===t.id)&&(!timingOn||!timingCandidate(t)||work.some((w:any)=>w.kind==='timing'&&w.status==='done'&&w.payload.transactionIds?.includes(t.id))));
  const universe=plan.available.filter((t:any)=>t.amount>0),eligibleIds=new Set(receiptEligible.map((t:any)=>t.id));
  const receiptChoices=canReceipt?receiptMatches(savedReceipts,universe,accounts):[];const unresolvedReceipts=receiptChoices.filter(m=>m.candidates.some(t=>eligibleIds.has(t.id))&&(!autoReceipt||!m.unique||!m.category));if(unresolvedReceipts.length)plan.attention.push({title:unresolvedReceipts.length+' saved receipts need a purchase or category choice',href:'/receipts'});
  const picks=autoReceipt?receiptMatches(savedReceipts,universe,accounts).filter(m=>m.unique&&m.category&&receiptCategories.includes(m.category as any)&&eligibleIds.has(m.candidates[0].id)).map(m=>{const t=m.candidates[0] as any;return {category:m.category,expected:{id:t.id,updated_at:t.updated_at,amount:t.amount,date:t.date,account_id:t.account_id,category:t.category??null}};}):[];
  if(picks.length){await rpc('finance_ai_apply_receipts',{_purchases:picks.slice(0,50)});const savedIds=new Set(picks.slice(0,50).map(p=>p.expected.id));for(const i of items.filter((i:any)=>i.kind==='question'&&i.module==='transactions'&&i.task==='categories'&&i.status==='needs_input'&&!i.answer&&savedIds.has(i.payload?.transaction_id))){await client.rpc('finance_assistant_update',{_id:i.id,_expected:i.revision,_action:'done',_value:{}});}return end('working',`${Math.min(50,picks.length)} clear receipt matches saved without another AI request.`,plan.attention);}
  const incomplete=work.find((w:any)=>w.status==='running');
  let chosen:any=incomplete;
  if(!chosen){
   if(!unified&&work.some((w:any)=>w.status==='failed'))return end('error','A task needs your attention before continuing. No automatic paid retry was made.',plan.attention);
   for(const candidate of plan.options){
    const policy=policies.find((p:any)=>p.module===candidate.module),fingerprint=await digest({version:1,candidate,provider:connection.provider,model:connection.model,revision:policy?.revision});
    if(work.some((w:any)=>w.fingerprint===fingerprint))continue;
    if(candidate.kind!=='sync'&&candidate.kind!=='receipts'&&connection.requestLimitEnabled!==false&&connection.used>=connection.requestLimit)return end('limit','Paused at your AI request limit. Work resumes when allowance becomes available.',plan.attention);
    const result=await admin.from('finance_autopilot_work').insert({owner_id:owner,fingerprint,kind:candidate.kind,payload:{...candidate,provider:connection.provider,model:connection.model}}).select('*').single();if(result.error)throw Error('This work is already being prepared. Refresh its status.');chosen=result.data;break;
   }
  }
  if(!chosen){const failed=work.filter((w:any)=>w.status==='failed');if(failed.length&&!unified)return end('error','A task needs your attention before any paid retry.',plan.attention);return end(failed.length||items.some((i:any)=>i.status==='needs_input')||plan.attention.some((x:any)=>!x.optional)?'needs_input':'idle','Current automatic checks are complete. Saved questions and proposals remain for you; this is not a certified close.',plan.attention);}
  workId=chosen.id;const step=chosen.payload;
  const attempt=await admin.from('finance_autopilot_work').update({attempts:(chosen.attempts||0)+1,updated_at:new Date().toISOString()}).eq('owner_id',owner).eq('id',chosen.id);if(attempt.error)throw Error('Your work checkpoint could not be saved.');
  const taskPolicy=policies.find((p:any)=>p.module===step.module);if(taskPolicy?.mode!=='ai'||!taskPolicy.tasks.includes(step.task)||(step.module!=='transactions'&&!modules.includes(step.module))){await admin.from('finance_autopilot_work').update({status:'skipped',summary:'Task permission was turned off.'}).eq('owner_id',owner).eq('id',chosen.id);workId='';return end('working','A disabled task was left untouched.',plan.attention);}
  if(step.provider!==connection.provider||step.model!==connection.model)throw Error('Your provider changed. Leave this old task for manual review before continuing.');
  let result:any={},summary='';
  if(chosen.kind==='sync'){
   result=await call('receipt-email',{action:'sync',days:mail?.window_days||90});summary=`Gmail checked: ${result.imported} new receipts saved.`;
  }else if(chosen.kind==='receipts'){
   let receiptResult=chosen.result;
   if(!receiptResult?.receipts){
    const sources:any[]=[];let chars=0;
    // Stable ordering is essential for the existing evidence hash on replay.
    const ids:string[]=[];
    const accepted:number[]=[],unavailable:{source:number;reason:string}[]=[];
    for(const id of step.receiptIds){
     let source;
     try{const loaded=await call('receipt-email',{action:'load',ids:[id]});source=loaded.sources?.[0];}
     catch(e){if(!(e as Error).message.includes('changed or expired'))throw e;}
     if(!source||source.text.length>20000||source.text.length<20){
      unavailable.push({source:ids.length,reason:'The saved email expired or has no readable purchase details.'});ids.push(id);continue;
     }
     if(chars+source.text.length>50000)break;
     chars+=source.text.length;accepted.push(ids.length);sources.push(source);ids.push(id);
    }
    if(ids.length!==step.receiptIds.length){step.receiptIds=ids;const updated=await admin.from('finance_autopilot_work').update({payload:step}).eq('owner_id',owner).eq('id',chosen.id);if(updated.error)throw Error('Receipt checkpoint could not save.');}
    if(unavailable.length){
     const saved=await admin.rpc('finance_record_receipt_exceptions',{_owner:owner,_items:unavailable.map(x=>({key:'email:'+ids[x.source],name:'Unavailable email receipt',reason:x.reason}))});
     if(saved.error)throw Error('Unable to save receipt questions.');
    }
    receiptResult={receipts:[],issues:unavailable};
    if(sources.length){
     const response=await call('finance-ai',{action:'analyze',requestId:chosen.request_id,sources,consent:true,provider:connection.provider,model:connection.model});
     if(response.status!=='succeeded')throw Error('This receipt analysis is still running. No new request was started.');
     receiptResult={receipts:response.result.receipts.map((r:any)=>({...r,source:accepted[r.source]??r.source})),issues:[...unavailable,...(response.result.issues||[]).map((i:any)=>({...i,source:accepted[i.source]}))]};
    }
   }
   result={receipts:receiptResult.receipts,issues:receiptResult.issues||[]};summary=`${step.receiptIds.length} receipt emails checked without repeating earlier analysis. ${result.issues.length} need receipt review.`;
  }else{
   result=await call('finance-assistant',{action:'run',requestId:chosen.request_id,module:step.module,task:step.task,transactionIds:step.transactionIds,start:step.start,end:step.end,note:step.note||'',consent:true,provider:connection.provider,model:connection.model});summary=result.summary;
   if(step.answerId){const r=await client.rpc('finance_assistant_update',{_id:step.answerId,_expected:step.answerRevision,_action:'done',_value:{}});if(r.error)summary+=' Your answer was used; review the original question before marking it handled.';}
  }
  const saved=await admin.from('finance_autopilot_work').update({status:'done',result,summary:summary.slice(0,1800),updated_at:new Date().toISOString()}).eq('owner_id',owner).eq('id',chosen.id);if(saved.error)throw Error('The result could not be checkpointed. Resume uses its existing request ID.');workId='';return end('working',summary,plan.attention);
 }catch(e){
  const raw=e instanceof Error?e.message:'',message=/^(Your |The |This |Automatic |A |An |No |AI |Gmail|Email|Receipt|Select|Choose|Connect|Provider|Evidence|Unable|Could not|Request)/.test(raw)?raw:'Automatic work could not finish. No automatic paid retry was made.';
  if(admin&&owner&&/still running|was paused or settings changed/.test(message)){if(lease)await admin.rpc('finance_autopilot_end',{_owner:owner,_lease:lease,_status:'working',_summary:message,_attention:[]});return reply({status:'working',summary:message});}
  const cost = /^Your AI dollar budget cannot cover the next task \(maximum cost \$(\d+\.\d{6})\)\.$/.exec(message);
  if (admin && owner && lease && (cost || /^Your request limit /.test(message))) {
   const required = cost ? Math.round(Number(cost[1]) * 1_000_000) : 0;
   const saved = await admin.rpc('finance_autopilot_wait', {_owner:owner, _lease:lease, _required:required, _attention:[]});
   if (saved.error) return reply({error:'Your automatic restart could not be scheduled.'},500);
   return reply({status:'limit'});
  }
  if(admin&&owner){if(workId)await admin.from('finance_autopilot_work').update({status:'failed',summary:message.slice(0,1800),updated_at:new Date().toISOString()}).eq('owner_id',owner).eq('id',workId);if(lease)await admin.rpc('finance_autopilot_end',{_owner:owner,_lease:lease,_status:'error',_summary:message,_attention:[]});}
  return reply({error:message},400);
 }
});
