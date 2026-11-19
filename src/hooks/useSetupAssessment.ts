import {useMemo} from 'react';
import {useQuery} from '@tanstack/react-query';
import {useAuth} from './useAuth';
import {financeDb,useHousehold} from './useHousehold';
import {useModules} from './useModules';
import {assessSetup,EMPTY_INVENTORY,type SetupInventory} from '@/lib/setup-assessment';
// Read-only owner-scoped inventory. Hidden domains are not queried or mounted.
export function useSetupAssessment(live=true){
 const {user}=useAuth(),h=useHousehold(),m=useModules(),ids=[...m.enabled].sort(),today=new Date().toLocaleDateString('en-CA');
 const enabled=live&&!!user&&!m.loading&&m.hasPreferences;
 const query=useQuery({queryKey:['setup-inventory-v1',user?.id,ids.join(',')],enabled,staleTime:0,queryFn:async()=>{
  const inventory:SetupInventory={plans:[],settings:[],records:[],cards:[],benefits:[],usage:[],errors:[]};
  const read=async(table:string,ownerColumn:string,domains?:string[])=>{const rows:any[]=[];for(let n=0;;n+=1000){let q=financeDb.from(table).select('*').eq(ownerColumn,user!.id).order(table==='finance_cash_settings'?'currency':'id').range(n,n+999);if(domains)q=q.in('domain',domains);const r=await q;if(r.error)throw r.error;rows.push(...r.data);if(r.data.length<1000)return rows;}};
  const tasks:Promise<void>[]=[];
  if(ids.includes('watchlists')||ids.includes('recoveries'))tasks.push((async()=>{try{inventory.focus=await read('finance_focus_records','owner_id');}catch{inventory.errors.push('watchlists','recoveries');}})());
  if(ids.includes('runway')||ids.includes('everyday'))tasks.push((async()=>{try{[inventory.plans,inventory.settings]=await Promise.all([read('finance_cash_plans','owner_id'),read('finance_cash_settings','owner_id')]);}catch{inventory.errors.push('cash');}})());
  const domains=ids.filter(id=>['income','investments','debt','longterm'].includes(id)).map(id=>id==='longterm'?'long_term':id);
  if(domains.length)tasks.push((async()=>{try{inventory.records=await read('finance_module_records','owner_id',domains);}catch{inventory.errors.push(...domains.map(id=>id==='long_term'?'longterm':id));}})());
  if(ids.includes('rewards'))tasks.push((async()=>{try{[inventory.cards,inventory.benefits,inventory.usage]=await Promise.all([read('credit_cards','user_id'),read('credit_card_benefits','user_id'),read('benefit_usage','user_id')]);}catch{inventory.errors.push('rewards');}})());
  await Promise.all(tasks);return inventory;
 }});
 const inventory=query.data||EMPTY_INVENTORY,assessment=useMemo(()=>assessSetup(h.data,inventory,user?.id||'',h.partnerId,h.linkId,today,m.enabled),[h.data,inventory,user?.id,h.partnerId,h.linkId,today,m.enabled]);
 return {assessment,inventory,loading:h.loading||m.loading||(enabled&&query.isPending),available:!!query.data&&!h.error,error:h.error||query.error,reload:async()=>{await h.reload();return query.refetch();}};
}
