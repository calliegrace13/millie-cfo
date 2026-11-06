import { syncPlaidItem } from "../_shared/plaid-ledger.mjs";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decode as decodeBase64 } from "https://deno.land/std@0.168.0/encoding/base64.ts";

// Check if origin is allowed - accepts all Lovable project domains
function isAllowedOrigin(origin: string): boolean {
  if (!origin) return false;
  const configuredOrigins = (Deno.env.get('PLAID_ALLOWED_ORIGINS') ?? '').split(',').map(value => value.trim());
  if (configuredOrigins.includes(origin)) return true;
  
  // Allow localhost for development
  if (origin.startsWith('http://localhost:')) return true;
  
  // Allow all Lovable project domains (both preview and production)
  if (origin.endsWith('.lovableproject.com')) return true;
  if (origin.endsWith('.lovable.app')) return true;
  
  return false;
}

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') || '';
  
  return {
    'Access-Control-Allow-Origin': isAllowedOrigin(origin) ? origin : '',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Credentials': 'true',
  };
}

// Validate and sanitize string input
function sanitizeString(value: unknown, maxLength: number): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return null;
  return value.trim().slice(0, maxLength);
}

// Validate numeric input
function sanitizeNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

// Validate date format (YYYY-MM-DD)
function sanitizeDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return null;
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(value)) return null;
  // Verify it's a valid date
  const date = new Date(value);
  if (isNaN(date.getTime())) return null;
  return value;
}

// Decrypt access token using AES-GCM
async function decryptToken(encryptedToken: string): Promise<string> {
  const encryptionKey = Deno.env.get('TOKEN_ENCRYPTION_KEY');
  
  // If not encrypted (legacy tokens), require encryption key and fail
  if (!encryptedToken.startsWith('enc:')) {
    if (!encryptionKey) {
      throw new Error('TOKEN_ENCRYPTION_KEY must be configured - legacy unencrypted tokens cannot be processed');
    }
    // Log warning about legacy token for monitoring
    console.warn('Legacy unencrypted token detected - should be migrated to encrypted format');
    return encryptedToken;
  }

  if (!encryptionKey) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be configured - cannot decrypt encrypted token');
  }

  try {
    const combined = decodeBase64(encryptedToken.slice(4)); // Remove 'enc:' prefix
    
    const salt = combined.slice(0, 16);
    const iv = combined.slice(16, 28);
    const ciphertext = combined.slice(28);

    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(encryptionKey),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );
    
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );

    return new TextDecoder().decode(decrypted);
  } catch (error) {
    console.error('Decryption failed:', error);
    throw new Error('Failed to decrypt access token');
  }
}

// Map Plaid personal_finance_category to app categories
// For TRANSFER_IN/TRANSFER_OUT, only categorize as "Transfer" if the transaction name contains "transfer"
// (e.g. "Standard transfer" for Venmo→bank moves). P2P payments should keep their natural category.
function mapPlaidCategory(plaidCategory: string | undefined, txName?: string): string {
  if (!plaidCategory) return 'Other';
  
  if (plaidCategory === 'TRANSFER_IN' || plaidCategory === 'TRANSFER_OUT') {
    const nameLower = (txName || '').toLowerCase();
    if (nameLower.includes('transfer')) {
      return 'Transfer';
    }
    return 'Other';
  }
  
  const mapping: Record<string, string> = {
    'FOOD_AND_DRINK': 'Food & Dining',
    'GENERAL_MERCHANDISE': 'Shopping',
    'GENERAL_SERVICES': 'Shopping',
    'TRANSPORTATION': 'Transportation',
    'TRAVEL': 'Travel',
    'RENT_AND_UTILITIES': 'Bills & Utilities',
    'HOME_IMPROVEMENT': 'Bills & Utilities',
    'MEDICAL': 'Healthcare',
    'ENTERTAINMENT': 'Entertainment',
    'RECREATION': 'Entertainment',
    'PERSONAL_CARE': 'Healthcare',
    'INCOME': 'Income',
    'LOAN_PAYMENTS': 'Bills & Utilities',
    'BANK_FEES': 'Bills & Utilities',
    'GOVERNMENT_AND_NON_PROFIT': 'Other',
  };
  
  return mapping[plaidCategory] || 'Other';
}

// Transaction rule type
interface TransactionRule {
  id: string;
  match_text: string;
  match_type: 'contains' | 'starts_with' | 'exact';
  category: string | null;
  cash_flow_type: string | null;
  is_one_time_expense: boolean;
  amortize_months: number | null;
  amortize_type: string | null;
  priority: number;
}

// Apply rules to a transaction and return updates
function applyRules(
  name: string, 
  merchantName: string | null, 
  rules: TransactionRule[]
): Record<string, unknown> {
  const txText = `${name} ${merchantName || ''}`.toLowerCase();
  
  for (const rule of rules) {
    // Split match_text by comma to support multiple phrases
    const phrases = rule.match_text.split(',').map(p => p.trim()).filter(p => p.length > 0);
    
    let matches = false;
    for (const phrase of phrases) {
      switch (rule.match_type) {
        case 'contains':
          matches = txText.includes(phrase);
          break;
        case 'starts_with':
          matches = txText.startsWith(phrase);
          break;
        case 'exact':
          matches = txText.trim() === phrase;
          break;
      }
      if (matches) break; // Stop at first matching phrase
    }

    if (matches) {
      const updates: Record<string, unknown> = {};
      if (rule.category) updates.category = rule.category;
      if (rule.cash_flow_type) updates.cash_flow_type = rule.cash_flow_type;
      if (rule.is_one_time_expense) updates.is_one_time_expense = true;
      return updates;
    }
  }
  
  return {};
}

// Validate a transaction from Plaid
interface ValidatedTransaction {
  transaction_id: string;
  pending_transaction_id: string | null;
  account_id: string;
  name: string;
  merchant_name: string | null;
  amount: number;
  date: string;
  pending: boolean;
  category: string;
  plaid_primary_category: string | null;
  subcategory: string | null;
}

function validateTransaction(tx: any): ValidatedTransaction | null {
  // Required fields
  const transactionId = sanitizeString(tx.transaction_id, 100);
  const accountId = sanitizeString(tx.account_id, 100);
  const name = sanitizeString(tx.name, 500);
  const amount = sanitizeNumber(tx.amount);
  const date = sanitizeDate(tx.date);
  
  if (!transactionId || !accountId || !name || amount === null || !date) {
    console.warn('Skipping invalid transaction:', {
      hasTransactionId: !!transactionId,
      hasAccountId: !!accountId,
      hasName: !!name,
      hasAmount: amount !== null,
      hasDate: !!date,
    });
    return null;
  }
  
  return {
    transaction_id: transactionId,
    pending_transaction_id: sanitizeString(tx.pending_transaction_id, 100),
    account_id: accountId,
    name,
    merchant_name: sanitizeString(tx.merchant_name, 500),
    amount,
    date,
    pending: typeof tx.pending === 'boolean' ? tx.pending : false,
    category: mapPlaidCategory(tx.personal_finance_category?.primary, name || undefined),
    plaid_primary_category: sanitizeString(tx.personal_finance_category?.primary, 100),
    subcategory: sanitizeString(tx.personal_finance_category?.detailed || tx.category?.[1], 200),
  };
}

serve(async (req) => {
  const headers = { ...getCorsHeaders(req), 'Content-Type': 'application/json' };
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  try {
    const url = Deno.env.get('SUPABASE_URL') ?? '';
    const client = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError || !user) return json({ error: 'Unauthorized' }, 401);

    const body = req.method === 'POST' && req.body ? await req.json().catch(() => null) : {};
    if (!body || typeof body !== 'object') return json({ error: 'Invalid request' }, 400);
    const start = sanitizeDate(body.start_date);
    const end = sanitizeDate(body.end_date);
    if ((body.start_date != null || body.end_date != null) && (!start || !end || start > end)) {
      return json({ error: 'Invalid sync date range' }, 400);
    }
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const { data: items, error: itemsError } = await admin.from('plaid_items').select('*').eq('user_id', user.id);
    if (itemsError) throw itemsError;
    const { data: rules, error: rulesError } = await admin.from('transaction_rules')
      .select('id, match_text, match_type, category, cash_flow_type, is_one_time_expense, amortize_months, amortize_type, priority')
      .eq('user_id', user.id).eq('is_active', true).order('priority', { ascending: false });
    if (rulesError) throw rulesError;

    const env = Deno.env.get('PLAID_ENV') || 'sandbox';
    if (!['sandbox', 'production', 'development'].includes(env)) throw new Error('Invalid Plaid environment');

    let synced = 0;
    const results = [];
    for (const item of items ?? []) {
      try {
        if (item.disconnecting) throw new Error('Disconnection in progress');
        const token = await decryptToken(item.access_token);
        const count = await syncPlaidItem({
          cursor: item.cursor,
          historical: start && end ? { start_date: start, end_date: end } : null,
          request: async (path: string, params: Record<string, unknown>) => {
            const response = await fetch(`https://${env}.plaid.com${path}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ client_id: Deno.env.get('PLAID_CLIENT_ID'),
                secret: Deno.env.get('PLAID_SECRET'), access_token: token, ...params }),
            });
            const data = await response.json();
            if (!response.ok && !data.error_code) throw new Error(`Plaid HTTP ${response.status}`);
            return data;
          },
          prepare: (update: { added: unknown[]; modified: unknown[]; removed: {transaction_id?: unknown}[]; cursor: string | null }, accounts: unknown[]) => {
            const normalize = (raw: unknown) => {
              const tx = validateTransaction(raw);
              if (!tx) throw new Error('Invalid Plaid transaction');
              const changes = applyRules(tx.name, tx.merchant_name, (rules ?? []) as TransactionRule[]);
              return { ...tx, ...changes };
            };
            const removed = update.removed.map(row => {
              const id = sanitizeString(row.transaction_id, 100);
              if (!id) throw new Error('Invalid removed Plaid transaction');
              return id;
            });
            return {
              p_item: item.id, p_user: user.id, p_expected_cursor: item.cursor,
              p_next_cursor: update.cursor, p_accounts: accounts,
              p_added: update.added.map(normalize), p_modified: update.modified.map(normalize),
              p_removed: removed,
            };
          },
          commit: async (params: Record<string, unknown>) => {
            const { data, error } = await admin.rpc('apply_plaid_sync', params);
            if (error) throw error;
            return Number(data);
          },
        });
        synced += count;
        results.push({ institution: item.institution_name, status: 'ok', synced: count });
      } catch (error) {
        const code = error instanceof Error ? error.message : (error as { code?: string })?.code;
        console.error('Plaid sync failed for item', item.id, code);
        results.push({ institution: item.institution_name, status: 'failed',
          reason: code === 'ITEM_LOGIN_REQUIRED' ? 'Bank needs reconnection' : 'Sync failed; retry later' });
      }
    }
    return json({ synced, results, failed: results.filter(r => r.status === 'failed').length });
  } catch (error) {
    console.error('Could not start Plaid sync', (error as { code?: string })?.code);
    return json({ error: 'Could not start bank sync' }, 500);
  }
});
