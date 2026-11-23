import assert from 'node:assert/strict';
import { edgeModule } from './helpers/edge-module.mjs';
const { integrationHealth } = await import(edgeModule('_shared/integration-health.ts'));
const { protectAIKey } = await import(edgeModule('_shared/ai-vault.ts'));
const owner = '11111111-1111-4111-8111-111111111111';
const encryption = Buffer.alloc(32, 7).toString('base64');
const providerKey = 'synthetic-provider-key-do-not-disclose';
const gmailToken = 'synthetic-refresh-token-do-not-disclose';
const records = {
  finance_ai_settings: { active_provider: 'anthropic' },
  finance_ai_connections: [{ provider: 'anthropic', model: 'test-model', credential: await protectAIKey(encryption, providerKey, owner, 'anthropic') }],
  finance_email_connections: { mailbox: 'test@example.test', credential: await protectAIKey(encryption, gmailToken, owner, 'email:gmail') },
};
const db = { from(table) {
  const query = { select() { return query; }, eq() { return query; }, maybeSingle() { return Promise.resolve({ data: records[table] }); }, then(resolve) { return Promise.resolve({ data: records[table] }).then(resolve); } };
  return query;
} };
const env = name => ({ AI_CREDENTIAL_ENCRYPTION_KEY: encryption, MILLIE_ALLOWED_ORIGINS: 'https://old.example, https://new.example', GMAIL_APP_ORIGIN: 'https://new.example' }[name] || 'synthetic-client-value');
let invalidGrant = false;
const network = async url => {
  if (url.includes('anthropic')) return Response.json({ data: [{ id: 'test-model' }] });
  if (url.includes('oauth2')) return invalidGrant ? Response.json({ error: 'invalid_grant', error_description: gmailToken }, { status: 400 }) : Response.json({ access_token: 'synthetic-access-token' });
  return Response.json({ emailAddress: 'test@example.test' });
};
const good = await integrationHealth(db, owner, env, network);
assert.equal(good.ai.ok, true);
assert.equal(good.gmail.ok, true);
assert.deepEqual(good.hosting.allowed_origins, ['https://old.example', 'https://new.example']);
assert.equal(good.hosting.gmail_app_origin, 'https://new.example');
invalidGrant = true;
const bad = await integrationHealth(db, owner, env, network);
assert.equal(bad.gmail.reason, 'invalid_grant');
assert(!JSON.stringify(bad).includes(gmailToken));
assert(!JSON.stringify(good).includes(providerKey));
await assert.rejects(integrationHealth(db, 'invalid-owner', env, network));
console.log('PASS integration checks: provider/model, Gmail refresh, website routing configuration, owner validation, and secret redaction. All network responses are synthetic.');
