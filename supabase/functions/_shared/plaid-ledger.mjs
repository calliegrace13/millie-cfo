// Collect a complete Plaid update before changing the ledger or its cursor.
export async function collectPlaidUpdate(request, originalCursor, pause = (ms) => new Promise(resolve => setTimeout(resolve, ms))) {
  for (let restart = 0; restart < 3; restart++) {
    let cursor = originalCursor;
    const changes = { added: [], modified: [], removed: [] };
    for (let page = 0; page < 100; page++) {
      let result;
      for (let retry = 0; retry <= 3; retry++) {
        result = await request('/transactions/sync', { cursor: cursor ?? undefined, count: 500 });
        if (result.error_code !== 'PRODUCT_NOT_READY' || retry === 3) break;
        await pause(500 * (retry + 1));
      }
      if (result.error_code === 'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION') break;
      if (result.error_code) throw new Error(result.error_code);
      if (typeof result.next_cursor !== 'string' || !result.next_cursor ||
          typeof result.has_more !== 'boolean' || (result.has_more && result.next_cursor === cursor)) {
        throw new Error('Invalid Plaid sync cursor');
      }
      for (const key of ['added', 'modified', 'removed']) {
        if (!Array.isArray(result[key])) throw new Error('Invalid Plaid transaction changes');
        for (const entry of result[key]) changes[key].push(entry);
      }
      cursor = result.next_cursor;
      if (!result.has_more) return { ...changes, cursor };
      if (page === 99) throw new Error('Plaid sync page limit exceeded');
    }
  }
  throw new Error('Plaid transactions changed repeatedly during sync');
}

export async function syncPlaidItem({ request, cursor, historical, prepare, commit }) {
  let update;
  if (historical) {
    const added = [];
    for (let page = 0; ; page++) {
      const result = await request('/transactions/get', { ...historical, options: { count: 500, offset: added.length } });
      if (result.error_code) throw new Error(result.error_code);
      if (!Array.isArray(result.transactions) || !Number.isInteger(result.total_transactions)) {
        throw new Error('Invalid Plaid historical response');
      }
      for (const entry of result.transactions) added.push(entry);
      if (added.length >= result.total_transactions) break;
      if (!result.transactions.length || page === 99) throw new Error('Incomplete Plaid history');
    }
    update = { added, modified: [], removed: [], cursor: null };
  } else {
    update = await collectPlaidUpdate(request, cursor);
  }

  const balances = await request('/accounts/balance/get', {});
  if (balances.error_code) throw new Error(balances.error_code);
  if (!Array.isArray(balances.accounts)) throw new Error('Invalid Plaid accounts response');
  // This callback is the single database transaction, including the cursor.
  return await commit(prepare(update, balances.accounts));
}

export async function disconnectPlaidItem({ request, stage, finish, staged }) {
  if (!staged) {
    const result = await request('/accounts/get', {});
    if (result.error_code) throw new Error(result.error_code);
    if (!Array.isArray(result.accounts)) throw new Error('Invalid Plaid accounts response');
    await stage(result.accounts);
  }
  const result = await request('/item/remove', {});
  if (result.error_code && result.error_code !== 'ITEM_NOT_FOUND') throw new Error(result.error_code);
  await finish();
}
