import type {Trip,TripReceipt} from '@/hooks/useTrips';
export type TripSuggestion={id:string;starts_on:string;ends_on:string;bookings:TripReceipt[]};
// Only evidenced travel dates from the receipt service; never email or payment dates.
export function suggestTrips(receipts:TripReceipt[],trips:Trip[]):TripSuggestion[]{
 const candidates=receipts.filter(r=>r.status!=='dismissed'&&r.status!=='manual'&&!r.trip_id).flatMap(r=>{
  const legs=r.receipt.travel||[];if(!legs.length)return [];
  const start=legs.map(l=>l.start_date).sort()[0],end=legs.map(l=>l.end_date).sort().at(-1)!;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end)||end<start||Date.parse(end)-Date.parse(start)>366*86400000)return [];
  if(trips.some(t=>t.starts_on<=start&&t.ends_on>=end))return [];
  return [{id:r.id,starts_on:start,ends_on:end,bookings:[r]}];
 }).sort((a,b)=>a.starts_on.localeCompare(b.starts_on)||a.id.localeCompare(b.id));
 const groups:TripSuggestion[]=[];
 for(const c of candidates){const last=groups.at(-1);if(last&&c.starts_on<=last.ends_on&&Date.parse(c.ends_on)-Date.parse(last.starts_on)<=366*86400000){last.ends_on=last.ends_on>c.ends_on?last.ends_on:c.ends_on;last.bookings.push(...c.bookings);}else groups.push({...c});}
 return groups;
}
export function combineTripSuggestions(suggestions:TripSuggestion[]){
 if(!suggestions.length)return null;
 const starts_on=suggestions.map(s=>s.starts_on).sort()[0],ends_on=suggestions.map(s=>s.ends_on).sort().at(-1)!;
 return {starts_on,ends_on,bookings:[...new Map(suggestions.flatMap(s=>s.bookings).map(r=>[r.id,r])).values()]};
}
