import {useMemo,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {useAuth} from './useAuth';
import {financeDb,useHousehold} from './useHousehold';
import {buildFinancialContext,contextNextSteps,EMPTY_CONTEXT,type ContextInventory,type ContextRecord} from '@/lib/financial-context';

export function useFinancialContext(){
 const {user}=useAuth(),h=useHousehold(),qc=useQueryClient(),[saving,setSaving]=useState(false),key=['financial-context-v1',user?.id];
 const q=useQuery({queryKey:key,enabled:!!user,staleTime:30000,queryFn:async()=>{
  const inventory:ContextInventory={...EMPTY_CONTEXT,errors:[]};
  async function rows(table:string,order='id'){const all:any[]=[];for(let from=0;;from+=1000){const r=await financeDb.from(table).select('*').eq('owner_id',user!.id).order(order).range(from,from+999);if(r.error)throw r.error;all.push(...r.data);if(r.data.length<1000)return all;}}
  // Each source fails independently; absence is never inferred from a failed read.
  await Promise.all([
   ['records',()=>rows('finance_context_records')],['trips',()=>rows('finance_trips')],['tripLinks',()=>rows('finance_trip_links','transaction_id')],
   ['focus',()=>rows('finance_focus_records')],['plans',()=>rows('finance_cash_plans')],['modules',()=>rows('finance_module_records')],
   ['connections',async()=>{const r=await financeDb.rpc('finance_context_connection_status');if(r.error)throw r.error;return r.data;}]
  ].map(async([name,fn])=>{try{(inventory as any)[name as string]=await (fn as ()=>Promise<any>)();}catch{inventory.errors.push(name as string);}}));return inventory;
 }});
 const inv=q.data||EMPTY_CONTEXT,owner=user?.id||'';
 const graph=useMemo(()=>buildFinancialContext(h.data,inv,owner),[h.data,inv,owner]);
 const steps=useMemo(()=>contextNextSteps(h.data,inv,owner),[h.data,inv,owner]);
 async function save(record:ContextRecord){if(!user||record.owner_id!==user.id||inv.errors.includes('records'))throw Error('Reload your evidence before saving.');setSaving(true);try{
  const r=await financeDb.rpc('finance_save_context',{_id:record.id,_expected:record.revision,_kind:record.kind,_title:record.title,_notes:record.notes,_start:record.starts_on||null,_end:record.ends_on||null,_transactions:record.transaction_ids,_archived:record.archived});
  if(r.error)throw Error(r.error.message);await qc.invalidateQueries({queryKey:key});return r.data;
 }finally{setSaving(false);}}
 return {owner,graph,steps,inventory:inv,loading:q.isPending||h.loading,error:h.error||q.error,saving,save,reload:async()=>{await Promise.all([h.reload(),q.refetch()]);},history:async(id:string)=>{const r=await financeDb.from('finance_context_history').select('revision,recorded_at,after_value').eq('owner_id',owner).eq('record_id',id).order('revision',{ascending:false});if(r.error)throw Error('Revision history could not load.');return r.data as any[];}};
}
