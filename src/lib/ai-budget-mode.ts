export type AIUsage={used:number;requestLimit:number;requestLimitEnabled?:boolean};
export function aiRequestsRemaining(c:AIUsage){return c.requestLimitEnabled===false?Number.MAX_SAFE_INTEGER:Math.max(0,c.requestLimit-c.used);}
export function aiUsageLabel(c:AIUsage){return c.requestLimitEnabled===false?`${c.used} analyses in the last 24 hours. Dollar budgets control spending; there is no task-count limit.`:`${c.used} of ${c.requestLimit} requests in the last 24 hours. Dollar budgets and your optional request cap both apply.`;}
