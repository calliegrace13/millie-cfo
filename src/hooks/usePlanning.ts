import {useQuery,useQueryClient} from '@tanstack/react-query';
import {useAuth} from './useAuth';
import {financeDb} from './useHousehold';
import type {CashPlan} from '@/lib/cash-runway';
export function usePlanning(){
 const {user}=useAuth();const client=useQueryClient();const key=['cash-planning',user?.id];
 const q=useQuery({queryKey:key,enabled:!!user,queryFn:async()=>{
  const read=async(table:string)=>{const out:any[]=[];for(let n=0;;n+=1000){const r=await financeDb.from(table).select('*').eq('owner_id',user!.id).order(table==='finance_cash_settings'?'currency':table==='finance_plan_history'?'recorded_at':'id').range(n,n+999);if(r.error)throw r.error;out.push(...r.data);if(r.data.length<1000)return out;}};
  const [plans,settings,history]=await Promise.all([read('finance_cash_plans'),read('finance_cash_settings'),read('finance_plan_history')]);return {plans:plans as CashPlan[],settings,history};
 }});
 return {plans:q.data?.plans||[],settings:q.data?.settings||[],history:q.data?.history||[],loading:q.isPending,error:q.error,reload:()=>client.invalidateQueries({queryKey:key})};
}
