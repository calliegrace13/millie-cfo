export const CALENDAR_SCOPE='https://www.googleapis.com/auth/calendar.events.readonly';
const day=(value:string,zone:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
const minusDay=(s:string)=>new Date(Date.parse(s+'T12:00:00Z')-86400000).toISOString().slice(0,10);
export function calendarEvidence(raw:any,calendar='primary',zone='America/New_York'){
 if(raw.status==='cancelled'||raw.attendees?.some((a:any)=>a.self&&a.responseStatus==='declined')||raw.my_response_status==='declined')return null;
 const title=String(raw.summary||'').trim();
 if(!/\b(flight|hotel|stay|trip|vacation|airbnb|reservation|check.?in)\b/i.test(title))return null;
 const start=raw.start?.date||raw.start_date||(typeof raw.start==='string'&&!/(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(raw.start)?raw.start.slice(0,10):null);
 const end=raw.end?.date||raw.end_date||(typeof raw.end==='string'&&!/(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(raw.end)?raw.end.slice(0,10):null);
 const starts_on=start||day(raw.start?.dateTime||raw.start,zone),ends_on=end?minusDay(end):day(raw.end?.dateTime||raw.end,zone);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(starts_on)||!/^\d{4}-\d{2}-\d{2}$/.test(ends_on)||ends_on<starts_on)return null;
 const route=/\bfrom ([A-Z]{3}) to ([A-Z]{3})\b/.exec(title);
 return {source_calendar:calendar,event_id:String(raw.id).slice(0,300),title:title.slice(0,200),location:String(raw.location||'').slice(0,300),starts_on,ends_on,kind:/flight/i.test(title)?'flight':/hotel|stay|airbnb/i.test(title)?'stay':/trip|vacation/i.test(title)?'trip':'reservation',origin:route?.[1]||'',destination:route?.[2]||'',updated:String(raw.updated||'')};
}
export function calendarTrips(events:any[]){
 const home=new Set(['JFK','LGA','EWR']);const trips:any[]=[];
 const flights=events.filter(e=>e.kind==='flight'&&e.origin&&e.destination).sort((a,b)=>a.starts_on.localeCompare(b.starts_on)||a.event_id.localeCompare(b.event_id));
 for(const out of flights.filter(e=>home.has(e.origin)&&!home.has(e.destination))){
  const returns=flights.filter(e=>e.origin===out.destination&&home.has(e.destination)&&e.starts_on>=out.starts_on&&Date.parse(e.ends_on)-Date.parse(out.starts_on)<=45*86400000);
  const days=[...new Set(returns.map(e=>e.ends_on))];if(days.length!==1)continue;
  trips.push({source_key:out.source_calendar+':'+out.event_id,name:'Trip to '+out.destination,destination:out.destination,starts_on:out.starts_on,ends_on:days[0]});
 }
 for(const e of events.filter(e=>['stay','trip'].includes(e.kind)&&e.ends_on>e.starts_on)){
  if(trips.some(t=>t.starts_on<=e.starts_on&&t.ends_on>=e.ends_on))continue;
  trips.push({source_key:e.source_calendar+':'+e.event_id,name:e.title,destination:e.location,starts_on:e.starts_on,ends_on:e.ends_on});
 }
 const seen=new Set<string>();const unique=trips.sort((a,b)=>a.source_key.localeCompare(b.source_key)).filter(t=>{const key=t.starts_on+':'+t.ends_on+':'+t.destination;if(seen.has(key))return false;seen.add(key);return true;});
 // Overlapping distinct itineraries need a choice rather than automatic dates.
 return unique.map(t=>({...t,auto_dates:!unique.some(o=>o!==t&&o.starts_on<=t.ends_on&&o.ends_on>=t.starts_on)}));
}
