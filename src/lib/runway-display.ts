import type {Account} from './types';
// Presentation only: bank descriptions and financial identities stay intact.
export const shortAccountName=(name:string)=>name.replace(/\uFFFD/g,'').replace(/\s*(?:\.{3}|•{2,})\s*\d{4}/g,'').replace(/\s+/g,' ').trim();
export function runwayAccountLabel(account:Account|undefined){
 if(!account)return 'Unavailable account';
 const bank=account.provider_institution_name||'';let name=shortAccountName(account.name);
 if(bank&&name.toLowerCase().startsWith(bank.toLowerCase()))name=name.slice(bank.length).trim();
 if(name===name.toUpperCase())name=name.toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());
 return [bank,name].filter(Boolean).join(' · ')+(account.mask?' •'+account.mask.slice(-4):'');
}
export function runwayPaymentTitle(name:string,kind:string,card:Account|undefined){
 if(kind==='Paycheck'){const employer=name.replace(/\b(?:PPD|WEB|CTX)\s+ID\s*:\s*\S+/gi,'').replace(/\bDIR(?:ECT)?\s+DEP(?:OSIT)?\b|\bPAYROLL\b|\bSALARY\b/gi,'').replace(/\s+/g,' ').trim();return employer?'Paycheck · '+employer:'Paycheck';}
 if(card){const bank=card.provider_institution_name||'';let label=shortAccountName(card.name);if(bank&&label.toLowerCase().startsWith(bank.toLowerCase()))label=label.slice(bank.length).trim();if(label===label.toUpperCase())label=label.toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());return (label.toLowerCase()==='credit card'?bank+' card':label)+(card.mask?' •'+card.mask.slice(-4):'');}
 return name.replace(/\b(?:PPD|WEB|CTX)\s+ID\s*:\s*\S+/gi,'').trim();
}
export const runwayDate=(date:string)=>{const d=new Date(date+'T12:00:00');return Number.isFinite(+d)?new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric'}).format(d):'Choose date';};
