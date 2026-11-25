import {createContext,useContext,type ReactNode} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {useAuth} from './useAuth';
import {supabase} from '@/integrations/supabase/client';
import {defaultPolicy,taskEnabled,type AssistantModule,type TaskPolicy} from '../../supabase/functions/_shared/assistant-tasks';
export {ASSISTANT_TASKS,defaultPolicy,taskEnabled,type AssistantModule,type TaskPolicy} from '../../supabase/functions/_shared/assistant-tasks';
const db=supabase as any;
const Context=createContext<any>(null);
export function AutomationProvider({children}:{children:ReactNode}){
 const {user}=useAuth(),qc=useQueryClient(),key=['ai-policies',user?.id];
 const query=useQuery({queryKey:key,enabled:!!user,refetchOnWindowFocus:true,refetchInterval:15000,queryFn:async()=>{const r=await db.from('finance_ai_policies').select('*');if(r.error)throw Error('Your Manual / AI choices could not load. AI remains paused.');return r.data as (TaskPolicy&{module:AssistantModule})[];}});
 const policy=(module:string):TaskPolicy=>query.data?.find(p=>p.module===module)||defaultPolicy();
 const save=async(module:string,next:TaskPolicy)=>{if(!user||query.isPending||query.error)throw Error('Load your AI choices before changing them.');const owner=user.id;const r=await db.rpc('finance_set_ai_policy',{_module:module,_mode:next.mode,_tasks:next.tasks,_auto:next.auto_tasks,_receipts:next.use_receipts,_web:next.use_web,_expected:policy(module).revision});if(r.error){await query.refetch();throw Error(r.error.message);}qc.setQueryData(['ai-policies',owner],(old:any[]=[])=>[...old.filter(p=>p.module!==module),r.data]);};
 return <Context.Provider value={{policy,save,loading:query.isPending,error:query.error,refresh:query.refetch,enabled:(module:string,task:string)=>!query.isPending&&!query.error&&taskEnabled(policy(module),task),hasAI:query.data?.some(p=>p.mode==='ai')||false}}>{children}</Context.Provider>;
}
export function useAutomation():{policy:(module:string)=>TaskPolicy;save:(module:string,next:TaskPolicy)=>Promise<void>;loading:boolean;error:Error|null;refresh:()=>Promise<unknown>;enabled:(module:string,task:string)=>boolean;hasAI:boolean}{const c=useContext(Context);if(!c)throw Error('AutomationProvider required');return c;}
export async function assistantRequest(body:Record<string,unknown>){const {data,error}=await supabase.functions.invoke('finance-assistant',{body});if(error){let message='The assistant could not finish. Resume this run to check its status.';try{const d=await error.context.json();if(d.error)message=d.error;}catch{}throw Error(message);}if(data?.error)throw Error(data.error);return data;}
export function useAssistantInbox(){const {user}=useAuth();return useQuery({queryKey:['assistant-inbox',user?.id],enabled:!!user,queryFn:async()=>{const rows:any[]=[];for(let from=0;from<10000;from+=1000){const r=await db.from('finance_assistant_items').select('*').order('created_at',{ascending:false}).order('id').range(from,from+999);if(r.error)throw Error('Your saved assistant work could not load.');rows.push(...r.data);if(r.data.length<1000)return rows;}throw Error('The work queue needs a narrower window.');}});}
