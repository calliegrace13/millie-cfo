import fs from 'node:fs';import assert from 'node:assert/strict';import ts from '../node_modules/typescript/lib/typescript.js';
const load=async path=>import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(fs.readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));
const {preparedReceiptRun}=await load('../src/lib/prepared-receipt-run.ts'),{runReceiptQueue}=await load('../src/lib/receipt-queue.ts');
const mail=i=>({emailId:'email-'+i,name:'Receipt '+i,text:'Synthetic purchase receipt with total and evidence '+i});
async function execute(prepared,selected,limit=20,remote=async id=>mail(Number(id.replace('email-','')))){
 let reads=0,calls=0,used=0;const consumed=new Set(),sent=[],completed=[];
 const run=await preparedReceiptRun(prepared,selected,async id=>{reads++;return remote(id);});
 const result=await runReceiptQueue(run.ids,{}, {budget:async()=>({provider:'fixture',model:'fixture',remaining:limit-used}),maxRequests:limit,newId:()=>crypto.randomUUID(),load:run.loadBatch,analyze:async p=>{calls++;used++;sent.push(...p.sources);assert(p.sources.length<=10);assert(p.sources.reduce((n,s)=>n+s.text.length,0)<=50000);return {status:'succeeded',result:{}};},apply:async()=>{},completed:ids=>{completed.push(...ids);run.complete(ids).forEach(s=>consumed.add(s));},checkpoint:()=>{},stopped:()=>false,progress:()=>{}});
 return {result,run,reads,calls,sent,completed,consumed};
}
let prepared=Array.from({length:10},(_,i)=>mail(i)),selected=Array.from({length:25},(_,i)=>'email-'+i);
let r=await execute(prepared,selected);assert.equal(r.run.ids.length,25);assert.equal(r.result.completed,25);assert.equal(r.calls,3);assert.equal(r.reads,15);assert.equal(r.consumed.size,10);assert.equal(new Set(r.sent.map(s=>s.text)).size,25);
const edited={...mail(0),text:'User corrected receipt text should take priority'};r=await execute([edited],['email-0']);assert.equal(r.reads,0);assert.equal(r.sent[0].text,edited.text);
const file={name:'Imported file',text:mail(0).text};r=await execute([file],['email-0','email-1']);assert.equal(r.calls,1);assert.equal(r.sent.length,2,'Identical file/email copies must not occupy two analysis slots');assert(r.consumed.has(file));
prepared=Array.from({length:10},(_,i)=>({...mail(i),emailId:undefined}));selected=Array.from({length:10},(_,i)=>'email-'+i);r=await execute(prepared,selected,1);assert.equal(r.calls,1,'Copies encountered after the prepared batch must not start another paid analysis, even at the cap');assert.equal(r.result.completed,20);assert.equal(r.consumed.size,10);
prepared=Array.from({length:12},(_,i)=>mail(i));r=await execute(prepared,[],1);assert.equal(r.result.completed,10);assert.equal(r.consumed.size,10);assert(!r.consumed.has(prepared[10]),'Over-limit prepared inputs must remain available');
r=await execute([file],[],0);assert.equal(r.calls,0);assert.equal(r.consumed.size,0,'A quota stop must not clear prepared inputs');
prepared=Array.from({length:4},(_,i)=>({name:'Large '+i,text:String(i).repeat(18000)}));r=await execute(prepared,[]);assert.equal(r.calls,2);assert.equal(r.consumed.size,4);
r=await execute([{name:'Too large',text:'x'.repeat(20001)}],[]);assert(r.result.error);assert.equal(r.calls,0);assert.equal(r.consumed.size,0);
const original=mail(1),duplicate={...mail(1),text:'A duplicate import of an already prepared message'};r=await execute([original,duplicate],['email-1']);assert.equal(r.sent.length,1);assert(r.consumed.has(original));assert(r.consumed.has(duplicate));
console.log('PASS prepared-first unified queue, edited Gmail precedence, Gmail/file/paste duplicate prevention across batches, prepared-only runs, character limits, quota stops and clearing only completed prepared inputs. No paid calls or live financial writes.');
