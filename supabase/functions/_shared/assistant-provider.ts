import {protectAIKey} from './ai-vault.ts';
import {requestBytes,usageFor} from './ai-cost.ts';
const enc=new TextEncoder();
export async function digest(value:unknown){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(JSON.stringify(value))))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export async function stageId(id:string,stage:string){const s=await digest([id,stage]);return `${s.slice(0,8)}-${s.slice(8,12)}-4${s.slice(13,16)}-8${s.slice(17,20)}-${s.slice(20,32)}`;}
const safeURL=(value:string)=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}};
// Shared quota, private credentials, immutable replay IDs; no automatic retry.
export async function assistantInference(admin:any,args:{owner:string;requestId:string;provider:string;model:string;input:string;instructions:string;schema?:any;research?:boolean;hash?:string;receiptKeys?:string[];validate:(raw:any)=>any;beforeSend?:()=>Promise<void>}){
 const hash=args.hash||await digest({version:1,...args,validate:undefined,beforeSend:undefined});
 const payload:any=args.provider==='openai'?{model:args.model,store:false,max_output_tokens:6000,instructions:args.instructions,input:args.input}:{model:args.model,max_tokens:6000,system:args.instructions,messages:[{role:'user',content:args.input}]};
 if(args.research){if(args.provider==='openai'){payload.tools=[{type:'web_search',search_context_size:'low'}];payload.max_tool_calls=2;}else payload.tools=[{type:'web_search_20250305',name:'web_search',max_uses:2}];}
 else if(args.provider==='openai')payload.text={format:{type:'json_schema',name:'module_work',strict:true,schema:args.schema}};
 else payload.output_config={format:{type:'json_schema',schema:args.schema}};
 const cache=await digest({version:2,payload});
 const r=await admin.rpc(args.receiptKeys?'finance_reserve_receipt_sources':'finance_ai_reserve',{...(args.receiptKeys?{_keys:args.receiptKeys}:{}),_owner:args.owner,_request:args.requestId,_hash:hash,_cache:cache,_bytes:requestBytes(payload),_output:6000,_research:!!args.research,_provider:args.provider,_model:args.model});if(r.error)throw Error(r.error.message);
 const job=r.data;if(job.status==='succeeded')return job.result;if(job.status!=='new')throw Error(job.status==='running'?'An analysis is still running. Resume the same run shortly.':'This analysis failed. Start a new run only when you are ready for another paid attempt.');
 let settled=false;
 try{
  if(job.provider!==args.provider||job.model!==args.model)throw Error('Your provider changed. No data was sent.');
  const key=await protectAIKey(Deno.env.get('AI_CREDENTIAL_ENCRYPTION_KEY')||'',job.credential,args.owner,job.provider,true);
  await args.beforeSend?.();
  const sent=await admin.rpc('finance_ai_mark_sent',{_owner:args.owner,_run:job.id});if(sent.error)throw Error(sent.error.message);
  const response=await fetch(job.provider==='openai'?'https://api.openai.com/v1/responses':'https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json',...(job.provider==='openai'?{Authorization:'Bearer '+key}:{'x-api-key':key,'anthropic-version':'2023-06-01'})},body:JSON.stringify(payload),signal:AbortSignal.timeout(60000)});
  if(!response.ok)throw Error('The provider could not complete this task. Check model support, billing or rate limits; no automatic retry was made.');
  const output=await response.json();
  // Meter even an incomplete/invalid response: parsing failure does not mean free.
  const usage=usageFor(job.provider,output,!!args.research);
  const metered=await admin.rpc('finance_ai_settle',{_owner:args.owner,_run:job.id,_usage:usage,_provider_id:typeof output.id==='string'?output.id:null});if(metered.error)throw Error('Your provider usage could not be recorded. The maximum cost remains held.');settled=true;
  if(!usage)throw Error('Provider usage was missing. The maximum cost remains held; no automatic paid retry was made.');
  if(job.provider==='openai'?output.status!=='completed':output.stop_reason!=='end_turn')throw Error('Provider response was incomplete. Resume does not make another paid attempt.');
  const parts=job.provider==='openai'?output.output?.flatMap((x:any)=>x.content||[]).filter((x:any)=>x.type==='output_text')||[]:output.content?.filter((x:any)=>x.type==='text')||[];
  const text=parts.map((x:any)=>x.text).join('\n');let result:any;
  if(args.research){const citations=parts.flatMap((x:any)=>x.annotations||x.citations||[]).flatMap((x:any)=>{const url=safeURL(x.url);return url?[{url,title:String(x.title||url).slice(0,180)}]:[];}).filter((x:any,i:number,a:any[])=>a.findIndex(y=>y.url===x.url)===i);result={text:citations.length?text.slice(0,12000):'No cited public evidence was returned. Ask the user or use a receipt.',citations:citations.slice(0,15)};}
  else result=args.validate(JSON.parse(text));
  const save=await admin.from('finance_ai_receipt_runs').update({status:'succeeded',result,finished_at:new Date().toISOString()}).eq('id',job.id).eq('owner_id',args.owner);if(save.error)throw Error('Analysis completed but could not be saved. Check the same run before starting another.');return result;
 }catch(e){if(!settled)await admin.rpc('finance_ai_settle',{_owner:args.owner,_run:job.id,_usage:null,_provider_id:null});await admin.from('finance_ai_receipt_runs').update({status:'failed',finished_at:new Date().toISOString()}).eq('id',job.id).eq('owner_id',args.owner);throw e;}
}
