export async function protectAIKey(secret:string,value:string,owner:string,provider:string,decrypt=false){
 const enc=new TextEncoder(),raw=Uint8Array.from(atob(secret),c=>c.charCodeAt(0));if(raw.length!==32)throw Error('AI connection storage is unavailable.');
 const key=await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt','decrypt']),aad=enc.encode(`millie-ai-v1:${owner}:${provider}`);
 if(decrypt){const bytes=Uint8Array.from(atob(value),c=>c.charCodeAt(0));return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.slice(0,12),additionalData:aad},key,bytes.slice(12)));}
 const iv=crypto.getRandomValues(new Uint8Array(12)),cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad},key,enc.encode(value)));return btoa(String.fromCharCode(...iv,...cipher));
}
