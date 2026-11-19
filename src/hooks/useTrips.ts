import {useQuery} from '@tanstack/react-query';
import {useAuth} from './useAuth';
import {financeDb} from './useHousehold';
import type {Receipt} from '../../supabase/functions/_shared/receipt-contract';
export type Trip={id:string;owner_id:string;name:string;destination:string;starts_on:string;ends_on:string;auto_dates:boolean;auto_receipts:boolean;account_ids:string[];archived:boolean;revision:number};
export type TripLink={transaction_id:string;trip_id:string|null;source:'date'|'receipt'|'manual'|'refund';manual:boolean;excluded:boolean;reason:string;revision:number;snapshot:Record<string,any>};
export type TripReceipt={id:string;receipt:Receipt;transaction_id:string|null;trip_id:string|null;status:'pending'|'matched'|'manual'|'dismissed';reason:string};
export function useTrips(){
 const {user}=useAuth();
 return useQuery({queryKey:['trips',user?.id],enabled:!!user,queryFn:async()=>{
  async function all(table:string){const rows:any[]=[];for(let from=0;;from+=1000){const r=await financeDb.from(table).select('*').order(table==='finance_trip_links'?'transaction_id':'id').range(from,from+999);if(r.error)throw r.error;rows.push(...r.data);if(r.data.length<1000)return rows;}}
  const [trips,links,receipts]=await Promise.all([all('finance_trips'),all('finance_trip_links'),all('finance_trip_receipts')]);return {trips:trips as Trip[],links:links as TripLink[],receipts:receipts as TripReceipt[]};
 },refetchOnWindowFocus:true});
}
