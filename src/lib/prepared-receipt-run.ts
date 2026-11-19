import type {ReceiptSource} from './receipt-selection';
const fingerprint=async(text:string)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text.replace(/\r\n/g,'\n').trim())))].map(n=>n.toString(16).padStart(2,'0')).join('');

// Prepared edits win over a reloaded copy of the same Gmail message. File/pasted
// copies with identical text are also consumed without another provider request.
export async function preparedReceiptRun(prepared:ReceiptSource[], selected:string[], load:(id:string)=>Promise<ReceiptSource>){
 const registry=new Map<string,ReceiptSource>(),hashes=new Map<string,string>(),processed=new Set<string>(),processedIds=new Set<string>();
 const entries: {source:ReceiptSource;id:string;hash:string}[]=[];
 for(const source of prepared){const hash=await fingerprint(source.text),id=source.emailId||'prepared:'+hash;entries.push({source,id,hash});if(!registry.has(id)){registry.set(id,{...source,name:source.name.slice(0,150)});hashes.set(id,hash);}}
 return {
  ids:[...new Set([...entries.map(e=>e.id),...selected])],
  async loadBatch(remaining:string[]){
   const ids:string[]=[],sources:ReceiptSource[]=[],batchHashes=new Set<string>();let characters=0;
   for(const id of remaining.slice(0,10)){
    let source=registry.get(id);
    if(!source){if(id.startsWith('prepared:'))throw Error('Re-add the unfinished prepared receipt to resume, or leave that batch for manual review.');source=await load(id);registry.set(id,source);hashes.set(id,await fingerprint(source.text));}
    const hash=hashes.get(id)!;
    if(processed.has(hash)||batchHashes.has(hash)){ids.push(id);continue;}
    if(source.text.length<20||source.text.length>20000)throw Error('A prepared receipt must contain 20 to 20,000 characters. Edit its text before processing.');
    if(characters+source.text.length>50000)break;
    ids.push(id);sources.push({name:source.name.slice(0,150),text:source.text});characters+=source.text.length;batchHashes.add(hash);
   }
   return {ids,sources};
  },
  complete(ids:string[]){for(const id of ids){processedIds.add(id);const hash=hashes.get(id);if(hash)processed.add(hash);}return entries.filter(e=>processedIds.has(e.id)||processed.has(e.hash)).map(e=>e.source);},
 };
}
