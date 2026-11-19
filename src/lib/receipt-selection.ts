export type ReceiptSource = {name:string;text:string;emailId?:string};

// Page controls only change the visible page's IDs; other selections survive paging.
export function selectReceiptPage(selected:string[], page:string[], checked:boolean) {
  const visible=new Set(page);
  return checked ? [...new Set([...selected,...page])] : selected.filter(id=>!visible.has(id));
}

export async function loadReceiptBatch(
  selected:string[], slots:number, characters:number,
  load:(id:string)=>Promise<ReceiptSource>,
) {
  const ids:string[]=[], sources:ReceiptSource[]=[];
  const limit=Math.max(0,Math.min(10,Math.floor(slots)));
  let remaining=Math.max(0,characters);
  for(const id of [...new Set(selected)].slice(0,limit)) {
    if(!remaining)break;
    const source=await load(id);
    // Keep the remainder selected for the next batch, rather than truncating evidence.
    if(source.text.length>remaining)break;
    ids.push(id);sources.push(source);remaining-=source.text.length;
  }
  return {ids,sources};
}
