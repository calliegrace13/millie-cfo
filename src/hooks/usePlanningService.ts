import {useRef,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {supabase} from '@/integrations/supabase/client';
import {useAuth} from './useAuth';
import type {Domain,PlanRecord} from '../../supabase/functions/_shared/planning-contract.ts';
const SERVICES:Record<Domain,string>={income:'compensation-planning',investments:'investment-analysis',debt:'debt-planning',long_term:'long-term-planning'};
export function usePlanningService(domain:Domain){
 const {user}=useAuth(),cache=useQueryClient(),[saving,setSaving]=useState(false),pending=useRef<{signature:string;id:string}|null>(null),key=['planning-service',user?.id,domain];
 const call=async(body:any)=>{
  const r=await supabase.functions.invoke(SERVICES[domain],{body:{version:1,...body}});
  if(r.error){let message='Unable to reach this workspace. Retry without closing the editor.';try{const payload=await (r.error as any).context?.json();if(payload?.error)message=payload.error;}catch{}throw new Error(message);}
  if(r.data?.error)throw new Error(r.data.error);return r.data;
 };
 const query=useQuery({queryKey:key,enabled:!!user,queryFn:async()=>{
  const rows:PlanRecord[]=[];let offset=0;do{const r=await call({action:'list',offset});rows.push(...r.records);if(r.nextOffset==null)return rows;offset=r.nextOffset;}while(offset<100000);throw new Error('Too many planning records. Contact support.');
 }});
 const save=async(record:Partial<PlanRecord>&Pick<PlanRecord,'kind'|'name'|'payload'>)=>{
  const request={action:'save',kind:record.kind,name:record.name,payload:record.payload,id:record.id||null,expected:record.revision??null,status:record.status||'active'};const signature=JSON.stringify({user:user?.id,domain,...request});
  if(pending.current?.signature!==signature)pending.current={signature,id:crypto.randomUUID()};setSaving(true);
  try{const r=await call({...request,requestId:pending.current.id});pending.current=null;await cache.invalidateQueries({queryKey:key});return r.record as PlanRecord;}finally{setSaving(false);}
 };
 return {records:query.data||[],loading:query.isPending,error:query.error,saving,save,retry:()=>query.refetch(),history:async(id:string)=>(await call({action:'history',id})).history};
}
