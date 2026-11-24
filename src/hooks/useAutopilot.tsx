import {createContext,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {useAuth} from './useAuth';import {useHousehold,financeDb} from './useHousehold';import {supabase} from '@/integrations/supabase/client';
type AutoSettings={enabled:boolean;background_enabled:boolean;workflow_scope?:'core'|'all_enabled';provider:string;model:string;revision:number;status:string;summary:string;attention:{title:string;href:string;optional?:boolean}[];next_run_at:string;last_started_at:string|null;last_finished_at:string|null;failure_count:number};
const Context=createContext<any>(null);
async function request(body:any){const r=await supabase.functions.invoke('finance-autopilot',{body});if(r.error){let message='Automatic work could not continue. Check the saved task before retrying.';try{const d=await r.error.context.json();if(d.error)message=d.error;}catch{}throw Error(message);}if(r.data?.error)throw Error(r.data.error);return r.data;}
export function AutopilotProvider({children}:{children:ReactNode}){
 const {user}=useAuth(),h=useHousehold(),qc=useQueryClient(),[error,setError]=useState(''),seen=useRef<string|null>(null);
 const query=useQuery({queryKey:['autopilot',user?.id],enabled:!!user,refetchInterval:15000,refetchOnWindowFocus:true,queryFn:async()=>{const [settings,work]=await Promise.all([financeDb.from('finance_autopilot_settings').select('enabled,background_enabled,workflow_scope,provider,model,revision,status,summary,attention,next_run_at,last_started_at,last_finished_at,failure_count').maybeSingle(),financeDb.from('finance_autopilot_work').select('*').order('created_at',{ascending:false}).limit(200)]);if(settings.error||work.error)throw Error('Automatic work history could not be loaded.');return {settings:settings.data as AutoSettings|null,work:work.data as any[]};}});
 // The browser observes durable work; it never owns the execution loop.
 useEffect(()=>{const finished=query.data?.settings?.last_finished_at;if(finished&&seen.current&&finished!==seen.current){void h.reload();for(const key of ['assistant-inbox','trips','ai-connection','ai-costs','financial-context-v2'])void qc.invalidateQueries({queryKey:[key,user?.id]});}seen.current=finished||null;},[query.data?.settings?.last_finished_at,user?.id]);
 const configure=async(enabled:boolean)=>{if(query.isPending||query.error)throw Error('Refresh automatic work settings first.');setError('');const r=await financeDb.rpc('finance_background_autopilot',{_enabled:enabled,_expected:query.data?.settings?.revision||0});if(r.error)throw Error(r.error.message);await qc.invalidateQueries({queryKey:['ai-policies',user?.id]});await query.refetch();};
 const startWorkflow=async()=>{if(query.isPending||query.error)throw Error('Refresh your workflow settings first.');setError('');const r=await financeDb.rpc('finance_start_ai_workflow',{_expected:query.data?.settings?.revision||0});if(r.error)throw Error(r.error.message);await qc.invalidateQueries({queryKey:['ai-policies',user?.id]});await query.refetch();};
 const manage=async(action:'retry'|'skip',id:string)=>{setError('');await request({action,id});await query.refetch();};
 const refresh=async()=>{try{if(query.data?.settings?.status==='error'&&!query.data.work.some(w=>w.status==='failed'))await request({action:'recheck'});setError('');}catch(e){setError((e as Error).message);}return query.refetch();};
 return <Context.Provider value={{...query,configure,startWorkflow,manage,busy:query.data?.settings?.status==='working',refetch:refresh,error:error||query.error}}>{children}</Context.Provider>;
}
export function useAutopilot():{data?:{settings:AutoSettings|null;work:any[]};isPending:boolean;error:string|Error|null;busy:boolean;configure:(enabled:boolean)=>Promise<void>;startWorkflow:()=>Promise<void>;manage:(action:'retry'|'skip',id:string)=>Promise<void>;refetch:()=>Promise<unknown>}{const c=useContext(Context);if(!c)throw Error('AutopilotProvider required');return c;}

export function allowanceMessage(nextRunAt:string) {
 const time=new Date(nextRunAt);
 if(!Number.isFinite(time.getTime()))return 'Millie will check again when you raise a limit or a reserved charge clears.';
 if(time.getTime()<=Date.now())return 'Your work is queued for the next background check.';
 const label=time.toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});
 return 'Millie will check again on '+label+', or sooner if you raise the limit that is holding up this task.';
}
