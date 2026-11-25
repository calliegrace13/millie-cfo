import {quarterBounds} from './review-periods.ts';
export function groupedAnswerSteps(x:any,enabled:(module:string,task:string)=>boolean){
 const options:any[]=[],groups=new Map<string,any[]>();
 const failedAnswers=new Set(x.work.filter((w:any)=>w.status==='failed').flatMap((w:any)=>[w.payload?.answerId,...(w.payload?.answerItems||[]).map((a:any)=>a.id)]).filter(Boolean));
 const covered=(i:any)=>x.work.some((w:any)=>w.kind==='answer'&&w.status==='done'&&((w.payload.answerId===i.id&&w.payload.answerRevision===i.revision)||w.payload.answerItems?.some((a:any)=>a.id===i.id&&a.revision===i.revision)));
 for(const i of x.items.filter((i:any)=>i.status==='needs_input'&&i.answer?.trim())){
  if(!enabled(i.module,i.task)||covered(i)||failedAnswers.has(i.id))continue;
  const t=x.transactions.find((t:any)=>t.id===i.payload?.transaction_id),scope=t?quarterBounds(t.date):i.payload?.scope;if(!scope?.start||!scope?.end)continue;
  const group=(x.answerGroups||[]).find((g:any)=>g.id===i.id&&g.answer_revision===i.revision&&g.owner_id===x.owner);
  if(!group){options.push({kind:'answer',module:i.module,task:i.task,start:scope.start,end:scope.end,transactionIds:t?[t.id]:undefined,answerId:i.id,answerRevision:i.revision,note:i.answer,signature:[i.id,i.revision,i.answer]});continue;}
  const key=JSON.stringify([group.group_id,i.module,i.task,scope.start,scope.end,i.answer]);const members=groups.get(key)||[];members.push({item:i,scope,transactionId:t?.id});groups.set(key,members);
 }
 for(const members of groups.values()){
  members.sort((a,b)=>a.item.id.localeCompare(b.item.id));
  for(let start=0;start<members.length;start+=20){const batch=members.slice(start,start+20),first=batch[0],answerItems=batch.map(({item}:any)=>({id:item.id,revision:item.revision})),ids=[...new Set(batch.map((m:any)=>m.transactionId).filter(Boolean))];
   options.push({kind:'answer',module:first.item.module,task:first.item.task,start:first.scope.start,end:first.scope.end,transactionIds:ids.length?ids:undefined,answerItems,note:'',signature:{answers:batch.map(({item}:any)=>[item.id,item.revision,item.answer])}});
  }
 }
 return options;
}
