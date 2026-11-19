import {analyticalReport,type FinanceData,type FinanceDocument,type ReportOptions} from './household-finance';
export function projectProgress(data:FinanceData,project:FinanceDocument,userId:string,partnerId:string|null,linkId:string|null){
 const p=project.payload;const ids=new Set<string>(p.transactionIds||[]);const chosen=data.transactions.filter(t=>ids.has(t.id));
 const dates=chosen.map(t=>t.date).sort();const options:ReportOptions={userId,partnerId,linkId,view:p.view==='household'?'household':'mine',basis:p.basis==='comparable'?'comparable':'recorded',currency:p.currency||'USD',start:p.start||dates[0]||'2000-01-01',end:p.end||dates.at(-1)||p.start||'2000-01-01',accountIds:p.accountIds,normalized:false};
 // Actual costs need only the selected records' available dates. Do not expand
 // empty/unavailable selections into thousands of years of monthly budgets.
 const start=dates.length&&dates[0]>options.start?dates[0]:options.start;
 const end=dates.length&&dates.at(-1)!<options.end?dates.at(-1)!:options.end;
 const report=dates.length&&start<=end?analyticalReport({...data,budgets:[]},{...options,start,end}):{lines:[]};const lines=report.lines.filter(l=>ids.has(l.id)&&!l.income);
 const actual=lines.reduce((s,l)=>s+l.amount,0);const committed=p.status==='archived'?0:Math.max(0,Number(p.committed)||0);const budget=Math.max(0,Number(p.budget)||0);
 return {options,lines,actual,committed,budget,remaining:budget-actual-committed,missing:[...ids].filter(id=>!chosen.some(t=>t.id===id)),outsideScope:chosen.filter(t=>!lines.some(l=>l.id===t.id)).length};
}
