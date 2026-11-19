// Workspace presentation only. Never import this registry into finance calculations,
// bank sync, authorization, classification, or period-close persistence.
export const MODULES = [
  {id:'everyday', name:'Everyday finances', description:'Budgets, bills, subscriptions and budget-versus-actual tracking.', href:'/budgets', detail:'Saved budgets and recurring records stay in place when hidden.'},
  {id:'runway', name:'Cash runway', description:'Dated cash plans, projected account balances and a cash buffer.', href:'/runway', detail:'Forecasts never post transactions. Hiding this workspace preserves its plans and assumptions.'},
  {id:'goals', name:'Goals and life projects', description:'Fund goals, plan trips, weddings or moves, and track actual costs against commitments.', href:'/goals', detail:'Reservations earmark cash; they do not move money or create expenses. Plan revisions and archived plans remain available.'},
  {id:'analyst', name:'Analyst reporting', description:'Quarterly reviews, adjusted bridges, expense drivers, compensation quality, wealth and integrated scenarios.', href:'/analyst', detail:'All reporting uses the same ledger. Private analyst overlays, saved review editions and scenario revisions never rewrite reported history.'},
  {id:'household', name:'Household', description:'Partner access, dated account splits, lifecycle changes and reconciliation.', href:'/household', detail:'Turning this off does not revoke access, end sharing or reset historical splits. Manage those in Household first.'},
  {id:'close', name:'Period close', description:'Quarter-by-quarter onboarding, held snapshots and later restatements.', href:'/close', detail:'Closed periods stay closed and remain excluded from transaction review, even while this module is off.'},
  {id:'assets', name:'Assets and obligations', description:'Loans, prepayments, depreciation and manual assets.', href:'/amortization', detail:'Existing schedules keep contributing to statements when hidden. Investment balances remain available from Accounts.'},
  {id:'rewards', name:'Card benefits', description:'Track card credits, annual fees and benefits you actually use.', href:'/card-benefits', detail:'An optional tool independent of everyday budgeting. Turning it off preserves saved cards and benefits.'},
  {id:'income',name:'Income & compensation',description:'Gross-to-net paycheck bridges, variable pay and deposit reconciliation.',href:'/compensation',detail:'Paystubs explain bank deposits; they never create a second income entry. Private saved revisions stay available when hidden.'},
  {id:'investments',name:'Investment analysis',description:'Holdings, allocation, fees and contribution-adjusted performance.',href:'/investment-analysis',detail:'Positions reconcile to existing account balances. Manual dated prices and valuations remain saved; missing data never becomes an invented return.'},
  {id:'debt',name:'Debt payoff',description:'Account-linked terms, promotional APRs and avalanche versus snowball plans.',href:'/debt-payoff',detail:'Compares payoff strategies without duplicating liabilities or adding cash payments. Terms and history remain saved when hidden.'},
  {id:'longterm',name:'Long-term planning',description:'Saved life scenarios with downside, base and upside projections.',href:'/long-term',detail:'Starting snapshots and future events are versioned. Household changes and module switches never silently rewrite saved scenarios.'},
  {id:'watchlists',name:'Spending watchlists',description:'Follow a merchant or category without building another budget.',href:'/watchlists',detail:'Uses existing transactions only. Optional targets, source detail and saved revisions remain private and preserved when hidden.'},
  {id:'recoveries',name:'Money owed to you',description:'Track expected refunds and reimbursements against actual repayments.',href:'/money-owed',detail:'Links existing purchases and deposits without posting new expenses, income or receivables. Archived claims and source evidence remain saved.'},
] as const;
export type ModuleId = typeof MODULES[number]['id'];
export const ALL_MODULES: ModuleId[] = MODULES.map(m=>m.id);
export const PRESETS: {id:string;name:string;description:string;modules:ModuleId[]}[] = [
  {id:'essentials',name:'Essentials',description:'Manage spending, upcoming cash and savings goals.',modules:['everyday','runway','goals']},
  {id:'analyst',name:'Analyst',description:'Statements, compensation, investments, debt strategy and long-term scenarios.',modules:['everyday','runway','goals','analyst','close','assets','income','investments','debt','longterm']},
  {id:'household',name:'Household',description:'Everyday planning with dated partner sharing.',modules:['everyday','runway','goals','household']},
];
export function normalizeModules(value: unknown): ModuleId[] {
  if(!Array.isArray(value)) return [...ALL_MODULES];
  return ALL_MODULES.filter(id=>value.includes(id));
}
export function sameModules(a: readonly ModuleId[],b: readonly ModuleId[]) {
  return a.length===b.length&&a.every(id=>b.includes(id));
}
const ROUTES: Record<string,ModuleId> = {
  '/budgets':'everyday','/legacy-budgets':'everyday','/recurring':'everyday','/budget-vs-actual':'everyday','/card-benefits':'rewards','/events':'goals',
  '/runway':'runway','/goals':'goals','/trips':'goals',
  '/analyst':'analyst','/income-statement':'analyst','/cash-flow':'analyst','/balance-sheet':'analyst','/analytics':'analyst',
  '/advanced-income':'analyst','/advanced-cash':'analyst','/advanced-balance':'analyst',
  '/household':'household','/close':'close','/amortization':'assets','/asset-register':'assets',
  '/watchlists':'watchlists','/money-owed':'recoveries',
  '/compensation':'income','/investment-analysis':'investments','/debt-payoff':'debt','/long-term':'longterm',
};
export const moduleForPath = (path:string) => ROUTES[path.replace(/\/$/,'')];
export const visiblePath = (path:string,enabled:readonly ModuleId[]) => !moduleForPath(path)||enabled.includes(moduleForPath(path));
