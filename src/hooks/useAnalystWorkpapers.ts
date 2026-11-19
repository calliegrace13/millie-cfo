import {useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {financeDb} from './useHousehold';
import {useAuth} from './useAuth';
import type {Workpaper} from '@/lib/analyst-workspace';
import type {PlanRecord} from '../../supabase/functions/_shared/planning-contract';
export function useAnalystWorkpapers(){
 const {user}=useAuth(),cache=useQueryClient(),[saving,setSaving]=useState(false),key=['analyst-workpapers-v1',user?.id];
 const rows=async(table:string)=>{const all:any[]=[];for(let n=0;;n+=1000){const r=await financeDb.from(table).select('*').eq('owner_id',user!.id).order('id').range(n,n+999);if(r.error)throw Error('Your analyst records could not load. Refresh before making changes.');all.push(...r.data);if(r.data.length<1000)return all;}};
 const q=useQuery({queryKey:key,enabled:!!user,queryFn:async()=>{const [papers,payroll]=await Promise.all([rows('finance_analyst_workpapers'),rows('finance_module_records')]);return {papers:papers as Workpaper[],payroll:payroll as PlanRecord[]};}});
 async function save(record:Pick<Workpaper,'id'|'kind'|'name'|'scope'|'payload'>&Partial<Workpaper>){if(!user||q.isPending||q.error)throw Error('Reload analyst records before saving.');setSaving(true);try{const r=await financeDb.rpc('finance_save_analyst_workpaper',{_id:record.id,_expected:record.revision||0,_kind:record.kind,_name:record.name,_scope:record.scope,_payload:record.payload,_archived:record.archived||false});if(r.error)throw Error(r.error.message);await cache.invalidateQueries({queryKey:key});const saved=await financeDb.from('finance_analyst_workpapers').select('*').eq('id',record.id).eq('owner_id',user.id).single();if(saved.error)throw Error('Saved, but confirmation could not load. Retry safely or refresh.');return saved.data as Workpaper;}finally{setSaving(false);}}
 return {papers:q.data?.papers||[],payroll:q.data?.payroll||[],loading:q.isPending,error:q.error,saving,save,reload:()=>q.refetch(),history:async(id:string)=>{const r=await financeDb.from('finance_analyst_history').select('revision,after_value,recorded_at').eq('record_id',id).eq('owner_id',user?.id).order('revision',{ascending:false});if(r.error)throw Error('History could not load.');return r.data;}};
}
