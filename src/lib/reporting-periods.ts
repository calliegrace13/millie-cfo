/** Prior calendar period, with equal elapsed days capped at its actual end. */
export function previousCalendarPeriod(start:string,end:string,months:number){
 const [year,month]=start.split('-').map(Number);
 const iso=(d:Date)=>d.toISOString().slice(0,10);
 const priorStart=iso(new Date(Date.UTC(year,month-1-months,1)));
 const priorFullEnd=iso(new Date(Date.UTC(year,month-1,0)));
 const fullEnd=iso(new Date(Date.UTC(year,month-1+months,0)));
 const elapsed=Math.round((Date.parse(end)-Date.parse(start))/86400000);
 const priorEnd=end<fullEnd?[iso(new Date(Date.parse(priorStart+'T00:00:00Z')+elapsed*86400000)),priorFullEnd].sort()[0]:priorFullEnd;
 return {priorStart,priorEnd};
}
