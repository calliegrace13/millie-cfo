import {analyticalReport,report,type FinanceData,type ReportOptions} from './household-finance';
export function reconcileLifecycle(data:FinanceData,options:ReportOptions,today=new Date().toISOString().slice(0,10)){
 // Every column uses the identical authorized account universe and currency.
 const ids=options.accountIds||data.accounts.map(a=>a.id);
 const common={...options,accountIds:ids};
 const mine=analyticalReport(data,{...common,view:'mine'}),partner=analyticalReport(data,{...common,view:'partner'});
 const combined=analyticalReport(data,{...common,view:'household',basis:'comparable'});
 // Keep the original household inclusion policy. The combined column expands
 // to the available universe; that must not silently expand the household too.
 const household=analyticalReport(data,{...options,view:'household'});
 const metrics=[['Income','income'],['Expenses','expenses'],['Surplus','netIncome'],['Cash movement','netCash']] as const;
 const rows: {label:string;mine:number;partner:number;unattributed:number;combined:number;outsideHousehold:number;household:number}[]=metrics.map(([label,key])=>({label,mine:mine[key],partner:partner[key],unattributed:combined[key]-mine[key]-partner[key],combined:combined[key],outsideHousehold:combined[key]-household[key],household:household[key]}));
 const current=(view:ReportOptions['view'],basis=options.basis)=>report(data,{...common,view,basis,start:today,end:today}).netWorth;
 const m=current('mine'),p=current('partner'),c=current('household','comparable'),h=report(data,{...options,view:'household',start:today,end:today}).netWorth;
 rows.push({label:'Current account net worth',mine:m,partner:p,unattributed:c-m-p,combined:c,outsideHousehold:c-h,household:h});
 return {rows,accountIds:ids,missing:ids.filter(id=>!data.accounts.some(a=>a.id===id)),unattributed:rows.some(r=>Math.abs(r.unattributed)>.01),count:combined.count};
}
