import fs from 'node:fs';import assert from 'node:assert/strict';import ts from '../node_modules/typescript/lib/typescript.js';import {edgeModule} from './helpers/edge-module.mjs';
let authenticated=true,updates=0;const id='11111111-1111-4111-8111-111111111111',old='22222222-2222-4222-8222-222222222222';
const work={status:'failed',request_id:old,payload:{provider:'anthropic',model:'old',module:'close',task:'review'},summary:'Earlier failure'};
const env={SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture',SUPABASE_ANON_KEY:'fixture',MILLIE_ALLOWED_ORIGINS:'https://millie.invalid'};globalThis.Deno={env:{get:k=>env[k]}};
const db={auth:{getUser:async()=>({data:{user:authenticated?{id:'owner'}:null}})},rpc:async name=>{assert.equal(name,'finance_ai_status');return {data:{active:'openai',connections:[{provider:'openai',model:'new'}]}};},from:table=>{
 let value=null;const filters={};const q={update:v=>{value=v;return q;},eq:(k,v)=>{filters[k]=v;return q;},select:()=>q,maybeSingle:async()=>{assert.equal(filters.owner_id,'owner');return {data:table==='finance_autopilot_work'&&work.status==='failed'?{...work}:null};},then:resolve=>{assert.equal(filters.owner_id,'owner');if(table==='finance_autopilot_work'){assert.equal(filters.id,id);if(work.status==='failed'){Object.assign(work,value);updates++;return resolve({data:[{id}]});}return resolve({data:[]});}return resolve({});}};return q;
}};
globalThis.__createClient=()=>db;globalThis.__serve=h=>globalThis.__handler=h;
let source=fs.readFileSync('supabase/functions/finance-autopilot/index.ts','utf8').replace(/import \{serve\}[^\n]+\n/,'const serve=globalThis.__serve;\n').replace(/import \{createClient\}[^\n]+\n/,'const createClient=globalThis.__createClient;\n');source=source.replace(/from ['"]\.\.\/_shared\/([^'"]+)['"]/g,(_,p)=>'from '+JSON.stringify(edgeModule('_shared/'+p)));
await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));
globalThis.fetch=()=>{throw Error('Queueing retries must not call a paid provider');};
const request=body=>globalThis.__handler(new Request('https://fixture.invalid',{method:'POST',headers:{origin:'https://millie.invalid','content-type':'application/json'},body:JSON.stringify(body)}));
let r=await request({action:'retry-many',ids:[id,id]});assert.equal(r.status,200);assert.equal((await r.json()).queued,1);assert.equal(updates,1);assert.notEqual(work.request_id,old);assert.equal(work.payload.provider,'openai');assert.equal(work.result.previousAttempt.requestId,old);
r=await request({action:'retry-many',ids:[id]});assert.equal((await r.json()).queued,0);assert.equal(updates,1,'A repeated button click cannot authorize another attempt');
authenticated=false;assert.equal((await request({action:'retry-many',ids:[id]})).status,401);
console.log('PASS owner-authenticated one-time retry queue, previous-attempt audit, current-model binding, duplicate-click protection and zero paid calls while queueing.');
