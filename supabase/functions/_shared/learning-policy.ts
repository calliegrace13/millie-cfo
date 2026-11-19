// Pure policy evaluation: no provider, ledger writes, or permission changes.
export const POLICY_EFFECTS = {
 expense_now:'Expense when purchased', spread_service:'Spread over confirmed coverage',
 asset_review:'Consider depreciation', refundable_deposit:'Keep refundable deposits as assets',
 ask:'Ask me before automatic approval', guidance:'Use as planning guidance',
} as const;
export type LearningPolicy={id:string;revision:number;title:string;guidance:string;module:string;effect:keyof typeof POLICY_EFFECTS;merchant:string;category:string;account_id:string|null;currency:string;min_amount:number;max_amount:number|null;starts_on:string;ends_on:string|null;enabled:boolean;source_item_id?:string|null};
export const merchantKey=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function matchingPolicies(policies:LearningPolicy[],t:any,module:string){return policies.filter(p=>p.enabled&&(p.module==='all'||p.module===module)&&t.date>=p.starts_on&&(!p.ends_on||t.date<=p.ends_on)&&(!p.account_id||p.account_id===t.account_id)&&(!p.currency||p.currency===t.currency)&&Number(t.amount)>=Number(p.min_amount)&&(p.max_amount===null||Number(t.amount)<=Number(p.max_amount))&&(!p.category||p.category===t.category)&&(!p.merchant||(' '+merchantKey(t.merchant||t.merchant_name||t.name||'')+' ').includes(' '+merchantKey(p.merchant)+' ')));}
export function policyDecision(policies:LearningPolicy[],t:any,module:string){
 const matches=matchingPolicies(policies,t,module),effects=[...new Set(matches.map(p=>p.effect).filter(e=>e!=='guidance'))];
 const conflict=effects.length>1;
 return {matches,effect:conflict?'ask':effects[0]||null,conflict,signature:matches.map(p=>[p.id,p.revision]).sort(),reason:conflict?'Your matching policies disagree. Choose the treatment for this purchase or narrow their scope.':effects[0]==='ask'?'Your policy requires a personal decision before automatic approval.':''};
}
export function categoryMayAutoApply(policies:LearningPolicy[],t:any){const d=policyDecision(policies,t,'transactions');return !d.effect||d.effect==='expense_now';}
export function enforcePolicy(item:any,t:any,policies:LearningPolicy[],module:string){
 const d=policyDecision(policies,t,module),policy_refs=d.matches.map(p=>({id:p.id,revision:p.revision,title:p.title,effect:p.effect}));
 const annotated={...item,policy_refs};
 if(!['category','plan'].includes(item.kind)||!d.effect)return annotated;
 if(d.effect==='ask'&&!d.conflict)return {...annotated,policy_hold:d.reason};
 const expected:any={spread_service:'service',asset_review:'asset',refundable_deposit:'deposit'};
 let reason=d.reason;
 if(item.kind==='category'&&d.effect!=='expense_now')reason=reason||'This purchase has a timing policy. Confirm its treatment in Assets and obligations before approving its category.';
 if(item.kind==='plan'&&(d.effect==='expense_now'||expected[d.effect]&&item.plan_kind!==expected[d.effect]))reason='This proposal conflicts with your saved treatment. Confirm a one-time exception in the manual tools, or edit the policy.';
 return reason?{...annotated,kind:'question',question:reason,explanation:item.explanation+' No financial change was saved.'}:annotated;
}
