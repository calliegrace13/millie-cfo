import fs from 'node:fs';import assert from 'node:assert/strict';import ts from '../node_modules/typescript/lib/typescript.js';
const js=ts.transpileModule(fs.readFileSync(new URL('../supabase/functions/_shared/transaction-classifier.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;const {classify,analyze}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const cash={id:'bank',type:'checking',currency:'USD'},card={id:'card',type:'credit',currency:'USD'};const tx=(id,account_id,amount,name,extra={})=>({id,user_id:'me',account_id,amount,name,date:'2026-09-01',classification_source:'auto',...extra});
assert.equal(classify(tx('x','card',6,'STARBUCKS STORE 123'),card).category,'Food & Dining');assert.equal(classify(tx('x','card',-6,'Starbucks refund'),card).kind,'refund');
assert.equal(classify(tx('x','bank',-4000,'STARBUCKS PAYROLL',{provider_metadata:{primary:'INCOME',detailed:'INCOME_WAGES',confidence:'HIGH'}}),cash).kind,'income');
assert.equal(classify(tx('x','bank',-4000,'Deposit'),cash).kind,'unknown');assert.equal(classify(tx('x','bank',-30,'Venmo payment'),cash).kind,'unknown');
assert.equal(classify(tx('x','card',-500,'AUTOPAY PAYMENT THANK YOU'),card).category,'Credit Card Payment');
assert.equal(classify(tx('x','bank',500,'Card payment'),cash).category,'Credit Card Payment');
assert.equal(classify(tx('x','card',6,'Starbucks',{category:'My coffee',classification_locked:true}),card).category,'My coffee');
assert.equal(classify(tx('x','card',6,'Coffee',{merchant_name:'Local Coffee',provider_metadata:{merchant_entity_id:'c'}}),card,[{merchant_key:'entity:c',category:'Dining out'}]).category,'Dining out');
const pair=[tx('out','bank',500,'Card payment'),tx('in','card',-500,'Payment thank you')];let d=analyze(pair,[cash,card]);assert.equal(d.get('out').match_id,'in');assert.equal(d.get('in').match_id,'out');
for(const altered of [{...pair[1],amount:-499.99},{...pair[1],user_id:'another'},{...pair[1],account_id:'bank'},{...pair[1],pending:true},{...pair[1],date:'2026-09-20'},{...pair[1],name:'Starbucks refund'}])assert.equal(analyze([pair[0],altered],[cash,card]).get('out').match_id,null);
assert.equal(analyze(pair,[cash,{...card,currency:'EUR'}]).get('out').match_id,null);
d=analyze([...pair,tx('in2','card2',-500,'Payment thank you')],[cash,card,{...card,id:'card2'}]);assert.equal(d.get('out').match_id,null);assert.equal(d.get('in').match_id,null);assert.equal(d.get('out').review,true);
assert.equal(classify(tx('x','bank',-1,'interest',{provider_metadata:{primary:'INCOME',detailed:'INCOME_INTEREST_EARNED',confidence:'HIGH'}}),cash).income_type,'other');
assert.equal(classify(tx('x','card',5,'Shop',{provider_metadata:{primary:'GENERAL_MERCHANDISE',confidence:'LOW',mcc:'5814'}}),card).category,'Food & Dining');
console.log('PASS: merchant semantics, payroll versus refund, ambiguous deposits/P2P, corrections, learned preferences, exact bilateral matches, ambiguity and owner/currency/date/pending isolation.');

assert.equal(analyze([tx('out','bank',500,'CHASE EPAYMENT'),pair[1]],[cash,{...card,provider_institution_name:'Chase'}]).get('out').match_id,'in');
assert.equal(classify(tx('x','card',6,'Starbucks',{provider_metadata:{primary:'GENERAL_MERCHANDISE',confidence:'VERY_HIGH'}}),card).review,true);

assert.equal(classify(tx('x','card',3,'MTA',{category:'Transportation'}),card).category,'Transportation');
assert.equal(classify(tx('x','card',4,'Cafe',{subcategory:'FOOD_AND_DRINK_RESTAURANT',category:'Shopping'}),card).category,'Food & Dining');
