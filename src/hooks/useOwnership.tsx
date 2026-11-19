import { useEffect, useState, useCallback } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useHousehold } from './useHousehold';
import { allocationAt, personalShare, expenseWeight } from '@/lib/household-finance';
import { PartnerProfile, Account, Transaction } from '@/lib/types';
export function useOwnership() {
 const {user}=useAuth();const {data,loading,error,reload}=useHousehold();const [partner,setPartner]=useState<PartnerProfile|null>(null);
 const fetchPartner=useCallback(async()=>{if(!user){setPartner(null);return;}const r=await supabase.from('partner_profiles').select('*').eq('user_id',user.id).maybeSingle();setPartner(r.data as PartnerProfile|null);},[user?.id]);
 useEffect(()=>{void fetchPartner();},[fetchPartner]);
 const isJointActive=useCallback((account:Account,date=format(new Date(),'yyyy-MM-dd'))=>{const r=allocationAt(data.allocations,account.id,date);return !!r&&r.owner_pct<100;},[data.allocations]);
 const getMultiplier=useCallback((a:Account,date=format(new Date(),'yyyy-MM-dd'))=>{
   if(error||loading)return 0;
   const duplicate=data.sharing.find(s=>s.account_id===a.id)?.duplicate_of;
   if(duplicate&&data.accounts.some(a=>a.id===duplicate))return 0;
   return personalShare(a,date,user?.id||null,data.allocations,allocationAt(data.allocations,a.id,date)?.balance_pct);
 },[data,user?.id,error,loading]);
 const getOwnershipPct=useCallback((a:Account,date?:string)=>100*getMultiplier(a,date),[getMultiplier]);
 const scaleByOwnership=useCallback((value:number,a:Account,date?:string)=>value*getMultiplier(a,date),[getMultiplier]);
 const buildMultiplierMap=useCallback((accounts:Account[],date?:string)=>Object.fromEntries(accounts.map(a=>[a.id,getMultiplier(a,date)])),[getMultiplier]);
 const getTransactionMultiplier=useCallback((t:Transaction,accounts:Account[])=>{
   if(error||loading)return 0;
   const a=accounts.find(a=>a.id===t.account_id);
   if(!a)return t.user_id===user?.id?1:0;
   const duplicate=data.sharing.find(s=>s.account_id===a.id)?.duplicate_of;
   if(duplicate&&accounts.some(a=>a.id===duplicate))return 0;
   return expenseWeight(t,a,data,{userId:user?.id||'',partnerId:null,linkId:null,view:'mine',basis:'recorded',currency:a.currency||'USD',start:t.date,end:t.date});
 },[data,user?.id,error,loading]);
 return {partner,loading,error,fetchPartner,isJointActive,getOwnershipPct,scaleByOwnership,getMultiplier,buildMultiplierMap,getTransactionMultiplier};
}
