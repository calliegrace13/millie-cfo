import type {Transaction} from './types';
export const isAmazonPurchase=(t:Pick<Transaction,'merchant_name'|'name'>)=>/\b(?:amazon|amzn)(?:\b|mktp|prime|digital|fresh)/i.test(`${t.merchant_name||''} ${t.name||''}`);
export function amazonEvidence(t:Pick<Transaction,'merchant_name'|'name'>){
 const text=`${t.merchant_name||''} ${t.name||''}`;
 if(/\bfresh\b|whole\s*foods|\bgrocer(?:y|ies)\b/i.test(text))return {lane:'grocery',label:'Grocery wording',detail:/subscri|membership/i.test(text)?'Grocery-service subscription wording. Check whether this is a service fee rather than grocery items.':'The bank description mentions groceries, Fresh or Whole Foods. Check the order before confirming grocery items.'};
 if(/prime|digital|video|kindle|audible|music/i.test(text))return {lane:'digital',label:'Prime / digital wording',detail:'May be a membership or digital purchase. Check the service or receipt.'};
 return {lane:'unknown',label:'Items unknown',detail:'A general Amazon charge does not establish groceries versus shopping.'};
}
export const reviewSnapshot=(t:Transaction)=>({id:t.id,updated_at:t.updated_at,amount:t.amount,date:t.date,account_id:t.account_id,category:t.category??null});
