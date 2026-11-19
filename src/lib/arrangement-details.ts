import {allocationAt,type FinanceData} from './household-finance';
export type ArrangementDetails={before:string;categories:{category:string;pct:string}[]};
export const emptyDetails=():ArrangementDetails=>({before:'preserve',categories:[]});
export const validPercent=(s:string)=>s.trim()!==''&&Number.isFinite(Number(s))&&Number(s)>=0&&Number(s)<=100;
export const validDetails=(d:ArrangementDetails)=>['preserve','100','0'].includes(d.before)&&d.categories.every(c=>c.category.trim().length>0&&c.category.trim().length<=100&&validPercent(c.pct))&&new Set(d.categories.map(c=>c.category.trim().toLowerCase())).size===d.categories.length;
export function detailSnapshot(data:FinanceData,id:string,date:string,d:ArrangementDetails){return {
 before_pct:d.before==='preserve'?null:Number(d.before),category_overrides:d.categories.map(c=>({category:c.category.trim(),pct:Number(c.pct)})),
 expected_history:data.allocations.filter(r=>r.account_id===id&&r.effective_from<=date).sort((a,b)=>a.id.localeCompare(b.id)).map(r=>({id:r.id,effective_from:r.effective_from,owner_pct:Number(r.owner_pct),balance_pct:r.balance_pct==null?null:Number(r.balance_pct),included:r.included,partner_id:r.partner_id,note:r.note})),
 expected_categories:(data.categorySplits||[]).filter(r=>r.account_id===id).sort((a,b)=>a.id.localeCompare(b.id)).map(r=>({id:r.id,category:r.category,effective_from:r.effective_from,owner_pct:Number(r.owner_pct),partner_id:r.partner_id}))
};}
export function savedCategoryDetails(data:FinanceData,id:string,date:string):ArrangementDetails{return {before:'preserve',categories:(data.categorySplits||[]).filter(r=>r.account_id===id&&r.effective_from===date).map(r=>({category:r.category,pct:String(r.owner_pct)}))};}
export function arrangementEntry(data:FinanceData,id:string,date:string,expense:number,details:ArrangementDetails,balance:number|null=null){const r=allocationAt(data.allocations,id,date);return {account_id:id,expense_pct:expense,balance_pct:balance,expected_id:r?.id??null,expected_expense:r?.owner_pct??null,expected_balance:r?Number(r.balance_pct??r.owner_pct):null,...detailSnapshot(data,id,date,details)};}
