// Collect the whole update before the caller can commit it. IDs are case
// sensitive; amounts and merchant strings never determine transaction identity.
export async function collectBankUpdate(call: (path:string,body:any)=>Promise<any>, cursor?:string, start?:string, end?:string) {
 const added=new Map<string,any>(),modified=new Map<string,any>(),removed=new Map<string,any>();
 const cursors=new Set<string>(cursor?[cursor]:[]);let next=cursor,offset=0,expected:number|undefined;
 for(let page=0;page<20;page++){
  const data=start&&end?await call('/transactions/get',{start_date:start,end_date:end,options:{count:500,offset}}):await call('/transactions/sync',{cursor:next,count:500});
  const rows=start?data.transactions:data.added;
  if(!Array.isArray(rows)||(!start&&(!Array.isArray(data.modified)||!Array.isArray(data.removed)||typeof data.has_more!=='boolean'||typeof data.next_cursor!=='string'||!data.next_cursor)))throw Error('Incomplete bank import');
  for(const [list,target] of [[rows,added],[data.modified||[],modified],[data.removed||[],removed]] as [any[],Map<string,any>][]){
   for(const tx of list){if(typeof tx.transaction_id!=='string'||!tx.transaction_id)throw Error('Invalid bank transaction');target.set(tx.transaction_id,tx);}
  }
  offset+=rows.length;
  if(start&&(!Number.isInteger(data.total_transactions)||data.total_transactions<offset))throw Error('Incomplete bank import');
  if(start){if(expected!==undefined&&expected!==data.total_transactions)throw Error('Bank history changed; retry the complete import');expected=data.total_transactions;}
  const more=start?offset<data.total_transactions:data.has_more;
  next=data.next_cursor;
  if(!more){
   // Pending rows first allow the database to promote their existing UUID even
   // when Plaid puts the posted version earlier in the same update.
   return {added:[...added.values()].sort((a,b)=>Number(!!b.pending)-Number(!!a.pending)),modified:[...modified.values()],removed:[...removed.values()],cursor:start?null:next};
  }
  if(start&&!rows.length)throw Error('Incomplete bank import');
  if(!start){if(cursors.has(next!))throw Error('Bank pagination did not advance');cursors.add(next!);}
 }
 throw Error('Import exceeds a single run. Request a smaller history window.');
}
