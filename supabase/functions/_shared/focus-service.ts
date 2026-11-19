import {serve} from 'https://deno.land/std@0.168.0/http/server.ts';
import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
// Independent deployments share a small contract. Caller JWT and RLS only;
// the service cannot read bank credentials or mutate the transaction ledger.
export function focusService(domain:'watchlists'|'recoveries'){serve(async req=>{
 const origin=req.headers.get('origin')||'',allowed=(Deno.env.get('MILLIE_ALLOWED_ORIGINS')||'').split(',').map(x=>x.trim());
 const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','Access-Control-Allow-Origin':allowed.includes(origin)?origin:'','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS'};
 const reply=(b:any,status=200)=>new Response(JSON.stringify(b),{status,headers});
 if(origin&&!allowed.includes(origin))return reply({error:'Origin not allowed'},403);if(req.method==='OPTIONS')return reply({});if(req.method!=='POST')return reply({error:'Method not allowed'},405);
 try{const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:req.headers.get('authorization')||''}}}),{data:{user},error}=await db.auth.getUser();if(error||!user)return reply({error:'Sign in first.'},401);
 const raw=await req.text();if(raw.length>24000)return reply({error:'Record too large.'},413);const b=JSON.parse(raw);if(b.version!==1)return reply({error:'Refresh this workspace.'},400);
 if(b.action==='list'){const n=Number.isInteger(b.offset)&&b.offset>=0?b.offset:0,r=await db.from('finance_focus_records').select('*').eq('owner_id',user.id).eq('domain',domain).order('id').range(n,n+199);if(r.error)throw r.error;return reply({records:r.data,nextOffset:r.data.length===200?n+200:null});}
 if(b.action==='history'){const record=await db.from('finance_focus_records').select('id').eq('id',b.id).eq('domain',domain).eq('owner_id',user.id).maybeSingle();if(!record.data)return reply({error:'Record unavailable'},404);const r=await db.from('finance_focus_history').select('revision,after_value,recorded_at').eq('record_id',b.id).eq('owner_id',user.id).order('revision',{ascending:false}).limit(100);if(r.error)throw r.error;return reply({history:r.data});}
 if(b.action!=='save')return reply({error:'Unknown action'},400);
 const r=await db.rpc('finance_save_focus',{_domain:domain,_name:b.name,_payload:b.payload,_id:b.id||null,_expected:b.expected??null,_status:b.status||'active',_request:b.requestId});
 if(r.error)return reply({error:/Choose|Record changed|already|Expected|Create a separate|Invalid/.test(r.error.message)?r.error.message:'Unable to save this record.'},409);return reply({record:r.data});
 }catch{return reply({error:'Unable to complete this workspace request. Saved history is protected.'},400);}
 });}
