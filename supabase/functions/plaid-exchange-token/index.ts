import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as encodeBase64, decode as decodeBase64 } from "https://deno.land/std@0.168.0/encoding/base64.ts";

// Check if origin is allowed - accepts all Lovable project domains
function isAllowedOrigin(origin: string): boolean {
  const allowed = (Deno.env.get('MILLIE_ALLOWED_ORIGINS') || '').split(',').map(x => x.trim()).filter(Boolean);
  return allowed.includes(origin);
}

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') || '';
  
  return {
    'Access-Control-Allow-Origin': isAllowedOrigin(origin) ? origin : '',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

// Map errors to safe client messages
function mapErrorToClient(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    
    if (message.includes('unauthorized') || message.includes('authentication')) {
      return 'Authentication failed. Please log in again.';
    }
    if (message.includes('token_encryption_key')) {
      return 'Service configuration error. Please contact support.';
    }
    if (message.includes('rate limit')) {
      return 'Too many requests. Please try again later.';
    }
    if (message.includes('network') || message.includes('fetch')) {
      return 'Connection error. Please check your network and try again.';
    }
  }
  
  return 'An error occurred. Please try again later.';
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

// Encrypt access token using AES-GCM
async function encryptToken(token: string): Promise<string> {
  const encryptionKey = Deno.env.get('TOKEN_ENCRYPTION_KEY');
  if (!encryptionKey) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be configured - refusing to store sensitive token unencrypted');
  }

  try {
    // Derive a 256-bit key from the secret
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(encryptionKey),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );
    
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt']
    );

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoder.encode(token)
    );

    // Combine salt + iv + ciphertext and encode as base64
    const combined = new Uint8Array(salt.length + iv.length + new Uint8Array(encrypted).length);
    combined.set(salt, 0);
    combined.set(iv, salt.length);
    combined.set(new Uint8Array(encrypted), salt.length + iv.length);
    
    return 'enc:' + encodeBase64(combined.buffer);
  } catch (error) {

    throw new Error('Failed to encrypt access token');
  }
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') return new Response(JSON.stringify({error:'Method not allowed'}), {status:405, headers:{...corsHeaders,'Content-Type':'application/json'}});
  const requestOrigin = req.headers.get('origin');
  if (requestOrigin && !isAllowedOrigin(requestOrigin)) return new Response(JSON.stringify({error:'Origin not allowed'}), {status:403, headers:{'Content-Type':'application/json'}});
  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {

      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse and validate request body
    let body;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    const { public_token, metadata } = body;
    
    // Validate public_token
    if (!public_token || typeof public_token !== 'string') {
      return new Response(JSON.stringify({ error: 'public_token is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    if (public_token.length > 500) {
      return new Response(JSON.stringify({ error: 'public_token too long' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // Validate metadata if provided
    const institutionId = metadata?.institution?.institution_id;
    const institutionName = metadata?.institution?.name;
    
    if (institutionId && (typeof institutionId !== 'string' || institutionId.length > 100)) {
      return new Response(JSON.stringify({ error: 'Invalid institution_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    if (institutionName && (typeof institutionName !== 'string' || institutionName.length > 200)) {
      return new Response(JSON.stringify({ error: 'Invalid institution name' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const plaidEnv = Deno.env.get('PLAID_ENV') || 'sandbox';
    const plaidUrl = plaidEnv === 'production' 
      ? 'https://production.plaid.com' 
      : plaidEnv === 'development' 
        ? 'https://development.plaid.com' 
        : 'https://sandbox.plaid.com';


    // Exchange public token for access token
    const exchangeResponse = await fetch(`${plaidUrl}/item/public_token/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: Deno.env.get('PLAID_CLIENT_ID'),
        secret: Deno.env.get('PLAID_SECRET'),
        public_token,
      }),
    });

    const exchangeData = await exchangeResponse.json();
    
    if (exchangeData.error_code) {

      return new Response(JSON.stringify({ error: 'Unable to connect to bank. Please try again.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { access_token, item_id } = exchangeData;
    
    // Encrypt the access token before storing
    const encryptedToken = await encryptToken(access_token);


    // Use service role to store the plaid item
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Store the Plaid item with encrypted token (using validated fields)
    const { error: insertError } = await supabaseAdmin.from('plaid_items').insert({
      user_id: user.id,
      item_id,
      access_token: encryptedToken,
      institution_id: institutionId || null,
      institution_name: institutionName || null,
    });

    if (insertError) {

      return new Response(JSON.stringify({ error: 'Failed to store connection' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get accounts from Plaid
    const accountsResponse = await fetch(`${plaidUrl}/accounts/get`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: Deno.env.get('PLAID_CLIENT_ID'),
        secret: Deno.env.get('PLAID_SECRET'),
        access_token,
      }),
    });

    const accountsData = await accountsResponse.json();

    if (accountsData.accounts) {
      // Validate and sanitize account data
      const validAccounts = accountsData.accounts
        .filter((account: any) => {
          if (!account.account_id || typeof account.account_id !== 'string') {

            return false;
          }
          if (!account.name || typeof account.name !== 'string') {

            return false;
          }
          if (!account.type || typeof account.type !== 'string') {

            return false;
          }
          return true;
        });

      const plaidAccountIds = validAccounts.map((a: any) => sanitizeString(a.account_id, 100));
      
      // Check for existing accounts by plaid_account_id (including soft-deleted ones)
      const { data: existingByPlaidId } = await supabaseAdmin
        .from('accounts')
        .select('id, plaid_account_id, is_deleted, name, mask, type')
        .eq('user_id', user.id)
        .in('plaid_account_id', plaidAccountIds);
      
      const plaidIdMap = new Map(
        (existingByPlaidId || []).map(a => [a.plaid_account_id, a])
      );

      const accountsToInsert = [];
      const accountsToRestore: { id: string; [key: string]: any }[] = [];
      const accountsToUpdate: { id: string; [key: string]: any }[] = [];
      
      for (const account of validAccounts) {
        const plaidAccountId = sanitizeString(account.account_id, 100);
        const name = sanitizeString(account.name, 200) || 'Unknown Account';
        const type = sanitizeString(account.type, 50) || 'other';
        const mask = sanitizeString(account.mask, 10);

        // Stable provider IDs retain their existing history.
        const existing = plaidIdMap.get(plaidAccountId) || null;
        // New provider IDs are separate sources until the owner confirms continuity.
        // A matching name / mask is a suggestion, never proof of identity.
        
        const accountData = {
          plaid_account_id: plaidAccountId,
          provider_institution_id: institutionId || null,
          provider_institution_name: institutionName || null,
          name,
          official_name: sanitizeString(account.official_name, 200),
          type,
          subtype: sanitizeString(account.subtype, 50),
          mask,
          current_balance: sanitizeNumber(account.balances?.current),
          available_balance: sanitizeNumber(account.balances?.available),
          currency: sanitizeString(account.balances?.iso_currency_code, 3) || 'USD',
          is_manual: false,
        };
        
        if (existing) {
          if (existing.is_deleted) {
            // Restore the soft-deleted account and update balances + plaid_account_id
            accountsToRestore.push({
              id: existing.id,
              ...accountData,
              is_deleted: false,
              deleted_at: null,
            });
          } else {
            // Account exists and is active - update its plaid_account_id and balances
            accountsToUpdate.push({
              id: existing.id,
              plaid_account_id: plaidAccountId,
              current_balance: accountData.current_balance,
              available_balance: accountData.available_balance,
            });
          }
        } else {
          // New account - insert it
          accountsToInsert.push({
            user_id: user.id,
            ...accountData,
          });
        }
      }
      
      // Insert new accounts
      if (accountsToInsert.length > 0) {
        const { error: accountsError } = await supabaseAdmin.from('accounts').insert(accountsToInsert);
        if (accountsError) {

        } else {

        }
      }
      
      // Restore soft-deleted accounts
      for (const account of accountsToRestore) {
        const { id, ...updateData } = account;
        const { error: updateError } = await supabaseAdmin
          .from('accounts')
          .update(updateData)
          .eq('id', id);
        if (updateError) {

        } else {

        }
      }

      // Update existing active accounts (refresh plaid_account_id + balances)
      for (const account of accountsToUpdate) {
        const { id, ...updateData } = account;
        const { error: updateError } = await supabaseAdmin
          .from('accounts')
          .update(updateData)
          .eq('id', id);
        if (updateError) {

        } else {

        }
      }
      
      if (accountsToRestore.length > 0) {

      }
      if (accountsToUpdate.length > 0) {

      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {

    return new Response(JSON.stringify({ error: mapErrorToClient(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

