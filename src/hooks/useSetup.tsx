import {createContext,useContext,useState,type ReactNode} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {supabase} from '@/integrations/supabase/client';
import {useAuth} from './useAuth';
import type {SetupProgress} from '@/lib/module-setup';
type Action='start'|'pause'|'choose'|'check'|'defer'|'resume'|'finish';
type State={progress:SetupProgress|undefined;loading:boolean;error:Error|null;saving:boolean;update:(action:Action,key?:string,value?:boolean)=>Promise<SetupProgress>;reload:()=>Promise<any>};
const Context=createContext<State|null>(null);
export function SetupProvider({children}:{children:ReactNode}){
 const {user}=useAuth(),cache=useQueryClient(),[saving,setSaving]=useState(false),key=['module-setup-v1',user?.id];
 const query=useQuery({queryKey:key,enabled:!!user,queryFn:async()=>{const r=await(supabase as any).rpc('finance_get_setup');if(r.error)throw new Error('Your setup progress could not be loaded.');return r.data as SetupProgress;}});
 const update=async(action:Action,step?:string,value?:boolean)=>{
  if(!user||!query.data)throw new Error('Reload your setup progress first.');const owner=user.id;setSaving(true);
  try{const r=await(supabase as any).rpc('finance_update_setup',{_action:action,_key:step??null,_value:value??null,_expected:query.data.revision});if(r.error)throw new Error(r.error.message||'Could not save setup progress.');cache.setQueryData(['module-setup-v1',owner],r.data);return r.data as SetupProgress;}finally{setSaving(false);}
 };
 return <Context.Provider value={{progress:query.data,loading:!!user&&query.isPending,error:query.error,saving,update,reload:()=>query.refetch()}}>{children}</Context.Provider>;
}
export function useSetup(){const c=useContext(Context);if(!c)throw new Error('SetupProvider is required');return c;}
