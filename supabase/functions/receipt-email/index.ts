import {serve} from 'https://deno.land/std@0.168.0/http/server.ts';
import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
import {workerIdentity} from '../_shared/worker-context.ts';
import {protectAIKey} from '../_shared/ai-vault.ts';
import {GMAIL_SCOPE,receiptQuery,url64,sha256,authorizationURL,receiptMessage} from '../_shared/email-receipts.ts';
const env=(name:string)=>Deno.env.get(name)||'';
const originApp=()=>env('GMAIL_APP_ORIGIN')||'https://millie-cfo-callie.calliegrace13.chatgpt.site';
const callback=()=>originApp()+'/gmail-callback.html';
const ready=()=>!!(env('GOOGLE_GMAIL_CLIENT_ID')&&env('GOOGLE_GMAIL_CLIENT_SECRET')&&env('AI_CREDENTIAL_ENCRYPTION_KEY'));
const crypt=(text:string,owner:string,context:string,decrypt=false)=>protectAIKey(env('AI_CREDENTIAL_ENCRYPTION_KEY'),text,owner,'email:'+context,decrypt);
async function token(body:Record<string,string>){
 const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...body,client_id:env('GOOGLE_GMAIL_CLIENT_ID'),client_secret:env('GOOGLE_GMAIL_CLIENT_SECRET')}),signal:AbortSignal.timeout(15000)});
 const d=await r.json();if(!r.ok||!d.access_token)throw Error('Gmail authorization could not be renewed. Reconnect your inbox.');return d;
}
async function gmail(path:string,access:string){const r=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/'+path,{headers:{Authorization:'Bearer '+access},signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error('Gmail could not be read. Reconnect or try again later.');return r.json();}
serve(async req=>{
 const origin=req.headers.get('origin')||'',allowed=env('MILLIE_ALLOWED_ORIGINS').split(',').map(x=>x.trim());
 const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','Access-Control-Allow-Origin':allowed.includes(origin)?origin:'','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS'};
 const reply=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers});
 
 const admin=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'));
 let lease:string|undefined,owner:string|undefined;
 try{
  if(origin&&!allowed.includes(origin))return reply({error:'Origin not allowed'},403);
  if(req.method==='OPTIONS')return reply({});if(req.method!=='POST')return reply({error:'Method not allowed'},405);
  const client=createClient(env('SUPABASE_URL'),env('SUPABASE_ANON_KEY'),{global:{headers:{Authorization:req.headers.get('authorization')||''}}});
  const worker=await workerIdentity(req,admin);
  const auth=worker?{data:{user:{id:worker.owner}},error:null}:await client.auth.getUser();if(auth.error||!auth.data.user)return reply({error:'Sign in to use your email connection.'},401);owner=auth.data.user.id;
  const raw=await req.text();if(raw.length>8000)return reply({error:'Request is too large.'},413);const b=JSON.parse(raw);
  if(worker&&!['load','sync'].includes(b.action))return reply({error:'Automatic email action is not allowed.'},403);
  if(worker&&b.action==='sync'){const pref=await admin.from('finance_email_connections').select('auto_sync').eq('owner_id',owner).single();if(pref.error||!pref.data.auto_sync)throw Error('Email automatic syncing is off.');}
  if(b.action==='status'){
   await admin.from('finance_email_receipts').delete().eq('owner_id',owner).lt('expires_at',new Date().toISOString());
   const c=await admin.from('finance_email_connections').select('mailbox,auto_sync,last_synced_at,sync_cursor,window_days').eq('owner_id',owner).maybeSingle();
   const offset=Number(b.offset||0);if(!Number.isInteger(offset)||offset<0||offset>5000)throw Error('Choose a valid receipt page.');
   const rows=await admin.from('finance_email_receipts').select('id,subject,sender,sent_at,created_at',{count:'exact'}).eq('owner_id',owner).eq('dismissed',false).order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+49);
   if(c.error||rows.error)throw Error('Email settings could not be loaded.');
   return reply({configured:ready(),callback:callback(),connection:c.data?{mailbox:c.data.mailbox,autoSync:c.data.auto_sync,lastSync:c.data.last_synced_at,hasMore:!!c.data.sync_cursor,windowDays:c.data.window_days}:null,receipts:rows.data||[],total:rows.count||0});
  }
  if(b.action==='exchange'){
   if(!ready()||typeof b.code!=='string'||!b.code||b.code.length>5000||typeof b.state!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(b.state))throw Error('Gmail authorization was incomplete. Connect again.');
   const hash=await sha256(b.state),claimed=await admin.rpc('finance_email_claim_state',{_hash:hash,_owner:owner});
   if(claimed.error)throw Error('Gmail authorization expired, was already used or belongs to another Millie login.');
   const flow=claimed.data,verifier=await crypt(flow.verifier,owner,'state:'+hash,true);
   const d=await token({code:b.code,code_verifier:verifier,redirect_uri:callback(),grant_type:'authorization_code'});
   if(!d.refresh_token||!String(d.scope||'').split(' ').includes(GMAIL_SCOPE))throw Error('Gmail read-only access was not granted.');
   const p=await gmail('profile',d.access_token),mailbox=String(p.emailAddress||'').toLowerCase();
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mailbox))throw Error('Gmail account could not be verified.');
   const saved=await admin.rpc('finance_email_connect',{_hash:hash,_owner:owner,_mailbox:mailbox,_credential:await crypt(d.refresh_token,owner,'gmail')});
   if(saved.error)throw Error('Gmail connection was cancelled or changed.');return reply({ok:true});
  }
  if(b.action==='connect'){
   if(!ready())return reply({error:'The website owner needs to configure Gmail before an inbox can be connected.'},409);
   if(b.consent!==true)throw Error('Confirm read-only Gmail access before connecting.');
   const state=url64(crypto.getRandomValues(new Uint8Array(32))),verifier=url64(crypto.getRandomValues(new Uint8Array(32))),hash=await sha256(state);
   await admin.from('finance_email_oauth_states').delete().eq('owner_id',owner).lt('expires_at',new Date().toISOString());
   const r=await admin.from('finance_email_oauth_states').insert({state_hash:hash,owner_id:owner,verifier:await crypt(verifier,owner,'state:'+hash)});
   if(r.error)throw Error('Email authorization could not start.');return reply({url:authorizationURL(env('GOOGLE_GMAIL_CLIENT_ID'),callback(),state,await sha256(verifier))});
  }
  if(b.action==='load'){
   if(!Array.isArray(b.ids)||!b.ids.length||b.ids.length>10||b.ids.some((id:any)=>typeof id!=='string'||!/^[0-9a-f-]{36}$/i.test(id)))throw Error('Select up to ten receipt emails.');
   const r=await admin.from('finance_email_receipts').select('id,message_id,subject,body_cipher,source_key').eq('owner_id',owner).in('id',b.ids).eq('dismissed',false).gt('expires_at',new Date().toISOString());
   if(r.error||r.data.length!==new Set(b.ids).size)throw Error('Receipt emails changed or expired. Refresh the queue.');
   const byId=new Map(r.data.map((row:any)=>[row.id,row]));
   const sources=await Promise.all([...new Set<string>(b.ids)].map(async id=>{
    const row=byId.get(id) as any;const text=await crypt(row.body_cipher,owner!,'receipt:'+row.message_id,true);
    if(!row.source_key){
     const saved=await admin.from('finance_email_receipts').update({source_key:await sha256(text.replace(/\r\n?/g,'\n').trim())}).eq('owner_id',owner).eq('id',id);
     if(saved.error)throw Error('Receipt history could not be checked. Try again.');
    }
    return {name:row.subject.slice(0,150),text};
   }));
   if(sources.reduce((n,s)=>n+s.text.length,0)>50000)throw Error('Select fewer emails; the combined text exceeds the analysis limit.');return reply({sources});
  }
  if(b.action==='dismiss'){
   if(typeof b.id!=='string'||!/^[0-9a-f-]{36}$/i.test(b.id))throw Error('Choose a receipt email.');
   const r=await admin.from('finance_email_receipts').update({dismissed:true}).eq('owner_id',owner).eq('id',b.id);if(r.error)throw Error('Email could not be hidden.');return reply({ok:true});
  }
  if(b.action==='preferences'){
   if(typeof b.autoSync!=='boolean')throw Error('Choose a sync preference.');
   const r=await admin.from('finance_email_connections').update({auto_sync:b.autoSync}).eq('owner_id',owner);if(r.error)throw Error('Email preference could not be saved.');return reply({ok:true});
  }
  if(b.action==='disconnect'){
   const c=await admin.from('finance_email_connections').select('credential').eq('owner_id',owner).maybeSingle();
   // Remove local access first, including pending flows. Never leave an active local connection after an upstream revoke failure.
   const r=await admin.rpc('finance_email_disconnect',{_owner:owner});if(r.error)throw Error('Email connection could not be removed.');
   let revoked=!c.data;try{if(c.data){const secret=await crypt(c.data.credential,owner,'gmail',true);const result=await fetch('https://oauth2.googleapis.com/revoke',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:secret}),signal:AbortSignal.timeout(10000)});revoked=result.ok;}}catch{/* Local access already removed. */}
   return reply({ok:true,revoked});
  }
  if(b.action!=='sync')return reply({error:'Unknown email action.'},400);
  if(!ready())throw Error('Gmail is not configured.');
  const days=Number(b.days||90),reserved=await admin.rpc('finance_email_begin_sync',{_owner:owner,_query:receiptQuery(days),_window:days,_fresh:b.fresh===true});
  if(reserved.error)throw Error('A receipt sync is already running, or the inbox needs reconnecting.');
  const c=reserved.data;lease=c.lease;
  const d=await token({refresh_token:await crypt(c.credential,owner,'gmail',true),grant_type:'refresh_token'});
  const params=new URLSearchParams({q:c.sync_query,maxResults:'20',includeSpamTrash:'false'});if(c.sync_cursor)params.set('pageToken',c.sync_cursor);
  const page=await gmail('messages?'+params,d.access_token),items=page.messages||[];
  if(items.length>20)throw Error('Gmail returned an unexpected batch.');
  const rows:any[]=[];let skipped=0;
  for(let start=0;start<items.length;start+=3){await Promise.all(items.slice(start,start+3).map(async(item:any)=>{
   if(!/^[a-zA-Z0-9_-]{1,100}$/.test(item.id)){skipped++;return;}
   const seen=await admin.from('finance_email_seen').select('message_id').eq('owner_id',owner).eq('mailbox',c.mailbox).eq('message_id',item.id).maybeSingle();if(seen.error)throw Error('Receipt history could not be checked.');if(seen.data){skipped++;return;}
   const receipt=receiptMessage(await gmail('messages/'+encodeURIComponent(item.id)+'?format=full',d.access_token));if(!receipt){skipped++;return;}
   rows.push({...receipt,text:undefined,source_key:await sha256(receipt.text.replace(/\r\n?/g,'\n').trim()),body_cipher:await crypt(receipt.text,owner,'receipt:'+receipt.message_id)});
  }));}
  const saved=await admin.rpc('finance_email_finish_sync',{_owner:owner,_lease:lease,_rows:rows,_cursor:page.nextPageToken||null});if(saved.error)throw Error('Email connection changed before the sync finished.');
  return reply({imported:saved.data,checked:items.length,skipped,hasMore:!!page.nextPageToken});
 }catch(e){
  if(lease&&owner)await admin.from('finance_email_connections').update({lease:null,lease_until:null}).eq('owner_id',owner).eq('lease',lease);
  const message=e instanceof Error?e.message:'';
  return reply({error:/^(Gmail|Email |Receipt |Select |Choose |Confirm |The website|A receipt|Request )/.test(message)?message:'Email syncing could not finish. Try again; saved transactions were not changed.'},400);
 }
});
