import {useQuery,useQueryClient} from '@tanstack/react-query';
import {supabase} from '@/integrations/supabase/client';
import {useAuth} from '@/hooks/useAuth';
export type AIProvider='openai'|'anthropic';
export const providerName=(p:string)=>p==='openai'?'OpenAI API':'Claude API';
export type AIStatus={active:AIProvider|null;connections:{provider:AIProvider;model:string;suffix:string;requestLimit:number;used:number;revision:number}[]};
export async function readAIStatus(){const {data,error}=await (supabase as any).rpc('finance_ai_status');if(error)throw Error('Unable to load AI settings.');return data as AIStatus;}
export async function aiRequest(body:Record<string,unknown>){
 const {data,error}=await supabase.functions.invoke('finance-ai',{body});
 if(error){let message='Unable to reach the AI service. Retry the same request to check its status.';try{const json=await error.context.json();if(json.error)message=json.error;}catch{/* Never display provider headers or raw error payloads. */}throw Error(message);}
 if(data?.error)throw Error(data.error);return data;
}
export function useAIConnection(){const {user}=useAuth(),qc=useQueryClient();const key=['ai-connection',user?.id];const q=useQuery({queryKey:key,enabled:!!user,queryFn:readAIStatus});return {...q,refresh:()=>qc.invalidateQueries({queryKey:key})};}
