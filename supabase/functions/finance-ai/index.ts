import {serve} from 'https://deno.land/std@0.168.0/http/server.ts';
import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
import {receiptInstructions,receiptSchema} from '../_shared/receipt-contract.ts';
import {checkReceiptBatch,processReceiptSources,receiptKey} from '../_shared/receipt-batch.ts';
import {patternInstructions,patternSchema,validatePatterns} from '../_shared/pattern-contract.ts';
import {assistantInference} from '../_shared/assistant-provider.ts';
import {workerIdentity} from '../_shared/worker-context.ts';
import {protectAIKey} from '../_shared/ai-vault.ts';
const enc=new TextEncoder();
async function crypt(value:string,owner:string,provider:string,decrypt=false){
 return protectAIKey(Deno.env.get('AI_CREDENTIAL_ENCRYPTION_KEY')||'',value,owner,provider,decrypt);
}
const providerHeaders=(p:string,key:string)=>p==='openai'?{Authorization:`Bearer ${key}`}:{'x-api-key':key,'anthropic-version':'2023-06-01'};
const base=(p:string)=>p==='openai'?'https://api.openai.com/v1':'https://api.anthropic.com/v1';
async function models(p:string,key:string){const r=await fetch(base(p)+'/models',{headers:providerHeaders(p,key),signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Provider rejected the connection. Check the API key and API account access.');const d=await r.json();return (d.data||[]).map((x:any)=>x.id).filter((id:unknown)=>typeof id==='string'&&(p==='anthropic'?/^claude-/.test(id):/^(gpt-|o[134])/.test(id))&&!/audio|realtime|image|tts|transcribe|search|codex|instruct/.test(id)).sort();}
serve(async req=>{
 const origin=req.headers.get('origin')||'',allowed=(Deno.env.get('MILLIE_ALLOWED_ORIGINS')||'').split(',').map(s=>s.trim());
 const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','Access-Control-Allow-Origin':allowed.includes(origin)?origin:'','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS'};
 const reply=(v:any,status=200)=>new Response(JSON.stringify(v),{status,headers});
 if(origin&&!allowed.includes(origin))return reply({error:'Origin not allowed'},403);if(req.method==='OPTIONS')return reply({});if(req.method!=='POST')return reply({error:'Method not allowed'},405);
 let run:string|undefined,owner:string|undefined,admin:any;
 try{
  admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const worker=await workerIdentity(req,admin);
  const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:req.headers.get('authorization')||''}}});
  if(worker)owner=worker.owner;else{const {data:{user},error}=await client.auth.getUser();if(error||!user)return reply({error:'Sign in to use your AI connection.'},401);owner=user.id;}
  const raw=await req.text();if(raw.length>70000)return reply({error:'Import at most 50,000 characters of receipt text.'},413);const b=JSON.parse(raw);
  if(worker&&(b.action!=='analyze'||b.task==='patterns'))return reply({error:'Automatic work action is not allowed.'},403);
  if(['probe','connect','choose','disconnect'].includes(b.action)){
   if(!['openai','anthropic'].includes(b.provider))throw Error('Choose a supported provider.');
   if(b.action==='choose'||b.action==='disconnect'){const r=await admin.rpc('finance_ai_choose',{_owner:owner,_provider:b.provider,_disconnect:b.action==='disconnect'});if(r.error)throw Error('Unable to update your connection. Refresh settings.');return reply({ok:true});}
   if(typeof b.key!=='string'||b.key.length<20||b.key.length>1000||/[\r\n]/.test(b.key))throw Error('Enter a valid API key.');const available=await models(b.provider,b.key);
   if(b.action==='probe')return reply({models:available});
   if(b.consent!==true||!available.includes(b.model)||!Number.isInteger(b.requestLimit)||b.requestLimit<1||b.requestLimit>20)throw Error('Choose a model, request limit and consent to provider charges.');
   const r=await admin.rpc('finance_ai_connect',{_owner:owner,_provider:b.provider,_model:b.model,_credential:await crypt(b.key,owner!,b.provider),_suffix:b.key.slice(-4),_limit:b.requestLimit,_expected:b.expected??null});if(r.error)throw Error('Connection changed or could not be saved. Refresh settings.');return reply({ok:true});
  }
  if(b.action!=='analyze'||b.consent!==true||!Array.isArray(b.sources)||!b.sources.length||b.sources.length>(b.task==='patterns'?30:10)||!/^[0-9a-f-]{36}$/i.test(b.requestId))throw Error('Choose receipts and consent before analyzing.');
  const task=b.task==='patterns'?'patterns':'receipts';
  const permission=await admin.rpc('finance_ai_authorize_task',{_owner:owner,_module:'transactions',_task:task});if(permission.error)throw Error('AI is off for this task. Enable it in Customize Millie.');
  let total=0;const sources=b.sources.map((s:any)=>{if(typeof s.text!=='string'||typeof s.name!=='string'||s.name.length>150||s.text.length>20000||s.text.length<20)throw Error('Use readable receipt text, up to 20,000 characters per file.');total+=s.text.length;return {name:s.name,text:s.text};});if(total>50000)throw Error('Import at most 50,000 characters at once.');
  const hashFor=async(version:number)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(JSON.stringify({version,task,sources}))))].map(n=>n.toString(16).padStart(2,'0')).join('');
  const authorize=async()=>{if(worker)await workerIdentity(req,admin);const p=await admin.rpc('finance_ai_authorize_task',{_owner:owner,_module:'transactions',_task:task});if(p.error||p.data.revision!==permission.data.revision)throw Error('Your AI settings changed. No receipt was sent.');};
  const inference=(batch:any[],hash:string,keys?:string[])=>assistantInference(admin,{
   owner:owner!,requestId:b.requestId,hash,provider:b.provider,model:b.model,receiptKeys:keys,
   input:JSON.stringify(batch.map((s,i)=>({source:i,text:s.text}))),beforeSend:authorize,
   instructions:keys?receiptInstructions:patternInstructions,schema:keys?receiptSchema:patternSchema,
   validate:parsed=>keys?checkReceiptBatch(parsed,batch):{patterns:validatePatterns(parsed,batch),provider:b.provider,model:b.model}
  });
  if(task==='patterns')return reply({status:'succeeded',result:await inference(sources,await hashFor(2))});
  // Older interactive runs recorded only a whole-batch hash. Verify that exact input
  // before using their result, even when the original request ID is no longer in the tab.
  const legacyQuery=await admin.from('finance_ai_receipt_runs').select('id,status,result').eq('owner_id',owner)
    .is('receipt_source_keys',null).in('input_hash',[await hashFor(2),await hashFor(3)])
    .order('started_at',{ascending:false}).limit(1).maybeSingle();
  if(legacyQuery.error)throw Error('Unable to check earlier receipt evidence.');
  if(legacyQuery.data&&legacyQuery.data.status!=='running'){
   const indexed=await admin.from('finance_ai_receipt_runs').update({receipt_source_keys:await Promise.all(sources.map((s:any)=>receiptKey(s.text)))})
     .eq('owner_id',owner).eq('id',legacyQuery.data.id).is('receipt_source_keys',null);
   if(indexed.error)throw Error('Unable to index an earlier receipt check.');
  }
  const analyze=async()=>processReceiptSources(admin,owner!,sources,async(batch,keys)=>{
   if(b.cacheOnly===true)throw Error('Receipt allowance is needed.');
   const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(JSON.stringify({version:4,keys}))))].map(n=>n.toString(16).padStart(2,'0')).join('');
   return await inference(batch,hash,keys);
  },legacyQuery.data?{...legacyQuery.data,whole:true}:undefined);
  let checked;
  try{checked=await analyze();}catch(e){
   if((e as Error).message==='Receipt allowance is needed.')return reply({status:'needs_allowance'});
   if((e as Error).message!=='Receipt history changed. Check the saved results before continuing.')throw e;
   checked=await analyze();
  }
  const result={...checked,provider:b.provider,model:b.model};
  return reply({status:'succeeded',result});
 }catch(e){if(run&&admin)await admin.from('finance_ai_receipt_runs').update({status:'failed',finished_at:new Date().toISOString()}).eq('id',run).eq('owner_id',owner);const msg=e instanceof Error?e.message:'';return reply({error:/^(AI is off|Provider|The provider|Choose|Enter|Use readable|Import at most|Receipt|A suggested|AI connection|Your AI|Your model|Your provider|Your request|An analysis|Connect and select|Request ID|Connection changed|Unable to|Analysis completed)/.test(msg)?msg:'Unable to complete AI analysis. No automatic retry was made.'},400);}
});
