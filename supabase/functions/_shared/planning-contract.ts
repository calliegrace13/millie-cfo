// v1 contracts shared by independently deployed planning services and their clients.
// Planning records never write balances, transactions, allocations or closed reports.
export type Domain = 'income'|'investments'|'debt'|'long_term';
export type PlanRecord = {id:string;owner_id:string;domain:Domain;kind:string;name:string;payload:Record<string,any>;revision:number;status:'active'|'archived';updated_at:string};
export type Field = {key:string;label:string;type:'number'|'date'|'text'|'account'|'boolean';min?:number;max?:number;optional?:boolean;default?:any;hint?:string};
const number=(key:string,label:string,min=0,max=1e9,optional=false):Field=>({key,label,type:'number',min,max,optional});
const date=(key:string,label:string,optional=false):Field=>({key,label,type:'date',optional});
const account:Field={key:'accountId',label:'Account',type:'account'};
export const SCHEMAS:Record<Domain,Record<string,{label:string;fields:Field[]}>>={
 income:{paycheck:{label:'Paycheck',fields:[date('date','Pay date'),date('periodStart','Pay period starts'),date('periodEnd','Pay period ends'),number('salary','Salary / hourly gross'),number('bonus','Bonus / commission'),number('otherCash','Other cash earnings'),number('taxes','Taxes withheld'),number('retirement','Employee retirement'),number('benefits','Benefits deducted'),number('deductions','Other deductions'),number('reimbursements','Reimbursements'),number('employerRetirement','Employer retirement (noncash)'),number('equity','Equity awards (noncash)')]}},
 investments:{holding:{label:'Holding',fields:[account,{key:'symbol',label:'Symbol or identifier',type:'text'},{key:'assetClass',label:'Asset class',type:'text'},date('date','Price as of'),number('units','Units'),number('price','Price per unit'),number('costBasis','Total cost basis',0,1e9,true),number('feeBps','Annual fee (basis points)',0,10000,true)]},valuation:{label:'Account valuation',fields:[account,date('date','Valuation date'),number('value','Closing value')]},flow:{label:'External investment flow',fields:[account,date('date','Flow date'),number('amount','Contribution (+) or withdrawal (−)',-1e9,1e9)]}},
 debt:{terms:{label:'Debt terms',fields:[account,number('apr','Standard APR (%)',0,100),number('minimum','Fixed monthly minimum',0,1e7),number('minimumPct','Minimum balance percentage',0,100),number('promoApr','Promotional APR (%)',0,100,true),date('promoEnd','Promotion ends',true),date('date','Next payment date')]}},
 long_term:{scenario:{label:'Scenario',fields:[date('date','Starting snapshot date'),number('startingAssets','Starting financial assets'),number('monthlySaving','Monthly saving after bills and debt',-1e7,1e7),number('savingGrowth','Annual saving growth (%)',-50,50),number('years','Years to project',1,80),number('inflation','Annual inflation (%)',0,30),number('downside','Downside annual return (%)',-90,100),number('base','Base annual return (%)',-90,100),number('upside','Upside annual return (%)',-90,100),number('retireYear','Stop saving after year',0,80,true),number('annualSpending','Annual spending after that (today’s money)',0,1e8),{key:'scope',label:'Snapshot scope and balance dates',type:'text'}]}}
};
export function validDate(value:any){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value<'1900-01-01'||value>'2200-12-31')return false;const d=new Date(value+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;}
export function validatePlan(domain:Domain,kind:string,name:string,p:any):string|null{
 const schema=SCHEMAS[domain]?.[kind];if(!schema||typeof name!=='string'||!name.trim()||name.length>150||!p||typeof p!=='object'||Array.isArray(p))return 'Choose a record type and a name (up to 150 characters).';
 if(!/^[A-Z]{3}$/.test(p.currency||''))return 'Choose a three-letter currency.';
 for(const f of schema.fields){const v=p[f.key];if(f.optional&&(v===undefined||v===null||v===''))continue;
  if(f.type==='number'&&(typeof v!=='number'||!Number.isFinite(v)||v<f.min!||v>f.max!))return f.label+' is outside the allowed range.';
  if(f.type==='date'&&!validDate(v))return 'Choose a valid '+f.label.toLowerCase()+'.';
  if((f.type==='text'||f.type==='account')&&(typeof v!=='string'||!v.trim()||v.length>3000))return 'Enter '+f.label.toLowerCase()+'.';
 }
 if(domain==='income'&&(p.periodEnd<p.periodStart||p.date<p.periodStart))return 'Check the pay period and pay date.';
 if(domain==='income'&&netPay(p)<0)return 'Deductions exceed cash earnings and reimbursements.';
 if(domain==='debt'&&((p.promoApr!=null)!==!!p.promoEnd))return 'Enter both the promotional APR and its end date.';
 if(domain==='long_term'){
  if(!Number.isInteger(p.years)||(p.retireYear!=null&&(!Number.isInteger(p.retireYear)||p.retireYear>p.years))||p.downside>p.base||p.base>p.upside)return 'Use whole years and returns ordered downside ≤ base ≤ upside.';
  if(!Array.isArray(p.events)||p.events.length>100||p.events.some((e:any)=>!e.name?.trim()||e.name.length>150||!validDate(e.date)||e.date<=p.date||typeof e.amount!=='number'||!Number.isFinite(e.amount)||Math.abs(e.amount)>1e9))return 'Life events need a name, future date and signed amount (up to 100 events).';
 }
 if(p.transactionIds!==undefined&&(!Array.isArray(p.transactionIds)||p.transactionIds.length>20||new Set(p.transactionIds).size!==p.transactionIds.length||p.transactionIds.some((x:any)=>typeof x!=='string'||!/^[0-9a-f-]{36}$/i.test(x))))return 'Choose distinct source transactions.';
 return null;
}
export const netPay=(p:Record<string,any>)=>p.salary+p.bonus+p.otherCash-p.taxes-p.retirement-p.benefits-p.deductions+p.reimbursements;
