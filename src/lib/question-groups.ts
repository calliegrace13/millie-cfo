export type QuestionGroup={key:string;title:string;items:any[];purchases:any[]};
const normalized=(s:unknown)=>String(s||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
function topic(q:any){
 const text=String(q.payload?.question||'').toLowerCase();
 // Broad topics organize the view only. Every original question and date stays
 // visible, and the owner explicitly chooses what a shared answer covers.
 if(q.module==='everyday'&&/target|monthly.*limit|monthly.*budget/.test(text))return 'Monthly budget targets';
 if(q.module==='everyday'&&/one.off|irregular|routine/.test(text))return 'Regular versus one-off spending';
 if(q.module==='household'&&/share|split|allocat|partner/.test(text))return 'How to split shared spending';
 if(q.module==='runway'&&/reserve|buffer|cash|saving/.test(text))return 'Cash plans and reserves';
 if(q.module==='goals'&&/target|goal|deadline|priority/.test(text))return 'Goal amounts and priorities';
 return '';
}
export function questionGroups(items:any[],transactions:any[],owner:string,accounts:any[]=[]):QuestionGroup[]{
 const tx=new Map(transactions.filter(t=>t.user_id===owner).map(t=>[t.id,t]));const groups=new Map<string,QuestionGroup>();
 for(const q of items.filter(q=>q.owner_id===owner&&q.kind==='question'&&q.status==='needs_input'&&!q.answer)){
  const t=tx.get(q.payload?.transaction_id),merchant=t&&String(t.merchant_name||t.name||'').trim();
  const subject=topic(q),scope=q.payload?.scope;
  // Don't normalize raw bank descriptions by stripping digits: separate
  // airlines, people and payment references must not silently become aliases.
  const key=merchant?'merchant:'+normalized(merchant):subject?'topic:'+q.module+':'+subject:'question:'+q.module+':'+q.task+':'+JSON.stringify(scope||{})+':'+normalized(q.payload?.question||q.id);
  let group=groups.get(key);if(!group){group={key,title:merchant||subject||q.payload?.title||'Question to review',items:[],purchases:[]};groups.set(key,group);}
  group.items.push(q);if(t&&!group.purchases.some(p=>p.id===t.id))group.purchases.push({...t,currency:accounts.find(a=>a.id===t.account_id&&a.user_id===owner)?.currency||''});
 }
 return [...groups.values()].sort((a,b)=>b.items.length-a.items.length||a.title.localeCompare(b.title));
}
