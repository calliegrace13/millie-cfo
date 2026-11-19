
export const GMAIL_SCOPE='https://www.googleapis.com/auth/gmail.readonly';
export const receiptQuery=(days:number,now=Date.now())=>{
 if(![30,90,365,1095].includes(days))throw Error('Choose a supported search window.');
 return 'after:'+Math.floor((now-days*86400000)/1000)+' {subject:receipt subject:invoice subject:order subject:purchase subject:"order confirmation" subject:"your order" subject:"payment confirmation" subject:itinerary subject:"e-ticket" subject:"flight confirmation" subject:"booking confirmation" subject:"reservation confirmation"} -in:spam -in:trash';
};
export const url64=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
export async function sha256(value:string){return url64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))));}
export function authorizationURL(clientId:string,redirect:string,state:string,challenge:string){
 return 'https://accounts.google.com/o/oauth2/v2/auth?'+new URLSearchParams({client_id:clientId,redirect_uri:redirect,response_type:'code',scope:GMAIL_SCOPE,access_type:'offline',prompt:'consent select_account',state,code_challenge:challenge,code_challenge_method:'S256'}).toString();
}
export function safeMailText(html:string){
 return html.replace(/<(script|style|svg|iframe|object)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,' ').replace(/<img\b[^>]*>/gi,' ').replace(/<!--[\s\S]*?-->/g,' ').replace(/<[^>]*>/g,' ').replace(/&(?:nbsp|amp|lt|gt|quot|apos|#39);/gi,e=>({'&nbsp;':' ','&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&#39;':"'"}[e.toLowerCase()]||' ')).replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();
}
export function gmailBody(payload:any):string{
 const plain:string[]=[],html:string[]=[];let nodes=0,total=0;
 function walk(p:any,depth=0){if(!p||depth>10||++nodes>100)return;const raw=p.body?.data;if(typeof raw==='string'&&raw.length<270000&&total<200000){try{const bytes=Uint8Array.from(atob(raw.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));const text=new TextDecoder().decode(bytes);total+=text.length;if(p.mimeType==='text/plain')plain.push(text);else if(p.mimeType==='text/html')html.push(safeMailText(text));}catch{/* Invalid mail is skipped; never render HTML. */}}for(const child of (p.parts||[]).slice(0,50))walk(child,depth+1);}
 walk(payload);return (plain.length?plain.join('\n'):html.join('\n')).slice(0,19500).trim();
}
export function receiptMessage(message:any){
 const headers=message.payload?.headers||[],get=(name:string)=>String(headers.find((h:any)=>String(h.name).toLowerCase()===name)?.value||'').replace(/[\r\n]+/g,' ').slice(0,300);
 const body=gmailBody(message.payload),stamp=Number(message.internalDate);
 if(!/^[a-zA-Z0-9_-]{1,100}$/.test(message.id)||body.length<20||!Number.isFinite(stamp)||stamp<0||message.sizeEstimate>2000000)return null;
 const date=new Date(stamp).toISOString();return {message_id:message.id,subject:get('subject')||'Purchase receipt',sender:get('from'),sent_at:date,text:(get('subject')+'\nEmail date: '+date+'\n'+body).slice(0,20000)};
}
