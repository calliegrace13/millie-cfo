// Internal workers use an expiring owner lease, never a saved browser token.
// Only the fixed read tables and accounting commands below are available.
const owned=new Set(['finance_context_automation','finance_trips','finance_trip_links','finance_calendar_events','finance_documents','finance_accounting_plans','finance_account_sharing','finance_account_continuity','finance_budget_versions','finance_cash_plans','finance_allocations','finance_module_records','finance_focus_records','finance_context_records','finance_assistant_items','finance_module_preferences','finance_learning_policies','finance_learning_state']);
const userOwned=new Set(['accounts','transactions','recurring_transactions','credit_cards','credit_card_benefits','benefit_usage']);
export function workerClient(admin:any,owner:string,lease:string){return {
 from(table:string){
  if(table==='transaction_offsets')return {select:(columns:string)=>admin.from('finance_worker_offsets').select(columns).eq('owner_id',owner)};
  if(!owned.has(table)&&!userOwned.has(table))throw Error('Automatic work cannot access this evidence.');
  return {select:(columns:string,options?:any)=>admin.from(table).select(columns,options).eq(userOwned.has(table)?'user_id':'owner_id',owner)};
 },
 rpc:(name:string,args:any={})=>admin.rpc('finance_worker_command',{_owner:owner,_lease:lease,_command:name,_args:args}),
};}
export async function workerIdentity(req:Request,admin:any){
 const owner=req.headers.get('x-millie-owner'),lease=req.headers.get('x-millie-lease');
 if(!owner&&!lease)return null;
 if(req.headers.get('origin')||!owner||!lease)throw Error('Automatic work authorization is invalid.');
 const token=(req.headers.get('authorization')||'').replace(/^Bearer /,'');
 const ok=await admin.rpc('finance_scheduler_authorized',{_token:token});
 if(ok.error||ok.data!==true)throw Error('Automatic work authorization is invalid.');
 const active=await admin.rpc('finance_worker_valid',{_owner:owner,_lease:lease});
 if(active.error||active.data!==true)throw Error('Automatic work was paused or its lease expired.');
 return {owner,lease,client:workerClient(admin,owner,lease)};
}
