import {netPay,type PlanRecord} from '../../supabase/functions/_shared/planning-contract.ts';
export {netPay};
export const cents=(n:number)=>Math.round((n+Number.EPSILON)*100)/100;
export const day=(d:string)=>Date.parse(d+'T00:00:00Z')/86400000;
export function payBridge(records:PlanRecord[],transactions:any[]){return records.map(r=>{const ids=r.payload.transactionIds||[],actual=ids.length?transactions.filter(t=>ids.includes(t.id)&&!t.pending).reduce((s,t)=>s-Number(t.amount),0):null;const missing=ids.some(id=>!transactions.some(t=>t.id===id&&!t.pending));return {record:r,expected:cents(netPay(r.payload)),actual:missing?null:actual,variance:actual==null||missing?null:cents(actual-netPay(r.payload))};});}
// Values are position observations, never an extra asset added to account balances.
export function holdingAnalysis(records:PlanRecord[],accounts:any[],currency:string){
 const rows=records.filter(r=>r.kind==='holding'&&r.status==='active'&&r.payload.currency===currency&&accounts.some(a=>a.id===r.payload.accountId&&!a.is_deleted)).map(r=>({record:r,value:cents(r.payload.units*r.payload.price)}));
 const total=rows.reduce((s,r)=>s+r.value,0);const knownCost=rows.filter(r=>typeof r.record.payload.costBasis==='number');const knownFee=rows.filter(r=>typeof r.record.payload.feeBps==='number');
 const classes:Record<string,number>={};for(const r of rows)classes[r.record.payload.assetClass]=(classes[r.record.payload.assetClass]||0)+r.value;
 return {rows,total,classes,costCoverage:knownCost.reduce((s,r)=>s+r.value,0),unrealized:knownCost.reduce((s,r)=>s+r.value-r.record.payload.costBasis,0),feeCoverage:knownFee.reduce((s,r)=>s+r.value,0),annualFee:knownFee.reduce((s,r)=>s+r.value*r.record.payload.feeBps/10000,0),accounts:accounts.map(a=>({account:a,holdings:rows.filter(r=>r.record.payload.accountId===a.id).reduce((s,r)=>s+r.value,0)}))};
}
// End-of-day Modified Dietz; explicitly approximate, requires a complete external-flow set.
export function investmentReturn(open:number,close:number,start:string,end:string,flows:{date:string;amount:number}[],complete:boolean){
 const days=day(end)-day(start);if(!complete||days<=0||!Number.isFinite(open)||!Number.isFinite(close)||flows.some(f=>f.date<=start||f.date>end||!Number.isFinite(f.amount)))return null;
 const net=flows.reduce((s,f)=>s+f.amount,0),denominator=open+flows.reduce((s,f)=>s+f.amount*(day(end)-day(f.date))/days,0);
 if(denominator<=0)return null;return {gain:cents(close-open-net),rate:(close-open-net)/denominator,net,denominator};
}
export type DebtInput={id:string;name:string;balance:number;apr:number;minimum:number;minimumPct:number;promoApr?:number;promoEnd?:string};
export function debtSchedule(debts:DebtInput[],extra:number,start:string,strategy:'avalanche'|'snowball'){
 if(!Number.isFinite(extra)||extra<0||debts.some(d=>!Number.isFinite(d.balance)||d.balance<0||!Number.isFinite(d.apr)||d.apr<0||d.apr>100||d.minimum<0||d.minimumPct<0))return {error:'Check balances and debt terms.',rows:[],interest:0,months:0};
 const balances=debts.map(d=>cents(d.balance)),pool=cents(debts.reduce((s,d)=>{const rate=d.promoApr!=null&&d.promoEnd&&start<=d.promoEnd?d.promoApr:d.apr;return s+Math.min(d.balance+cents(d.balance*rate/1200),Math.max(d.minimum,(d.balance+cents(d.balance*rate/1200))*d.minimumPct/100));},0)+extra);let interestTotal=0;const rows:any[]=[];
 if(!balances.some(b=>b>0))return {error:null,rows,interest:0,months:0,pool};
 for(let month=0;month<1200;month++){
  const dt=new Date(start+'T12:00:00Z'),anchor=dt.getUTCDate();dt.setUTCDate(1);dt.setUTCMonth(dt.getUTCMonth()+month);const last=new Date(Date.UTC(dt.getUTCFullYear(),dt.getUTCMonth()+1,0)).getUTCDate();dt.setUTCDate(Math.min(anchor,last));const date=dt.toISOString().slice(0,10);
  const before=balances.reduce((s,b)=>s+b,0);let accrued=0;
  const rates=debts.map(d=>d.promoApr!=null&&d.promoEnd&&date<=d.promoEnd?d.promoApr:d.apr);
  balances.forEach((b,i)=>{const x=cents(b*rates[i]/1200);accrued+=x;balances[i]=cents(b+x);});
  const payments=balances.map((b,i)=>Math.min(b,cents(Math.max(debts[i].minimum,b*debts[i].minimumPct/100))));let used=payments.reduce((s,p)=>s+p,0);
  if(used>pool+.01)return {error:'The payment budget cannot cover minimums as interest accrues. Increase the extra payment.',rows,interest:interestTotal,months:month,pool};
  balances.forEach((b,i)=>balances[i]=cents(b-payments[i]));let left=cents(pool-used);
  const order=debts.map((_,i)=>i).sort((a,b)=>strategy==='avalanche'?rates[b]-rates[a]||balances[a]-balances[b]:balances[a]-balances[b]||rates[b]-rates[a]);
  for(const i of order){const pay=Math.min(left,balances[i]);balances[i]=cents(balances[i]-pay);payments[i]+=pay;left=cents(left-pay);}
  const remaining=cents(balances.reduce((s,b)=>s+b,0));interestTotal=cents(interestTotal+accrued);rows.push({date,payment:cents(payments.reduce((s,p)=>s+p,0)),interest:cents(accrued),principal:cents(before-remaining),remaining});
  if(remaining<=.01)return {error:null,rows,interest:interestTotal,months:month+1,pool};
  if(month>24&&remaining>=before&&debts.every(d=>!d.promoEnd||date>d.promoEnd))return {error:'Payments do not reduce the balance. Increase the payment budget.',rows,interest:interestTotal,months:month+1,pool};
 }
 return {error:'No payoff within 100 years under these assumptions.',rows,interest:interestTotal,months:1200,pool};
}
export function projectScenario(p:Record<string,any>,annualReturn:number){
 let assets=p.startingAssets,shortfall:string|null=null;const rows=[{year:0,date:p.date,nominal:assets,real:assets}];const start=new Date(p.date+'T12:00:00Z');
 for(let m=1;m<=p.years*12;m++){
  const d=new Date(start);d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+m);d.setUTCDate(Math.min(start.getUTCDate(),new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate()));const date=d.toISOString().slice(0,10);
  const prior=new Date(start);prior.setUTCDate(1);prior.setUTCMonth(prior.getUTCMonth()+m-1);prior.setUTCDate(Math.min(start.getUTCDate(),new Date(Date.UTC(prior.getUTCFullYear(),prior.getUTCMonth()+1,0)).getUTCDate()));const before=prior.toISOString().slice(0,10);
  const saving=p.retireYear!=null&&m>p.retireYear*12?-p.annualSpending/12*(1+p.inflation/100)**(m/12):p.monthlySaving*(1+p.savingGrowth/100)**Math.floor((m-1)/12);
  assets=Math.max(assets,0)*(1+annualReturn/100)**(1/12)+Math.min(assets,0)+saving+(p.events||[]).filter(e=>e.date>before&&e.date<=date).reduce((s,e)=>s+e.amount,0);
  if(assets<0&&!shortfall)shortfall=date;
  if(m%12===0)rows.push({year:m/12,date,nominal:cents(assets),real:cents(assets/(1+p.inflation/100)**(m/12))});
 }
 return {rows,shortfall};
}
