import {useState} from 'react';
import {Link} from 'react-router-dom';
import type {Trip,TripReceipt} from '@/hooks/useTrips';
import {suggestTrips,combineTripSuggestions} from '@/lib/trip-suggestions';
import {Card,CardHeader,CardTitle,CardDescription,CardContent} from '@/components/ui/card';
import {Button} from '@/components/ui/button';
import {ChoiceField} from '@/components/ui/choice-field';
export function TripSuggestions({receipts,trips,onPrepare}:{receipts:TripReceipt[];trips:Trip[];onPrepare:(dates:{starts_on:string;ends_on:string},trip?:Trip)=>void}){
 const [selected,setSelected]=useState<string[]>([]),[existing,setExisting]=useState('');
 const suggestions=suggestTrips(receipts,trips),chosen=suggestions.filter(s=>selected.includes(s.id)),combined=combineTripSuggestions(chosen);
 const target=trips.find(t=>t.id===existing&&!t.archived);
 const start=combined?(target&&target.starts_on<combined.starts_on?target.starts_on:combined.starts_on):'',end=combined?(target&&target.ends_on>combined.ends_on?target.ends_on:combined.ends_on):'';
 const tooLong=!!combined&&Date.parse(end)-Date.parse(start)>366*86400000;
 return <Card><CardHeader><CardTitle>Trips found in your emails</CardTitle><CardDescription>Analyzed flight and hotel receipts prefill travel dates. Overlapping bookings are grouped as suggestions; select separate groups to combine them. Check the evidence before saving.</CardDescription></CardHeader><CardContent className="space-y-4">
 {!suggestions.length?<p className="text-sm text-muted-foreground">No new trip suggestions yet. Sync Gmail and analyze booking emails in <Link className="underline" to="/transactions#receipt-review">Match receipts</Link>. Previously analyzed receipts may need a new analysis to extract travel dates.</p>:<>
 <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={()=>setSelected(suggestions.map(s=>s.id))}>Select all</Button><Button variant="ghost" size="sm" onClick={()=>setSelected([])}>Clear selection</Button></div>
 {suggestions.map(s=><div key={s.id} className="border rounded-xl p-3 space-y-2"><label className="flex gap-3 items-center text-sm font-medium"><input type="checkbox" checked={selected.includes(s.id)} onChange={e=>setSelected(e.target.checked?[...selected,s.id]:selected.filter(id=>id!==s.id))}/>{s.starts_on} – {s.ends_on} · {s.bookings.length} booking{s.bookings.length===1?'':'s'}</label><details><summary className="text-sm cursor-pointer">Review bookings and travel evidence</summary>{s.bookings.map(b=><div key={b.id} className="text-sm mt-3"><strong>{b.receipt.merchant}</strong>{b.receipt.travel?.map((l,i)=><p key={i} className="mt-1 text-muted-foreground whitespace-pre-wrap">{l.kind} · {l.start_date} – {l.end_date}<br/>{l.context}</p>)}</div>)}</details><Button variant="outline" size="sm" onClick={()=>onPrepare(s)}>Edit & create this trip</Button></div>)}
 <ChoiceField aria-label="Combine suggested bookings with" value={existing} onChange={e=>setExisting(e.target.value)}><option value="">Create a new trip from selection</option>{trips.filter(t=>!t.archived).map(t=><option key={t.id} value={t.id}>Add to {t.name} · {t.starts_on} – {t.ends_on}</option>)}</ChoiceField>
 {combined&&<p className="text-sm">{chosen.length} selected group{chosen.length===1?'':'s'} · Proposed dates: {start} – {end}. You can change these and name the trip next.</p>}
 {tooLong&&<p role="alert" className="text-sm">Choose bookings within a single year, or create separate trips.</p>}
 <Button disabled={!combined||tooLong} onClick={()=>onPrepare({starts_on:start,ends_on:end},target)}>{target?'Review combined trip':chosen.length>1?'Combine selection & edit':'Review selected trip'}</Button>
 </>}
 <p className="text-xs text-muted-foreground">Suggestions do not spend AI requests or create trips until you save. Dates can be incomplete—for example, a one-way flight cannot establish your return date. Existing trips and dismissed bookings are excluded.</p>
 </CardContent></Card>;
}
