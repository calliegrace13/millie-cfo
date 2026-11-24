// Read-only provider comparison. Missing IDs or similar purchases alone never
// authorize deletion. Only the provider's explicit pending ID proves identity.
export function compareBankSnapshot(local: any[], provider: any[], accounts: any[]) {
  const mapping = new Map(accounts.map(a => [a.plaid_account_id, a.id]));
  const current = new Map(provider.map(t => [t.transaction_id, t]));
  const stored = new Map(local.filter(t => t.plaid_transaction_id).map(t => [t.plaid_transaction_id, t]));
  const pairs: any[] = [];
  for (const t of provider) {
    const previous = stored.get(t.pending_transaction_id), posted = stored.get(t.transaction_id);
    if (!t.pending && previous && posted && previous.id !== posted.id &&
        previous.account_id === mapping.get(t.account_id) && posted.account_id === previous.account_id) {
      pairs.push({pending_id: previous.id, posted_id: posted.id});
    }
  }
  const groups = new Map<string, any[]>();
  for (const t of local.filter(t => !t.pending)) {
    const key = JSON.stringify([t.account_id, t.date, Number(t.amount), t.name.trim().toLowerCase()]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }
  const suspicious = [...groups.values()].filter(g => g.length > 1);
  return {
    provider_transactions: provider.length,
    exact_groups: suspicious.length,
    all_ids_still_at_provider: suspicious.filter(g => g.every(t => current.has(t.plaid_transaction_id))).length,
    groups_with_missing_provider_ids: suspicious.filter(g => g.some(t => !current.has(t.plaid_transaction_id))).length,
    confirmed_pending_pairs: pairs,
    missing_provider_ids: local.filter(t => t.plaid_transaction_id && !current.has(t.plaid_transaction_id)).map(t => t.id),
  };
}

export async function bankIntegrity(db: any, itemId: string, decrypt: (token: string) => Promise<string>, request = fetch) {
  if (!/^[0-9a-f-]{36}$/.test(itemId)) throw Error('Invalid connection');
  const item = await db.from('plaid_items').select('*').eq('id', itemId).single();
  if (item.error || !item.data) throw Error('Connection unavailable');
  const accounts = await db.from('accounts').select('id,plaid_account_id').eq('user_id', item.data.user_id);
  if (accounts.error) throw Error('Accounts unavailable');
  const local: any[] = [];
  for (let offset = 0;; offset += 1000) {
    const rows = await db.from('transactions').select('id,account_id,plaid_transaction_id,date,amount,name,pending').eq('user_id', item.data.user_id).order('id').range(offset, offset + 999);
    if (rows.error) throw Error('Transactions unavailable');
    local.push(...rows.data);
    if (rows.data.length < 1000) break;
  }
  const env = Deno.env.get('PLAID_ENV') || 'production';
  if (!['production','sandbox','development'].includes(env)) throw Error('Invalid bank environment');
  const access = await decrypt(item.data.access_token), provider: any[] = [];
  let expected: number | undefined;
  // Cached history only: no refresh, cursor update, database writes, or AI.
  for (let page = 0; page < 20; page++) {
    const response = await request(`https://${env}.plaid.com/transactions/get`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({client_id:Deno.env.get('PLAID_CLIENT_ID'),secret:Deno.env.get('PLAID_SECRET'),access_token:access,start_date:'2000-01-01',end_date:new Date().toISOString().slice(0,10),options:{count:500,offset:provider.length}}),
      signal: AbortSignal.timeout(25000),
    });
    const result = await response.json();
    if (!response.ok || result.error_code || !Array.isArray(result.transactions) || !Number.isInteger(result.total_transactions)) throw Error('Bank comparison unavailable');
    if (expected !== undefined && expected !== result.total_transactions) throw Error('Bank history changed; compare again');
    expected = result.total_transactions;
    provider.push(...result.transactions);
    if (provider.length === expected) {
      if (new Set(provider.map(t => t.transaction_id)).size !== provider.length) throw Error('Bank history changed; compare again');
      const ids = new Set(result.accounts.map((a: any) => a.account_id));
      const ownedAccounts = accounts.data.filter((a: any) => ids.has(a.plaid_account_id));
      return {checked_at:new Date().toISOString(),...compareBankSnapshot(local.filter(t => ownedAccounts.some((a: any) => a.id === t.account_id)),provider,ownedAccounts)};
    }
    if (!result.transactions.length || provider.length > expected) throw Error('Incomplete bank comparison');
  }
  throw Error('Bank history exceeds comparison limit');
}
