/** Read-only suggestions: approvals and future rules remain in the merchant service. */
export function patternCandidates(groups:any[],analyzed:string[]=[],hasDraft:(id:string)=>boolean=()=>false,includeKnown=false){
 return groups.filter(g=>!analyzed.includes(g.id)&&!hasDraft(g.id)&&(includeKnown||g.mixed||!g.category||['Other','Uncategorized'].includes(g.category))).sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label)).slice(0,30);
}
export function patternInput(groups:any[]){
 return {id:crypto.randomUUID(),ids:groups.map(g=>g.id),sources:groups.map(g=>({name:g.label.slice(0,150),text:JSON.stringify({merchant:g.label.slice(0,150),descriptions:[...new Set<string>(g.transactions.map((t:any)=>String(t.name||'').slice(0,200)))].slice(0,3)})}))};
}
export function usablePatternDrafts(results:any[],groups:any[],hasDraft:(id:string)=>boolean=()=>false){
 const live=new Set(groups.map(g=>g.id)),seen=new Set<string>();
 return results.filter(p=>{if(!p.id||seen.has(p.id)||!live.has(p.id)||hasDraft(p.id)||!p.category||['Other','Uncategorized'].includes(p.category))return false;seen.add(p.id);return true;});
}
