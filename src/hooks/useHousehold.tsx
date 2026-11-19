import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react';
import {applyContinuity,retainAvailable,type Continuity} from '@/lib/durable-history';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import type { FinanceData, Allocation, Sharing, BudgetVersion } from '@/lib/household-finance';
import type { Account, Transaction } from '@/lib/types';
export const financeDb = supabase as any;
const empty: FinanceData={accounts:[],transactions:[],allocations:[],sharing:[],budgets:[]};
type State={data:FinanceData;rawData:FinanceData;continuity:Continuity[];loading:boolean;error:string;partnerId:string|null;linkId:string|null;reload:()=>Promise<void>};
const Context=createContext<State|null>(null);
async function allRows(table:string) {
  const all:any[]=[];
  for(let from=0;;from+=1000){const r=await financeDb.from(table).select('*').order(table==='finance_account_sharing'?'account_id':'id').range(from,from+999);if(r.error)throw r.error;all.push(...r.data);if(r.data.length<1000)return all;}
}
export function HouseholdProvider({children}:{children:ReactNode}) {
  const {user}=useAuth(); const sequence=useRef(0); const [rawData,setRawData]=useState(empty);const [continuity,setContinuity]=useState<Continuity[]>([]); const [loadedFor,setLoadedFor]=useState<string|null>(null); const [data,setData]=useState(empty);const [loading,setLoading]=useState(true);const [error,setError]=useState('');
  const [partnerId,setPartner]=useState<string|null>(null);const [linkId,setLink]=useState<string|null>(null);
  const reload=useCallback(async()=>{
    const request=++sequence.current;
    if(!user){setLoadedFor(null);setData(empty);setPartner(null);setLink(null);setLoading(false);return;}
    setLoading(true);setError('');
    try{
      const [accounts,transactions,allocations,sharing,budgets,documents,observations,categorySplits,schedules,assets,recurring,offsets,retained,continuity,accountingPlans,link]=await Promise.all([
        allRows('accounts'),allRows('transactions'),allRows('finance_allocations'),allRows('finance_account_sharing'),allRows('finance_budget_versions'),allRows('finance_documents'),allRows('finance_balance_observations'),allRows('finance_category_splits'),allRows('amortization_schedules'),allRows('assets'),allRows('recurring_transactions'),allRows('transaction_offsets'),allRows('finance_retained_history'),allRows('finance_account_continuity'),allRows('finance_accounting_plans'),
        supabase.from('partner_links').select('*').eq('status','active').or(`user_id.eq.${user.id},partner_user_id.eq.${user.id}`).maybeSingle()
      ]);
      if(link.error)throw link.error;
      if(request!==sequence.current)return;
      setLoadedFor(user.id);
      const raw={accounts:accounts as Account[],transactions:transactions as Transaction[],allocations:allocations as Allocation[],sharing:sharing as Sharing[],budgets:budgets as BudgetVersion[],documents,observations,categorySplits,schedules,assets,recurring,offsets,accountingPlans};setRawData(raw);const retainedLinks=retained.flatMap(x=>x.payload.continuity||[]);const links=[...continuity,...retainedLinks.filter(x=>!continuity.some(c=>c.id===x.id))].filter((x,i,a)=>a.findIndex(y=>y.id===x.id)===i);setContinuity(links);setData(applyContinuity(retainAvailable(raw,retained),links));
      setLink(link.data?.id||null);setPartner(link.data?(link.data.user_id===user.id?link.data.partner_user_id:link.data.user_id):null);
    }catch{if(request===sequence.current){setLoadedFor(user.id);setData(empty);setError('Your household data could not be loaded. Please retry.');}}finally{if(request===sequence.current)setLoading(false);}
  },[user?.id]);
  useEffect(()=>{void reload();},[reload]);
  return <Context.Provider value={{rawData:loadedFor===user?.id?rawData:empty,continuity:loadedFor===user?.id?continuity:[],data:loadedFor===user?.id?data:empty,loading:loading|| (!!user&&loadedFor!==user.id),error,partnerId:loadedFor===user?.id?partnerId:null,linkId:loadedFor===user?.id?linkId:null,reload}}>{children}</Context.Provider>;
}
export function useHousehold(){const c=useContext(Context);if(!c)throw Error('Household provider missing');return c;}
