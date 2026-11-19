// USD microdollars. Tariffs live in the database; unpriced models fail closed.
export function usageFor(provider:string,output:any,research=false){
 const u=output?.usage,integer=(n:any)=>Number.isSafeInteger(n)&&n>=0;
 if(!u||!integer(u.input_tokens)||!integer(u.output_tokens))return null;
 if(provider==='openai'){
  const cached=u.input_tokens_details?.cached_tokens??0;
  const searches=research?(output.output||[]).filter((x:any)=>x.type==='web_search_call').length:0;
  if(!integer(cached)||cached>u.input_tokens||!integer(searches))return null;
  return {input:u.input_tokens-cached,cached,cacheWrite:0,output:u.output_tokens,searches};
 }
 const cached=u.cache_read_input_tokens??0,cacheWrite=u.cache_creation_input_tokens??0;
 const searches=research?u.server_tool_use?.web_search_requests:0;
 if(!integer(cached)||!integer(cacheWrite)||!integer(searches))return null;
 return {input:u.input_tokens,cached,cacheWrite,output:u.output_tokens,searches};
}
export function requestBytes(payload:unknown){return new TextEncoder().encode(JSON.stringify(payload)).length;}
