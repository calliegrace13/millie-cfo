import fs from 'node:fs';import assert from 'node:assert/strict';import crypto from 'node:crypto';import vm from 'node:vm';
const html=fs.readFileSync(new URL('../gmail-callback.html',import.meta.url),'utf8'),script=html.match(/<script>([\s\S]*?)<\/script>/)[1],hash=crypto.createHash('sha256').update(script).digest('base64');
assert(html.includes("script-src 'self' 'sha256-"+hash+"'"));assert(html.includes('no-referrer'));assert(!/<(?:img|iframe|link)\b/i.test(html));
assert(html.includes('<script type="module" src="/src/main.tsx">'));
assert(html.indexOf('<script>'+script)<html.indexOf('src="/src/main.tsx"'));
assert(!/location\.(?:replace|assign)\(|location(?:\.href)?\s*=/.test(script),'OAuth return must resume in the same document');
function run(search){let saved,returned,cleaned;vm.runInNewContext(script,{URLSearchParams,Date,location:{search,replace:u=>returned=u},sessionStorage:{setItem:(k,v)=>{assert.equal(k,'millie-gmail-callback');saved=JSON.parse(v);}},history:{replaceState:(state,title,u)=>cleaned=u}});return {saved,returned,cleaned};}
const state='a'.repeat(43),r=run('?code=synthetic-code&state='+state);
assert.equal(r.saved.code,'synthetic-code');assert.equal(r.saved.state,state);assert.equal(r.cleaned,'/transactions#receipt-review');assert.equal(r.returned,undefined);assert(!r.cleaned.includes('code'));
assert(run('?code=synthetic&state=invalid').saved.error);assert(run('?error=access_denied').saved.error);
assert(run('?code='+ 'x'.repeat(5001)+'&state='+state).saved.error);
let cleanedOnFailure;assert.throws(()=>vm.runInNewContext(script,{URLSearchParams,Date,location:{search:'?code=synthetic&state='+state},sessionStorage:{setItem(){throw Error('Storage unavailable');}},history:{replaceState:(s,t,u)=>cleanedOnFailure=u}}));assert.equal(cleanedOnFailure,'/transactions#receipt-review');
if(process.argv.includes('--built')){
 const built=fs.readFileSync(new URL('../dist/gmail-callback.html',import.meta.url),'utf8');
 assert(built.includes('<script>'+script+'</script>'),'Built return must retain cleanup script and matching CSP hash');
 const entries=[...built.matchAll(/<script\b[^>]*src="([^"]+)"/g)].map(m=>m[1]);assert(entries.length>0);
 for(const entry of entries){assert(entry.startsWith('/assets/'));assert(fs.existsSync(new URL('../dist'+entry,import.meta.url)));}
 assert(!built.includes('/src/main.tsx'));assert(!built.includes('location.replace'));
}
console.log('PASS same-document OAuth return, URL cleanup before app execution, bounded state, denial and storage-failure handling'+(process.argv.includes('--built')?', production app entry and CSP':'')+'. No real authorization codes.');
