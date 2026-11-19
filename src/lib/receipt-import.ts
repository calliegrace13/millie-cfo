import PostalMime from 'postal-mime';
// Parse as data with PostalMime, never as a browser document: no image requests,
// tracking links, scripts, or receipt HTML enter the DOM. Preserve product alt text.
export async function receiptHTMLText(html:string){
 const prepared=html.replace(/<(script|style|svg|iframe|object)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,' ')
 .replace(/<img\b(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi,tag=>{const alt=tag.match(/\balt\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);return ' '+(alt?.[1]??alt?.[2]??alt?.[3]??'').replace(/</g,'&lt;').replace(/>/g,'&gt;')+' ';})
 .replace(/<a\b[^>]*>/gi,'<a>');
 const entities:Record<string,string>={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',ndash:'–',mdash:'—',rsquo:'’',lsquo:'‘',rdquo:'”',ldquo:'“',hellip:'…'};
 return prepared.replace(/<!--[\s\S]*?-->/g,' ').replace(/<[^>]*>/g,' ').replace(/&(#x[a-f0-9]+|#\d+|[a-z]+);/gi,(match,entity:string)=>{if(entity[0]!=='#')return entities[entity.toLowerCase()]??match;const cp=entity[1].toLowerCase()==='x'?parseInt(entity.slice(2),16):Number(entity.slice(1));return Number.isInteger(cp)&&cp>0&&cp<=0x10ffff&&!(cp>=0xd800&&cp<=0xdfff)?String.fromCodePoint(cp):'�';}).replace(/\s+/g,' ').trim();
}
export async function receiptFileText(name:string,raw:string){
 if(/\.eml$/i.test(name)){const mail=await PostalMime.parse(raw);return `${mail.subject||''}\n${mail.date||''}\n${mail.html?await receiptHTMLText(mail.html):mail.text||''}`;}
 return /\.html?$/i.test(name)?receiptHTMLText(raw):raw;
}
