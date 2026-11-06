import test from 'node:test';
import assert from 'node:assert/strict';
import { collectPlaidUpdate, disconnectPlaidItem, syncPlaidItem } from '../functions/_shared/plaid-ledger.mjs';

const page = (cursor, has_more, added = []) => ({ next_cursor: cursor, has_more, added, modified: [], removed: [] });

test('mutation restarts from the original cursor and discards partial results', async () => {
  const cursors = [];
  const responses = [page('partial', true, ['discard']), {error_code: 'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION'},
    page('complete', false, ['keep'])];
  const result = await collectPlaidUpdate(async (_path, {cursor}) => {
    cursors.push(cursor);
    return responses.shift();
  }, 'start');
  assert.deepEqual(cursors, ['start', 'partial', 'start']);
  assert.deepEqual(result.added, ['keep']);
  assert.equal(result.cursor, 'complete');
});

test('a late provider error never invokes the database commit', async () => {
  let calls = 0;
  await assert.rejects(syncPlaidItem({
    cursor: 'start',
    request: async () => ++calls === 1 ? page('partial', true, ['discard']) : {error_code: 'ITEM_LOGIN_REQUIRED'},
    prepare: () => assert.fail('must not prepare a partial sync'),
    commit: () => assert.fail('must not commit a partial sync'),
  }), /ITEM_LOGIN_REQUIRED/);
});

test('database errors are propagated and retry uses the saved cursor', async () => {
  const cursors = [];
  let fail = true;
  const run = () => syncPlaidItem({
    cursor: 'saved',
    request: async (path, args) => {
      if (path === '/accounts/balance/get') return {accounts: []};
      cursors.push(args.cursor);
      return page('next', false);
    },
    prepare: update => update,
    commit: async update => {
      if (fail) throw new Error('write failed');
      return update.cursor;
    },
  });
  await assert.rejects(run(), /write failed/);
  fail = false;
  assert.equal(await run(), 'next');
  assert.deepEqual(cursors, ['saved', 'saved']);
});

test('disconnection stages exact account IDs before removal and stops on provider failure', async () => {
  const calls = [];
  await assert.rejects(disconnectPlaidItem({
    request: async path => {
      calls.push(path);
      return path === '/accounts/get' ? {accounts: [{account_id: 'bank-a'}]} : {error_code: 'INTERNAL_SERVER_ERROR'};
    },
    stage: async accounts => calls.push(accounts.map(account => account.account_id)),
    finish: () => assert.fail('must not archive after failure'),
  }), /INTERNAL_SERVER_ERROR/);
  assert.deepEqual(calls, ['/accounts/get', ['bank-a'], '/item/remove']);
});

test('an already revoked staged connection can finish after a failed local write', async () => {
  let finished = false;
  await disconnectPlaidItem({
    staged: true,
    request: async path => {
      assert.equal(path, '/item/remove');
      return {error_code: 'ITEM_NOT_FOUND'};
    },
    stage: () => assert.fail('must reuse saved ownership'),
    finish: async () => { finished = true; },
  });
  assert.equal(finished, true);
});
