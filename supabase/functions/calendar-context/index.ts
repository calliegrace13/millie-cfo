import {serve} from 'https://deno.land/std@0.168.0/http/server.ts';
import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
import {protectAIKey} from '../_shared/ai-vault.ts';
import {calendarEvidence,calendarTrips} from '../_shared/calendar-context.ts';
const env=(k:string)=>Deno.env.get(k)||'';
serve(async req=>{
 const origin=req.headers.get('origin')||'',allowed=env('MILLIE_ALLOWED_ORIGINS').split(',').map(x=>x.trim());
 const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','Access-Control-Allow-Origin':allowed.includes(origin)?origin:'','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS'};
 const reply=(v:any,status=200)=>new Response(JSON.stringify(v),{status,headers});
 if(origin&&!allowed.includes(origin))return reply({error:'Origin not allowed'},403);if(req.method==='OPTIONS')return reply({});if(req.method!=='POST')return reply({error:'Method not allowed'},405);
 const admin=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'));let owner='',leased=false;
 try{
  const raw=await req.text();if(raw.length>2000)throw Error('Choose a calendar action.');const b=JSON.parse(raw);
  if(b.workerOwner){
   if(origin||b.action!=='sync'||typeof b.workerOwner!=='string'||!/^[0-9a-f-]{36}$/i.test(b.workerOwner))return reply({error:'Automatic calendar authorization is invalid.'},403);
   const a=await admin.rpc('finance_scheduler_authorized',{_token:(req.headers.get('authorization')||'').replace(/^Bearer /,'')});if(a.error||a.data!==true)return reply({error:'Automatic calendar authorization is invalid.'},403);owner=b.workerOwner;
  }else{
   const client=createClient(env('SUPABASE_URL'),env('SUPABASE_ANON_KEY'),{global:{headers:{Authorization:req.headers.get('authorization')||''}}});const a=await client.auth.getUser();if(a.error||!a.data.user)return reply({error:'Sign in to use your calendar.'},401);owner=a.data.user.id;
  }
  if(b.action==='status'){
   const r=await admin.from('finance_calendar_connections').select('mailbox,auto_sync,last_synced_at,next_sync_at,status,error').eq('owner_id',owner).maybeSingle();if(r.error)throw Error('Calendar settings could not load.');return reply({connection:r.data});
  }
  if(b.action==='disconnect'){
   const r=await admin.from('finance_calendar_connections').delete().eq('owner_id',owner);if(r.error)throw Error('Calendar connection could not be removed.');
   await admin.from('finance_email_oauth_states').delete().eq('owner_id',owner).eq('calendar_only',true);await admin.from('finance_calendar_events').delete().eq('owner_id',owner);return reply({ok:true});
  }
  if(b.action==='preferences'){
   if(typeof b.enabled!=='boolean')throw Error('Choose a calendar sync preference.');const r=await admin.from('finance_calendar_connections').update({auto_sync:b.enabled,next_sync_at:new Date().toISOString()}).eq('owner_id',owner);if(r.error)throw Error('Calendar preference could not be saved.');return reply({ok:true});
  }
  if(b.action!=='sync')throw Error('Choose a calendar action.');
  const claim=await admin.rpc('finance_calendar_begin',{_owner:owner});if(claim.error)throw Error('Calendar sync could not be locked.');if(!claim.data)return reply({busy:true});leased=true;
  const c=claim.data;if(b.workerOwner&&!c.auto_sync)throw Error('Automatic calendar sync is off.');
  const refresh=await protectAIKey(env('AI_CREDENTIAL_ENCRYPTION_KEY'),c.credential,owner,'email:calendar',true);
  const token=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({refresh_token:refresh,grant_type:'refresh_token',client_id:env('GOOGLE_GMAIL_CLIENT_ID'),client_secret:env('GOOGLE_GMAIL_CLIENT_SECRET')}),signal:AbortSignal.timeout(15000)});
  const access=await token.json();if(!token.ok||!access.access_token)throw Error('Calendar authorization expired. Reconnect Google Calendar.');
  const min=new Date(Date.now()-1095*86400000).toISOString(),max=new Date(Date.now()+366*86400000).toISOString();let page='',events:any[]=[];
  for(let i=0;i<4;i++){
   const query=new URLSearchParams({timeMin:min,timeMax:max,singleEvents:'true',maxResults:'1000',timeZone:'America/New_York',orderBy:'startTime',fields:'items(id,status,summary,location,start,end,updated,attendees(self,responseStatus)),nextPageToken'});if(page)query.set('pageToken',page);
   const r=await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?'+query,{headers:{Authorization:'Bearer '+access.access_token},signal:AbortSignal.timeout(15000)});
   if(!r.ok)throw Error(r.status===403?'Calendar access is unavailable. Check that Google Calendar API is enabled and read-only access was granted.':'Google Calendar could not be read. Try again later.');
   const d=await r.json();for(const e of d.items||[]){try{const item=calendarEvidence(e);if(item)events.push(item);}catch{/* Malformed events never become trips. */}}
   page=d.nextPageToken||'';if(!page)break;
  }
  if(page||events.length>2000)throw Error('Calendar history exceeds the sync window. No partial snapshot was applied.');
  const saved=await admin.rpc('finance_calendar_import',{_owner:owner,_events:events,_trips:calendarTrips(events),_credential:c.credential,_automatic:!!b.workerOwner});if(saved.error)throw Error('Calendar context could not be saved.');
  await admin.rpc('finance_reconcile_inbox',{_owner:owner});
  await admin.from('finance_calendar_connections').update({last_synced_at:new Date().toISOString(),next_sync_at:new Date(Date.now()+24*3600000).toISOString(),lease_until:null,status:'ready',error:null}).eq('owner_id',owner).eq('credential',c.credential);leased=false;
  return reply({ok:true,...saved.data});
 }catch(e){const raw=e instanceof Error?e.message:'',message=/^(Calendar |Google |Automatic |Choose )/.test(raw)?raw:'Calendar sync could not finish. Your saved financial data is unchanged.';if(leased&&owner)await admin.from('finance_calendar_connections').update({lease_until:null,status:'error',error:message,next_sync_at:new Date(Date.now()+6*3600000).toISOString()}).eq('owner_id',owner);return reply({error:message},400);}
});
