import { protectAIKey } from './ai-vault.ts';

// Called only after finance-maintenance verifies the server scheduler credential.
// Credentials and provider response bodies never leave this function.
export async function integrationHealth(db, owner: string, env = (name: string) => Deno.env.get(name) || '', request = fetch) {
  if (!/^[0-9a-f-]{36}$/.test(owner)) throw Error('Invalid owner');
  const settings = await db.from('finance_ai_settings').select('active_provider').eq('owner_id', owner).maybeSingle();
  const saved = await db.from('finance_ai_connections').select('provider,model,credential').eq('owner_id', owner);
  const email = await db.from('finance_email_connections').select('credential,mailbox,last_synced_at').eq('owner_id', owner).maybeSingle();
  if (settings.error || saved.error || email.error) throw Error('Integration settings unavailable');
  const result: Record<string, unknown> = { checked_at: new Date().toISOString() };
  // Only public routing configuration is returned through the scheduler-authenticated check.
  // Never expose arbitrary environment variables or credentials.
  result.hosting = {
    allowed_origins: env('MILLIE_ALLOWED_ORIGINS').split(',').map(value => value.trim()).filter(Boolean),
    gmail_app_origin: env('GMAIL_APP_ORIGIN') || 'https://millie-cfo-callie.calliegrace13.chatgpt.site',
  };
  const connection = (saved.data || []).find(row => row.provider === settings.data?.active_provider);
  if (!connection) {
    result.ai = { ok: false, reason: 'not_connected' };
  } else {
    try {
      if (!['openai', 'anthropic'].includes(connection.provider)) throw Error('Unsupported provider');
      const key = await protectAIKey(env('AI_CREDENTIAL_ENCRYPTION_KEY'), connection.credential, owner, connection.provider, true);
      const anthropic = connection.provider === 'anthropic';
      const response = await request(anthropic ? 'https://api.anthropic.com/v1/models' : 'https://api.openai.com/v1/models', {
        headers: anthropic ? { 'x-api-key': key, 'anthropic-version': '2023-06-01' } : { Authorization: 'Bearer ' + key },
        signal: AbortSignal.timeout(15000),
      });
      const models = response.ok ? await response.json() : null;
      const available = models?.data?.some(model => model.id === connection.model) === true;
      result.ai = { ok: response.ok && available, provider: connection.provider, model: connection.model, credentials_accepted: response.ok, model_available: available, http_status: response.status };
    } catch {
      result.ai = { ok: false, reason: 'credential_or_provider_check_failed' };
    }
  }
  if (!email.data) {
    result.gmail = { ok: false, reason: 'not_connected' };
  } else {
    try {
      if (!env('GOOGLE_GMAIL_CLIENT_ID') || !env('GOOGLE_GMAIL_CLIENT_SECRET')) throw Error('Missing Gmail configuration');
      const refreshToken = await protectAIKey(env('AI_CREDENTIAL_ENCRYPTION_KEY'), email.data.credential, owner, 'email:gmail', true);
      const response = await request('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: env('GOOGLE_GMAIL_CLIENT_ID'), client_secret: env('GOOGLE_GMAIL_CLIENT_SECRET'), refresh_token: refreshToken, grant_type: 'refresh_token' }),
        signal: AbortSignal.timeout(15000),
      });
      const tokens = await response.json();
      if (!response.ok || !tokens.access_token) {
        const allowed = ['invalid_grant', 'invalid_client', 'unauthorized_client', 'redirect_uri_mismatch', 'access_denied'];
        result.gmail = { ok: false, reason: allowed.includes(tokens.error) ? tokens.error : 'authorization_failed', http_status: response.status };
      } else {
        const profile = await request('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
          headers: { Authorization: 'Bearer ' + tokens.access_token },
          signal: AbortSignal.timeout(15000),
        });
        const data = profile.ok ? await profile.json() : null;
        const matches = typeof data?.emailAddress === 'string' && data.emailAddress.toLowerCase() === email.data.mailbox.toLowerCase();
        result.gmail = { ok: profile.ok && matches, mailbox_matches: matches, http_status: profile.status, last_synced_at: email.data.last_synced_at };
      }
    } catch {
      result.gmail = { ok: false, reason: 'credential_or_provider_check_failed' };
    }
  }
  return result;
}
