import {accountingReport} from './reporting-engine';
import {previousCalendarPeriod} from './reporting-periods';
import {balanceWeight, expenseWeight, type FinanceData, type ReportOptions} from './household-finance';
import {closedForReview} from '../../supabase/functions/_shared/review-periods';

export type BriefingPeriod = 'last-month' | 'this-month' | 'last-quarter' | 'this-quarter';
export type BriefingAction = {id:string; priority:number; title:string; detail:string; href:string; cta:string};
const iso=(d:Date)=>d.toISOString().slice(0,10);
const date=(y:number,m:number,d:number)=>iso(new Date(Date.UTC(y,m,d)));
/** Calendar periods, with equal elapsed days for an unfinished period. */
export function briefingPeriods(period:BriefingPeriod,today:string){
 const y=Number(today.slice(0,4)),m=Number(today.slice(5,7))-1,quarter=period.includes('quarter'),width=quarter?3:1;
 const first=(quarter?Math.floor(m/3)*3:m)-(period.startsWith('last')?width:0);
 const start=date(y,first,1),fullEnd=date(y,first+width,0),end=today<fullEnd?today:fullEnd;
 const {priorStart,priorEnd}=previousCalendarPeriod(start,end,width);
 return {start,end,priorStart,priorEnd,partial:end<fullEnd};
}

/** Read-only briefing over the same statement service used by reporting and close. */
export function buildCfoBriefing(data:FinanceData,o:ReportOptions,prior:ReportOptions){
 const book=accountingReport(data,{...o,normalized:false}),previous=accountingReport(data,{...prior,normalized:false});
 const current=book.result,before=previous.result;
 const categories=[...new Set([...current.rows,...before.rows].map(r=>r.category))];
 const drivers=categories.map(category=>({category,current:current.rows.find(r=>r.category===category)?.actual||0,prior:before.rows.find(r=>r.category===category)?.actual||0})).map(d=>({...d,change:d.current-d.prior})).sort((a,b)=>Math.abs(b.change)-Math.abs(a.change));
 const activity=book.journal.length>0,comparisonAvailable=activity&&previous.journal.length>0;
 const ids=new Set(book.journal.flatMap(j=>j.sourceId.split(' | ')));
 const review=data.transactions.filter(t=>t.user_id===o.userId&&ids.has(t.id)&&!t.pending&&!closedForReview(t,data.documents||[],o.userId)&&(t.needs_review||!t.category));
 const scoped=data.transactions.filter(t=>{const a=data.accounts.find(a=>a.id===t.account_id);return a&&!t.pending&&t.date<=o.end&&(expenseWeight(t,a,data,o)>0||balanceWeight(a,t.date,data,o)>0);});
 const latest=scoped.map(t=>t.date).sort().at(-1)||null;
 const accountIds=(journal:typeof book.journal)=>{const sourceIds=new Set(journal.flatMap(j=>j.sourceId.split(' | ')));return new Set(data.transactions.filter(t=>sourceIds.has(t.id)).map(t=>t.account_id));};
 const currentAccounts=accountIds(book.journal),oldAccounts=accountIds(previous.journal);
 const accountCoverageChanged=[...currentAccounts].some(a=>!oldAccounts.has(a))||[...oldAccounts].some(a=>!currentAccounts.has(a));
 const relevant=new Set(scoped.map(t=>t.account_id));
 const sharingChanges=data.allocations.filter(a=>relevant.has(a.account_id)&&a.effective_from>prior.start&&a.effective_from<=o.end).length;
 const credits=current.rows.filter(r=>r.actual<-.005).map(r=>r.category);
 const driverDifference=drivers.reduce((sum,d)=>sum+d.change,0)-(current.expenses-before.expenses);
 const checks=[...book.checks,{label:'All category changes explain the expense change',difference:driverDifference,passed:Math.abs(driverDifference)<.005}];
 const actions:BriefingAction[]=[];
 if(checks.some(c=>!c.passed)||previous.checks.some(c=>!c.passed))actions.push({id:'controls',priority:0,title:'A reporting check needs attention',detail:'Open the statement controls before relying on these results.',href:'/overview',cta:'Check reporting'});
 if(!activity)actions.push({id:'coverage',priority:1,title:'No activity to summarize in this view',detail:'Choose another period or check account imports and dated sharing. An empty view is not evidence of zero spending.',href:'/accounts',cta:'Check accounts'});
 if(credits.length)actions.push({id:'credits',priority:3,title:'Credits exceed charges in '+credits.length+' '+(credits.length===1?'category':'categories'),detail:credits.slice(0,3).join(', ')+'. Check refunds, income and card-payment classification before interpreting lower expenses.',href:'/transactions#movements',cta:'Check movements'});
 if(review.length)actions.push({id:'review',priority:4,title:review.length+' '+(review.length===1?'transaction needs':'transactions need')+' review in this period',detail:'Only your open-period items are included. Closed-period activity stays out of the review queue.',href:'/transactions?quarter='+o.start.slice(0,4)+'-'+String(Math.floor((Number(o.start.slice(5,7))-1)/3)*3+1).padStart(2,'0')+'-01',cta:'Review transactions'});
 if(book.coverage.unassigned||book.missingAccounts.length)actions.push({id:'unassigned',priority:2,title:'Some records lack account context',detail:'Check account coverage before treating these totals as complete.',href:'/accounts',cta:'Check accounts'});
 if(activity&&!book.netWorthBridge.complete)actions.push({id:'balances',priority:8,title:'Add dated balances to explain wealth creation',detail:'Opening, closing and ownership-change observations are needed. Today’s balances cannot stand in for historical evidence.',href:'/overview',cta:'Review balance evidence'});
 else if(activity&&!book.netWorthBridge.reconciled)actions.push({id:'wealth',priority:7,title:'Part of the wealth change is unexplained',detail:'Valuation changes or missing activity may explain the residual. It is not automatically investment performance.',href:'/overview',cta:'Review the bridge'});
 return {book,previous,activity,comparisonAvailable,drivers,reviewCount:review.length,latest,accountCoverageChanged,sharingChanges,credits,checks,actions,
  surplusChange:comparisonAvailable?current.netIncome-before.netIncome:null};
}

export type BriefingWork={id:string;owner_id?:string;status:string;kind?:string;summary?:string;updated_at?:string;answer?:string|null};
/** Work checkpoints are not transaction counts or proof of financial changes. */
export function briefingWork(work:BriefingWork[],inbox:BriefingWork[],owner:string,now:string){
 const own=(items:BriefingWork[])=>[...new Map(items.filter(x=>x.owner_id===owner).map(x=>[x.id,x])).values()];
 const since=Date.parse(now)-7*86400000;
 const completed=own(work).filter(w=>w.status==='done'&&Number.isFinite(Date.parse(w.updated_at||''))&&Date.parse(w.updated_at!)>=since&&Date.parse(w.updated_at!)<=Date.parse(now)).sort((a,b)=>(b.updated_at||'').localeCompare(a.updated_at||''));
 return {completed,failed:own(work).filter(w=>w.status==='failed'),questions:own(inbox).filter(i=>i.status==='needs_input'&&!i.answer),answered:own(inbox).filter(i=>i.status==='needs_input'&&!!i.answer),ready:own(inbox).filter(i=>i.status==='ready')};
}
