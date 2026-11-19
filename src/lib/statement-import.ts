export function parseStatement(text:string,reverse=false){
 const records:string[][]=[];let row:string[]=[],value='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}else if(!quoted&&(c===','||c==='\n')){row.push(value.replace(/\r$/,''));value='';if(c==='\n'){if(row.some(x=>x.trim()))records.push(row);row=[];}}else value+=c;}
 if(quoted)throw new Error('Unclosed quoted field');row.push(value.replace(/\r$/,''));if(row.some(x=>x.trim()))records.push(row);
 const header=(records.shift()||[]).map(x=>x.replace(/^\uFEFF/,'').trim().toLowerCase());for(const k of ['date','name','amount'])if(!header.includes(k))throw new Error('Use columns date,name,amount,category (category is optional). Dates must be YYYY-MM-DD.');
 if(records.length>500)throw new Error('Import at most 500 rows per file.');
 return records.map((r,i)=>{const get=(k:string)=>r[header.indexOf(k)]?.trim()||'';const date=get('date'),name=get('name'),raw=get('amount').replace(/[$,]/g,'');const amount=Number(raw)*(reverse?-1:1);if(!/^\d{4}-\d\d-\d\d$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||!name||name.length>300||!raw||!Number.isFinite(amount))throw new Error(`Invalid row ${i+2}; check date, name and amount.`);return {date,name,amount,category:get('category')};});
}
