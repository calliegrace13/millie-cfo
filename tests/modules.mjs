import fs from 'node:fs';import assert from 'node:assert/strict';import ts from '../node_modules/typescript/lib/typescript.js';
const compile=p=>ts.transpileModule(fs.readFileSync(new URL(p,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const uri=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const {ALL_MODULES,PRESETS,normalizeModules,sameModules,visiblePath,moduleForPath}=await import(uri(compile('../src/lib/modules.ts')));
const base=uri(compile('../src/lib/household-finance.ts').replace("'./accounting-plans'",JSON.stringify(uri(compile('../src/lib/accounting-plans.ts')))));
const {analyticalReport}=await import(base);
const {restatedClose}=await import(uri(compile('../src/lib/durable-history.ts').replace("'./household-finance'",JSON.stringify(base))));
const {closedForReview}=await import(uri(compile('../supabase/functions/_shared/review-periods.ts')));
assert.deepEqual(normalizeModules(undefined),ALL_MODULES,'Existing users keep all tools');
assert.deepEqual(normalizeModules(['household','unknown','household']),['household']);
assert.deepEqual(normalizeModules([]),[],'A core-only workspace is supported');
assert.equal(PRESETS.length,3);for(const p of PRESETS)assert(sameModules(p.modules,normalizeModules(p.modules)));
const account={id:'card',user_id:'me',name:'Card',type:'credit',currency:'USD',current_balance:300,is_deleted:true};
const tx=(id,date,amount)=>({id,date,amount,user_id:'me',account_id:'card',name:id,category:'Food',pending:false});
const rules=[{id:'single',account_id:'card',owner_id:'me',partner_id:'partner',effective_from:'0001-01-01',owner_pct:100,balance_pct:100,included:true},{id:'shared',account_id:'card',owner_id:'me',partner_id:'partner',effective_from:'2026-02-01',owner_pct:50,balance_pct:50,included:true}];
const held={accounts:[account],transactions:[tx('single','2026-01-10',100),tx('shared','2026-02-10',100)],allocations:rules,sharing:[],budgets:[{id:'target',owner_id:'me',view:'mine',currency:'USD',category:'Food',effective_month:'2026-01-01',amount:250}],documents:[]};
const source={...structuredClone(held),transactions:[...held.transactions,{...tx('later refund','2026-04-10',-20),recognition_date:'2026-02-10'}]};
const options={userId:'me',partnerId:'partner',linkId:'pair',view:'mine',basis:'recorded',currency:'USD',start:'2026-01-01',end:'2026-03-31',normalized:true};
const snapshot=JSON.stringify({held,source});
const expected=analyticalReport(source,options),closed=analyticalReport(held,options),restated=restatedClose(held,source,options);
assert.equal(closed.expenses,150);assert.equal(expected.expenses,140);assert.equal(restated.expenses,140);
const close={owner_id:'me',kind:'close',payload:{reviewScope:{version:1,ownerId:'me',start:options.start,end:options.end,accountIds:['card']}}};
for(let mask=0;mask<2**ALL_MODULES.length;mask++){
 const enabled=normalizeModules(ALL_MODULES.filter((_,i)=>mask&(1<<i)));
 for(const path of ['/','/accounts','/transactions','/transaction-rules','/settings','/customize','/investments'])assert(visiblePath(path,enabled),path+' must always be reachable');
 for(const [path,id] of [['/income-statement','analyst'],['/budgets','everyday'],['/household','household'],['/close','close'],['/amortization','assets'],['/runway','runway'],['/goals','goals'],['/card-benefits','rewards'],['/compensation','income'],['/investment-analysis','investments'],['/debt-payoff','debt'],['/long-term','longterm']])assert.equal(visiblePath(path,enabled),enabled.includes(id));
 assert.deepEqual(analyticalReport(source,options),expected,'Preferences must not enter the finance model');
 assert.deepEqual(analyticalReport(held,options),closed,'Held report must be immutable');
 assert.deepEqual(restatedClose(held,source,options),restated,'Later refund still restates held scope');
 assert(closedForReview(held.transactions[0],[close],'me'),'Hiding Close must not reopen review');
 assert.equal(JSON.stringify({held,source}),snapshot,'No source records change');
 assert(sameModules(normalizeModules(JSON.parse(JSON.stringify(enabled))),enabled),'Preference round trip');
}
assert.equal(moduleForPath('/advanced-balance'),'analyst');assert.equal(moduleForPath('/asset-register'),'assets');
// Enforce dependency direction so future module work cannot gate accounting.
for(const file of ['household-finance.ts','accounting-plans.ts','durable-history.ts'])assert(!fs.readFileSync(new URL('../src/lib/'+file,import.meta.url),'utf8').includes("from './modules'"));
console.log('PASS: 4096 workspace combinations, core routes, presets, archived account history, dated splits, immutable close, refund restatement and unchanged ledger.');

