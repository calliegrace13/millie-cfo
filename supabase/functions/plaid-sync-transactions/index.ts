import {serve} from "https://deno.land/std@0.168.0/http/server.ts";
import {createClient} from "https://esm.sh/@supabase/supabase-js@2";
import {syncItem,refreshInstitutionLabels} from '../_shared/bank-sync.ts';
serve(async req=>{
 const origin=req.headers.get('origin')||'';const allowed=(Deno.env.get('MILLIE_ALLOWED_ORIGINS')||'').split(',');
 const headers={'Content-Type':'application/json','Access-Control-Allow-Origin':allowed.includes(origin)?origin:'','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'};
 const reply=(data:any,status=200)=>new Response(JSON.stringify(data),{status,headers});
 if(origin&&!allowed.includes(origin))return reply({error:'Origin not allowed'},403);
 if(req.method==='OPTIONS')return reply({});if(req.method!=='POST')return reply({error:'Method not allowed'},405);
 try{
 const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:req.headers.get('Authorization')||''}}});
 const {data:{user},error}=await client.auth.getUser();if(error||!user)return reply({error:'Unauthorized'},401);
 const body=await req.json().catch(()=>({}));const start=body.start_date,end=body.end_date;
 if((start||end)&&(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end)||start>end))return reply({error:'Invalid date range'},400);
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
 const items=await db.from('plaid_items').select('*').eq('user_id',user.id);if(items.error)throw items.error;
 if(body.metadata_only===true){let failed=0;for(const item of items.data||[]){try{await refreshInstitutionLabels(db,item);}catch{failed++;}}return reply({updated:true,failed});}
 const results=[];for(const item of items.data||[])results.push(await syncItem(db,item,start,end));
 return reply({synced:results.reduce((n,r)=>n+r.synced,0),error:results.find(r=>r.error)?.error,busy:results.some(r=>r.busy)},results.some(r=>r.error)?502:200);
 }catch{return reply({error:'Unable to sync. Please retry.'},500);}
});
