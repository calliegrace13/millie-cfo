import {validateReceipts,type Receipt} from './receipt-contract.ts';
import {sha256} from './email-receipts.ts';
type Source={name:string;text:string};
type Issue={source:number;reason:string};
type Result={receipts:Receipt[];issues:Issue[]};
type History={source_key:string;state:string;receipts:Receipt[];issues:Issue[];email_id:string|null};
export const receiptKey=(text:string)=>sha256(text.replace(/\r\n?/g,'\n').trim());

function hasChargeEvidence(s:Source){
 return /(?:grand total|order total|total (?:charged|paid)|amount (?:charged|paid)|payment received|card charged|^total)\s*[:\s]*(?:USD\s*)?[$€£\d]/im.test(s.text);
}
function isNotice(s:Source){
 const subject=s.name+' '+s.text.split('\n',1)[0];
 return !hasChargeEvidence(s)&&/\b(?:on the way|out for delivery|shipping update|track your shipment|(?:forgot|still deciding on|last chance to add) purchase protection|bonus points|\d+% off|sneak peek|remember your last purchase|find something new|shop (?:now|the sale)|limited.time offer)\b/i.test(subject);
}
function supportedNotice(data:any,source:number,s:Source){
 if(!Array.isArray(data?.sourceChecks)||data.sourceChecks.length>10||hasChargeEvidence(s))return false;
 const checks=data.sourceChecks.filter((x:any)=>x?.source===source);
 if(checks.length!==1||checks[0].kind!=='notice')return false;
 const quote=checks[0].evidence;
 return typeof quote==='string'&&quote.trim().length>=8&&quote.length<=400&&s.text.toLowerCase().includes(quote.trim().toLowerCase());
}
export function checkReceiptBatch(data:unknown,sources:Source[]):Result{
 const raw=(data as any)?.receipts;
 const receipts:Receipt[]=[],issues:Issue[]=[];
 // Bound each provider response. Invalid or missing indexes never identify another source.
 const rows=Array.isArray(raw)&&raw.length<=40?raw:[];
 for(let source=0;source<sources.length;source++){
  const candidates=rows.filter(r=>r&&r.source===source);
  let issue='';
  for(const row of candidates){
   try{receipts.push(...validateReceipts({receipts:[{...row,source:0}]},[sources[source]]).map(r=>({...r,source})));}
   catch(e){issue=e instanceof Error&&/^(Receipt |A suggested )/.test(e.message)?e.message:'The purchase details could not be verified against this receipt.';}
  }
  if(!candidates.length&&!isNotice(sources[source])&&!supportedNotice(data,source,sources[source]))issue='No supported purchase was extracted. Check the receipt total, date and items.';
  if(issue)issues.push({source,reason:issue});
 }
 return {receipts:distinctReceipts(receipts),issues};
}
function distinctReceipts(receipts:Receipt[]){
 const seen=new Set<string>();
 return receipts.filter(r=>{
  const key=JSON.stringify([r.merchant?.toLowerCase(),r.reference||r.source,r.date,r.amount,r.currency]);
  if(seen.has(key))return false;seen.add(key);return true;
 });
}

// Reserve only new source fingerprints. Persisting them in the paid reservation
// makes overlaps safe even if the worker exits after the provider has charged.
export async function processReceiptSources(admin:any,owner:string,sources:Source[],
 infer:(fresh:Source[],keys:string[])=>Promise<Result>,legacy?:{status:string;result?:Result;whole:boolean}){
 const keys=await Promise.all(sources.map(s=>receiptKey(s.text)));
 const positions=new Map<string,number>();keys.forEach((k,i)=>{if(!positions.has(k))positions.set(k,i);});
 const unique=[...positions.keys()];
 const lookup=async()=>{
  const read=await admin.rpc('finance_receipt_source_history',{_owner:owner,_keys:unique});
  if(read.error)throw Error('Unable to read saved receipt checks. No new analysis was started.');
  return new Map<string,History>((read.data||[]).map((row:History)=>[row.source_key,row]));
 };
 const history=await lookup();
 if([...history.values()].some(h=>h.state==='running')||legacy?.status==='running')throw Error('An analysis is still running. Resume this receipt batch shortly.');
 const fresh=unique.filter(k=>!history.has(k)&&!legacy?.whole&&!isNotice(sources[positions.get(k)!]));
 const result:Result={receipts:[],issues:[]};
 function append(key:string,rows:Receipt[],reasons:Issue[]){
  const source=positions.get(key)!;
  result.receipts.push(...rows.map(r=>({...r,source})));
  result.issues.push(...reasons.slice(0,1).map(i=>({source,reason:i.reason})));
 }
 for(const key of unique){
  const index=positions.get(key)!;
  const saved=history.get(key);
  if(saved?.state==='succeeded'){append(key,saved.receipts,saved.issues);continue;}
  if(legacy?.whole&&legacy.status==='succeeded'){
   append(key,(legacy.result?.receipts||[]).filter(r=>r.source===index),(legacy.result?.issues||[]).filter(i=>i.source===index));continue;
  }
  if(saved||legacy?.whole){
   if(!isNotice(sources[index]))append(key,[],[{source:index,reason:'This receipt was already checked, but its purchase evidence was not saved. Review it without another AI call.'}]);
  }
 }
 if(fresh.length){
  const batch=await infer(fresh.map(k=>sources[positions.get(k)!]),fresh);
  for(const [i,key] of fresh.entries())append(key,batch.receipts.filter(r=>r.source===i),(batch.issues||[]).filter(x=>x.source===i));
 }
 result.receipts=distinctReceipts(result.receipts);
 if(result.issues.length){
  const save=await admin.rpc('finance_record_receipt_exceptions',{_owner:owner,_items:result.issues.map(issue=>({key:keys[issue.source],name:sources[issue.source].name,reason:issue.reason}))});
  if(save.error)throw Error('Unable to save receipt questions. Resume to recover the checked results.');
 }
 return result;
}
