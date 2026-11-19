import {serve} from 'https://deno.land/std@0.168.0/http/server.ts';
import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
import {validatePlan,type Domain} from './planning-contract.ts';
// Each domain has its own deployment and API boundary. Caller JWT + RLS throughout;
// no service-role access, cross-service writes, credentials in payloads or payload logs.
export function planningService(domain:Domain){serve(async req=>{
 const origin=req.headers.get('origin')||'',allowed=(Deno.env.get('MILLIE_ALLOWED_ORIGINS')||'').split(',').map(x=>x.trim()),requestId=crypto.randomUUID();
 const headers={'Content-Type':'application/json','Access-Control-Allow-Origin':allowed.includes(origin)?origin:'','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin','Cache-Control':'no-store'};
 const reply=(body:any,status=200)=>new Response(JSON.stringify({...body,requestId,version:1}),{status,headers});
 if(origin&&!allowed.includes(origin))return reply({error:'Origin not allowed'},403);if(req.method==='OPTIONS')return reply({});if(req.method!=='POST')return reply({error:'Method not allowed'},405);
 try{
  const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:req.headers.get('Authorization')||''}}});
  const {data:{user},error}=await client.auth.getUser();if(error||!user)return reply({error:'Sign in to use this workspace.'},401);
  const raw=await req.text();if(raw.length>65000)return reply({error:'This record is too large.'},413);const body=JSON.parse(raw);
  if(body.version!==1)return reply({error:'Unsupported planning API version. Refresh Millie.'},400);
  if(body.action==='list'){
   const offset=Number.isInteger(body.offset)&&body.offset>=0?body.offset:0;
   const r=await client.from('finance_module_records').select('*').eq('domain',domain).eq('owner_id',user.id).order('created_at').order('id').range(offset,offset+199);
   if(r.error)throw r.error;return reply({records:r.data,nextOffset:r.data.length===200?offset+200:null});
  }
  if(body.action==='history'){
   const r=await client.from('finance_module_record_history').select('revision,operation,recorded_at,after_value').eq('record_id',body.id).eq('owner_id',user.id).order('revision',{ascending:false}).limit(100);
   // Domain ownership is checked separately to keep service boundaries explicit.
   const record=await client.from('finance_module_records').select('id').eq('id',body.id).eq('domain',domain).maybeSingle();
   if(r.error||record.error)throw r.error||record.error;if(!record.data)return reply({error:'Record unavailable.'},404);return reply({history:r.data});
  }
  if(body.action!=='save')return reply({error:'Unknown planning action.'},400);
  const invalid=validatePlan(domain,body.kind,body.name,body.payload);if(invalid)return reply({error:invalid},400);
  const r=await client.rpc('finance_save_module_record',{_domain:domain,_kind:body.kind,_name:body.name,_payload:body.payload,_id:body.id||null,_expected:body.expected??null,_status:body.status||'active',_request:body.requestId});
  if(r.error){const message=r.error.message||'';if(/changed|already|existing|Choose|Check|Enter|Duplicate|Invalid|out of range/.test(message))return reply({error:message},409);throw r.error;}
  return reply({record:r.data});
 }catch{return reply({error:'This workspace could not complete the request. Retry; saved revisions are protected.'},500);}
});}
