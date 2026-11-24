// Changing a provider is not new financial evidence. Preserve existing paid
// checkpoints across model switches, using the original fingerprint contract.
export async function workflowChecked(candidate:any,revision:number|undefined,provider:string,model:string,work:any[],digest:(value:any)=>Promise<string>){
 const fingerprint=await digest({version:1,candidate,provider,model,revision});
 if(work.some(w=>w.fingerprint===fingerprint))return {checked:true,fingerprint};
 const prior=new Map(work.filter(w=>w.status==='done'&&w.payload?.provider&&w.payload?.model).map(w=>[w.payload.provider+':'+w.payload.model,w.payload]));
 for(const p of prior.values()){
  const old=await digest({version:1,candidate,provider:p.provider,model:p.model,revision});
  if(work.some(w=>w.status==='done'&&w.fingerprint===old))return {checked:true,fingerprint};
 }
 return {checked:false,fingerprint};
}
