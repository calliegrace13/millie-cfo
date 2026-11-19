import type { Transaction, Account, Budget } from './types';

export function analyzeBudget(transactions: Transaction[], accounts: Account[], budgets: Budget[], period: string, scope: string, multiplier: (t: Transaction) => number, isJoint: (a: Account, date: string) => boolean) {
  const rows = new Map<string, { category: string; budget: number | null; actual: number }>();
  for (const b of budgets) {
    if (!b.is_active || (b.budget_scope || 'all') !== scope) continue;
    const value = Number(b.monthly_limit) * (period === 'yearly' ? (b.period === 'yearly' ? 1 : 12) : (b.period === 'yearly' ? 1 / 12 : 1));
    const row = rows.get(b.category) || { category: b.category, budget: null, actual: 0 };
    row.budget = (row.budget ?? 0) + value; rows.set(b.category, row);
  }
  for (const t of transactions) {
    if (t.pending || t.linked_transfer_id || t.category?.toLowerCase() === 'income' || t.category?.toLowerCase() === 'transfer') continue;
    const account = accounts.find(a => a.id === t.account_id);
    const joint = account ? isJoint(account, t.date) : false;
    if (scope === 'joint' && !joint || scope === 'personal' && joint) continue;
    const category = t.category || 'Uncategorized';
    const row = rows.get(category) || { category, budget: null, actual: 0 };
    row.actual += Number(t.amount) * multiplier(t); rows.set(category, row);
  }
  const sorted = [...rows.values()].sort((a, b) => (b.actual - (b.budget ?? 0)) - (a.actual - (a.budget ?? 0)) || a.category.localeCompare(b.category));
  return { rows: sorted, planned: sorted.reduce((s, r) => s + (r.budget ?? 0), 0), actual: sorted.reduce((s, r) => s + r.actual, 0) };
}
