import type {ReceiptSource} from './receipt-selection';
export type QueuePending<R>={ids:string[];requestId:string;provider:string;model:string;sources?:ReceiptSource[];result?:R};
export type ReceiptQueueSession<R>={pending?:QueuePending<R>};
export async function runReceiptQueue<R>(ids:string[], session:ReceiptQueueSession<R>, deps:{
 budget:()=>Promise<{provider:string;model:string;remaining:number}>;
 load:(ids:string[])=>Promise<{ids:string[];sources:ReceiptSource[]}>;
 analyze:(pending:QueuePending<R>)=>Promise<{status:string;result?:R}>;
 cached?:(pending:QueuePending<R>)=>Promise<{status:string;result?:R}>;
 apply:(result:R)=>Promise<void>;
 completed:(ids:string[])=>void;
 checkpoint:()=>void;
 stopped:()=>boolean;
 progress:(completed:number,remaining:number,batches:number)=>void;
 newId:()=>string;
 maxRequests:number;
}){
 let remaining=[...new Set(ids)],completed=0,batches=0,requests=0;
 let expected: {provider:string;model:string}|undefined;
 deps.progress(completed,remaining.length,batches);
 try{
  while(remaining.length){
   if(deps.stopped())return {completed,batches,reason:'Stopped after the current batch.'};
   const budget=await deps.budget();
   expected??=session.pending?{provider:session.pending.provider,model:session.pending.model}:budget;
   if(budget.provider!==expected.provider||budget.model!==expected.model)throw Error('Your active provider or model changed. Restart with the same provider to resume this run.');
   if(!session.pending){
    const batch=await deps.load(remaining);
    if(!batch.ids.length)throw Error('The next receipt could not fit in an analysis batch.');
    if(!batch.sources.length){
     // These source IDs duplicate receipts already processed in this run.
     // Consume the aliases without reserving or calling the AI provider.
     remaining=remaining.filter(id=>!batch.ids.includes(id));completed+=batch.ids.length;deps.completed(batch.ids);deps.progress(completed,remaining.length,batches);continue;
    }
    const next={...batch,requestId:deps.newId(),provider:budget.provider,model:budget.model};
    if(!Number.isFinite(budget.remaining)||budget.remaining<=0||requests>=deps.maxRequests){
     const cached=await deps.cached?.(next);
     if(cached?.status!=='succeeded'||cached.result===undefined)return {completed,batches,reason:'Paused at your AI request limit. Unfinished receipts remain selected.'};
     session.pending={...next,result:cached.result};
    }else session.pending=next;
    deps.checkpoint();
   }
   const pending=session.pending;
   if(!pending.ids.every(id=>remaining.includes(id)))throw Error('A previous batch is unfinished. Restore its selection before resuming; it will reuse the existing analysis request.');
   if(!pending.sources){
    const batch=await deps.load(pending.ids);
    if(JSON.stringify(batch.ids)!==JSON.stringify(pending.ids))throw Error('The unfinished batch changed or expired. No new analysis was started.');
    pending.sources=batch.sources;
   }
   if(deps.stopped())return {completed,batches,reason:'Stopped before starting the next analysis.'};
   if(pending.result===undefined){
    // Resuming the same request is allowed even at the cap. The server returns
    // its cached/running status before reserving any new provider request.
    const response=await deps.analyze(pending);requests++;
    if(response.status!=='succeeded'||response.result===undefined)throw Error(response.status==='running'?'This batch is still running. Resume later to check the same request.':'This batch could not be analyzed. No automatic retry or later batch was started.');
    pending.result=response.result;
   }
   await deps.apply(pending.result);
   const done=pending.ids;remaining=remaining.filter(id=>!done.includes(id));completed+=done.length;batches++;
   session.pending=undefined;deps.checkpoint();deps.completed(done);deps.progress(completed,remaining.length,batches);
  }
  return {completed,batches,reason:'All prepared and selected receipts processed.'};
 }catch(e){return {completed,batches,reason:(e as Error).message,error:true};}
}
