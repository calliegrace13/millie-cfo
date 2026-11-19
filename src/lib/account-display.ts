import {balanceWeight,type FinanceData,type ReportOptions} from './household-finance';
import type {Account} from './types';
export function accountDisplayWeight(account:Account,data:FinanceData,userId:string,partnerId:string|null,today:string,view:'mine'|'household'='mine'){
 const options:ReportOptions={userId,partnerId,linkId:null,view,basis:'recorded',currency:account.currency||'USD',start:today,end:today};
 return balanceWeight(account,today,data,options);
}
export function liquidityByCurrency(data:FinanceData,userId:string,partnerId:string|null,today:string){
 const active=data.accounts.filter(a=>!a.is_deleted&&(['checking','credit'].includes(a.type)||(a.type as string)==='depository'&&a.subtype!=='savings'));
 return [...new Set(active.map(a=>a.currency||'USD'))].sort().map(currency=>{const rows=active.filter(a=>(a.currency||'USD')===currency);const total=(view:'mine'|'household')=>rows.reduce((n,a)=>n+(a.is_zero_balance?0:Number(a.current_balance)||0)*(a.type==='credit'?-1:1)*accountDisplayWeight(a,data,userId,partnerId,today,view),0);return {currency,mine:total('mine'),household:total('household')};});
}
