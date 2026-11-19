import fs from 'node:fs';import assert from 'node:assert/strict';import ts from '../node_modules/typescript/lib/typescript.js';
const compile=p=>ts.transpileModule(fs.readFileSync(new URL(p,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const uri=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');const base=uri(compile('../src/lib/household-finance.ts').replace("'./accounting-plans'",JSON.stringify(uri(compile('../src/lib/accounting-plans.ts')))));
const {reconcileLifecycle}=await import(uri(compile('../src/lib/lifecycle-finance.ts').replace("'./household-finance'",JSON.stringify(base))));
const {analyticalReport}=await import(base);
const accounts=[{id:'mine',user_id:'me',name:'Mine',type:'checking',currency:'USD',current_balance:1000},{id:'theirs',user_id:'partner',name:'Theirs',type:'checking',currency:'USD',current_balance:2000}];
const rule=(account_id,owner_id,date,pct,balance,included)=>({id:account_id+date,account_id,owner_id,partner_id:owner_id==='me'?'partner':'me',effective_from:date,owner_pct:pct,balance_pct:balance,included});
const data={accounts,transactions:[],allocations:[],sharing:[],budgets:[]};
for(const a of accounts){data.allocations.push(rule(a.id,a.user_id,'0001-01-01',100,100,false),rule(a.id,a.user_id,'2026-02-01',50,100,true),rule(a.id,a.user_id,'2026-03-01',50,50,true));for(const month of ['01','02','03'])data.transactions.push({id:a.id+month,account_id:a.id,user_id:a.user_id,name:'Expense',amount:a.id==='mine'?100:200,date:`2026-${month}-15`,category:'Food',pending:false});}
const o={userId:'me',partnerId:'partner',linkId:'pair',view:'household',basis:'recorded',currency:'USD',start:'2026-01-01',end:'2026-01-31'};
for(const month of ['01','02','03']){const options={...o,start:`2026-${month}-01`,end:`2026-${month}-28`};const bridge=reconcileLifecycle(data,options,'2026-03-20');for(const r of bridge.rows){assert.ok(Math.abs(r.mine+r.partner+r.unattributed-r.combined)<1e-8);assert.ok(Math.abs(r.combined-r.outsideHousehold-r.household)<1e-8);assert.equal(r.unattributed,0);}const expenses=bridge.rows.find(r=>r.label==='Expenses');assert.equal(expenses.combined,300);assert.equal(expenses.household,month==='01'?0:300);}
assert.equal(analyticalReport(data,{...o,view:'mine'}).expenses,100);
assert.equal(analyticalReport(data,{...o,view:'mine',start:'2026-02-01',end:'2026-02-28'}).expenses,150);
assert.equal(analyticalReport(data,{...o,view:'mine',start:'2026-02-01',end:'2026-02-28'}).netCash,-100,'Shared expenses do not halve owned cash');
assert.equal(analyticalReport(data,{...o,view:'mine',start:'2026-03-01',end:'2026-03-31'}).netCash,-150,'Explicit pooling changes personal attribution only');
assert.equal(reconcileLifecycle(data,{...o,basis:'comparable'}).rows[1].outsideHousehold,0,'Constant account scope reconciles before sharing');
const missing=reconcileLifecycle(data,{...o,accountIds:['mine','unavailable']});assert.deepEqual(missing.missing,['unavailable']);
const original=structuredClone(data);original.allocations[0].partner_id='former-partner';original.allocations[0].owner_pct=70;
assert.equal(reconcileLifecycle(original,o).unattributed,true,'Former partner share must remain explicit');
const normalized=reconcileLifecycle({...data,transactions:[...data.transactions,{id:'oneoff',account_id:'mine',user_id:'me',name:'Oneoff',amount:99,date:'2026-03-20',category:'Other',is_one_time_expense:true}]},{...o,start:'2026-03-01',end:'2026-03-31',normalized:true});
assert.equal(normalized.rows.find(r=>r.label==='Expenses').combined,300);
console.log('PASS: single, shared-expense and merged phases; personal-to-combined and household-scope bridges; cash ownership; normalized basis; missing history and former-partner residuals.');
const privateAccount={...accounts[0],id:'personal-only',current_balance:500};
const withPrivate={...data,accounts:[...accounts,privateAccount],transactions:[...data.transactions,{id:'personal-tx',account_id:'personal-only',user_id:'me',name:'Personal purchase',amount:125,date:'2026-01-15',category:'Other'}]};
const comparableOptions={...o,basis:'comparable'};
const scoped=reconcileLifecycle(withPrivate,comparableOptions).rows.find(r=>r.label==='Expenses');
assert.equal(scoped.household,analyticalReport(withPrivate,comparableOptions).expenses,'Lifecycle household must equal the statement scope');
assert.equal(scoped.outsideHousehold,125,'Private accounts are shown outside household rather than silently expanding it');