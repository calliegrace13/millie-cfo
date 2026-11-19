import {useQuery,useQueryClient} from '@tanstack/react-query';
import {useAuth} from './useAuth';
import {financeDb} from './useHousehold';
import type {LearningPolicy} from '../../supabase/functions/_shared/learning-policy';
export function useLearningPolicies(){
 const {user}=useAuth(),qc=useQueryClient(),key=['learning-policies',user?.id];
 const query=useQuery({queryKey:key,enabled:!!user,queryFn:async()=>{const [p,h]=await Promise.all([financeDb.from('finance_learning_policies').select('*').order('updated_at',{ascending:false}),financeDb.from('finance_learning_history').select('*').order('recorded_at',{ascending:false}).limit(200)]);if(p.error||h.error)throw Error('Your saved policies could not load. Please retry.');return {policies:p.data as LearningPolicy[],history:h.data as any[]};}});
 return {...query,save:async(value:any)=>{if(!user||query.isPending||query.error)throw Error('Load your policies before saving.');const r=await financeDb.rpc('finance_save_learning_policy',{_id:value.id||null,_expected:value.revision||0,_value:value});if(r.error)throw Error(r.error.message);await qc.invalidateQueries({queryKey:key});await qc.invalidateQueries({queryKey:['assistant-inbox',user.id]});return r.data;}};
}
