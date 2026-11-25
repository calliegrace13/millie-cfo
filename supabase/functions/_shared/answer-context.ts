import {merchantKey} from './learning-policy.ts';
const mixed=/\b(amazon|amzn|target|walmart|costco|etsy|walgreens)\b/i;
const general=(s:string)=>! /\b(sometimes|not always|not usually|maybe|unsure|not sure|don't know)\b/i.test(s)&&/\b(always|usually|typically|routine|prefer|default|categorize|classify|treat|all my|all of my)\b/i.test(s)&&!/^\s*(?:not |don't |do not )?(?:always|usually|typically)\s*$/i.test(s);
function preferenceQuestion(m:any){return m.module==='everyday'&&/monthly|target|budget/i.test(m.question||'')||m.module==='goals'&&/target|goal|priority|deadline/i.test(m.question||'')||m.module==='household'&&/share|split|allocat|relationship/i.test(m.question||'');}
export function matchingAnswerMemories(memories:any[],t:any,owner:string,module:string){
 const key=merchantKey(t.merchant||t.merchant_name||t.name||'');
 return memories.filter(m=>{
  if(m.owner_id!==owner||!m.enabled||!m.answer?.trim())return false;
  if(!m.transaction_id)return m.module===module&&(general(m.answer)||preferenceQuestion(m));
  if(m.transaction_id===t.id)return true;
  if(!key||key!==m.merchant_key||m.account_id!==t.account_id||m.currency!==t.currency||t.date<String(m.purchase_date)||!(Number(m.amount)>0)||Number(t.amount)<Number(m.amount)*.75||Number(t.amount)>Number(m.amount)*1.25)return false;
  // Item-specific answers at mixed retailers do not identify a future order.
  return !mixed.test(m.merchant||'')||general(m.answer)&&/\b(always|prefer|default|categorize|classify|treat|all my|all of my)\b/i.test(m.answer);
 });
}
export async function savedAnswerSources(client:any,owner:string,tx:any[],module:string){
 const setting=await client.from('finance_answer_memory_settings').select('enabled').eq('owner_id',owner).maybeSingle();if(setting.error)throw Error('Could not check your answer memory settings.');if(!setting.data?.enabled)return {sources:[],answers:{}};
 const keys=[...new Set(tx.map(t=>merchantKey(t.merchant||'')).filter(Boolean))];
 const [purchases,preferences]=await Promise.all([
  keys.length?client.from('finance_answer_memory_evidence').select('*').eq('owner_id',owner).eq('enabled',true).in('merchant_key',keys).order('updated_at',{ascending:false}).limit(200):Promise.resolve({data:[]}),
  client.from('finance_answer_memory_evidence').select('*').eq('owner_id',owner).eq('enabled',true).is('transaction_id',null).eq('module',module).order('updated_at',{ascending:false}).limit(50)
 ]);if(purchases.error||preferences.error)throw Error('Could not load your saved answers.');
 const rows=[...(purchases.data||[]),...(preferences.data||[])],buckets=new Map<string,{memory:any;ids:string[]}>();
 for(const t of tx)for(const m of matchingAnswerMemories(rows,t,owner,module).slice(0,3)){
  const key=JSON.stringify([m.answer,m.merchant_key,m.module,!m.transaction_id]);const b=buckets.get(key)||{memory:m,ids:[]};if(!b.ids.includes(t.id))b.ids.push(t.id);buckets.set(key,b);
 }
 // Planning preferences can still be useful when there are no purchases.
 if(!tx.length)for(const m of rows.filter(m=>!m.transaction_id&&matchingAnswerMemories([m],{},owner,module).length))buckets.set(m.id,{memory:m,ids:[]});
 const sources:any[]=[],answers:Record<string,string>={};let chars=0;
 for(const {memory:m,ids} of buckets.values()){
  const text=JSON.stringify({answer:m.answer,earlierQuestion:m.question,source_item_id:m.id,sourcePurchase:m.transaction_id?{merchant:m.merchant,date:m.purchase_date,amount:m.amount,currency:m.currency,account_id:m.account_id}:null,appliesOnlyTo:ids,context:general(m.answer)||!m.transaction_id?'Earlier owner preference; honor its conditions and exceptions.':'Earlier purchase answer, not a blanket merchant rule. Reuse only a clearly stable routine purpose when the new purchase is comparable.',limits:'Exact merchant/account/currency, no earlier than source purchase; future amounts within 25%. These limits identify context, not proof of identical items. Do not copy old travel/coverage dates, refund terms, item lists or useful lives. Conflicting or different evidence needs a targeted question.'});
  if(chars+text.length>12000||sources.length>=12)continue;chars+=text.length;answers[m.id]=m.answer;
  sources.push({name:general(m.answer)||!m.transaction_id?'Your remembered preference':'Your earlier purchase answer',text});
 }
 return {sources,answers};
}
