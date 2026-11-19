import {createContext,useContext,useState,type ReactNode} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {useAuth} from './useAuth';
import {supabase} from '@/integrations/supabase/client';
import {ALL_MODULES,normalizeModules,type ModuleId} from '@/lib/modules';

type ModuleState={enabled:ModuleId[];hasPreferences:boolean;loading:boolean;error:string|null;saving:boolean;isEnabled:(id:ModuleId)=>boolean;save:(ids:ModuleId[])=>Promise<void>;retry:()=>void};
const Context=createContext<ModuleState|null>(null);
export function ModulesProvider({children}:{children:ReactNode}) {
  const {user}=useAuth();const client=useQueryClient();const [saving,setSaving]=useState(false);
  const key=['workspace-modules',user?.id];
  const query=useQuery({queryKey:key,enabled:!!user,queryFn:async()=>{
    const {data,error}=await (supabase as any).from('finance_module_preferences').select('enabled_modules').eq('owner_id',user!.id).maybeSingle();
    if(error)throw error;
    return {enabled:data?normalizeModules(data.enabled_modules):[...ALL_MODULES],hasPreferences:!!data};
  }});
  const enabled=query.data?.enabled||ALL_MODULES;
  const save=async(ids:ModuleId[])=>{
    if(!user)throw new Error('Sign in to save your workspace.');
    const owner=user.id;const next=normalizeModules(ids);setSaving(true);
    try {
      const {error}=await (supabase as any).from('finance_module_preferences').upsert({owner_id:owner,enabled_modules:next},{onConflict:'owner_id'});
      if(error)throw error;
      client.setQueryData(['workspace-modules',owner],{enabled:next,hasPreferences:true});
    } finally {setSaving(false);}
  };
  return <Context.Provider value={{enabled,hasPreferences:query.data?.hasPreferences||false,loading:!!user&&query.isPending,error:query.error?'Your module preferences could not be loaded. Please retry.':null,saving,isEnabled:id=>enabled.includes(id),save,retry:()=>{void query.refetch();}}}>{children}</Context.Provider>;
}
export function useModules(){const value=useContext(Context);if(!value)throw new Error('ModulesProvider is required');return value;}
