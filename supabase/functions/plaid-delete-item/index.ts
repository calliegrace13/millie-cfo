import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decode as decodeBase64 } from "https://deno.land/std@0.168.0/encoding/base64.ts";

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

// Consistent PBKDF2-based decryption (matches plaid-exchange-token and plaid-sync-transactions)
async function decryptToken(encryptedToken: string): Promise<string> {
  const encryptionKey = Deno.env.get('TOKEN_ENCRYPTION_KEY');
  
  // If not encrypted (legacy tokens), require encryption key and fail
  if (!encryptedToken.startsWith('enc:')) {
    if (!encryptionKey) {
      throw new Error('TOKEN_ENCRYPTION_KEY must be configured - legacy unencrypted tokens cannot be processed');
    }
    // Log warning about legacy token for monitoring

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

    throw new Error('Failed to decrypt access token');
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

    const { item_id } = await req.json();
    
    if (!item_id) {
      return new Response(JSON.stringify({ error: 'item_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }


    // Get the Plaid item to retrieve the access token
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: plaidItem, error: fetchError } = await serviceClient
      .from('plaid_items')
      .select('access_token, id')
      .eq('item_id', item_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (fetchError || !plaidItem) {

      return new Response(JSON.stringify({ error: 'Plaid item not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Decrypt the access token using consistent PBKDF2-based decryption
    let decryptedToken: string;
    try {
      decryptedToken = await decryptToken(plaidItem.access_token);
    } catch (error) {

      return new Response(
        JSON.stringify({ error: 'Unable to decrypt bank connection. Please re-link your account.' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Call Plaid to remove the item
    const plaidEnv = Deno.env.get('PLAID_ENV') || 'sandbox';
    const plaidUrl = plaidEnv === 'production' 
      ? 'https://production.plaid.com' 
      : plaidEnv === 'development' 
        ? 'https://development.plaid.com' 
        : 'https://sandbox.plaid.com';

    const removeResponse = await fetch(`${plaidUrl}/item/remove`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: Deno.env.get('PLAID_CLIENT_ID'),
        secret: Deno.env.get('PLAID_SECRET'),
        access_token: decryptedToken,
      }),
    });

    const removeData = await removeResponse.json();
    
    if (removeData.error_code) {

      // Continue anyway - item might already be removed from Plaid
    } else {

    }

    // Delete the Plaid item from our database
    const { error: deleteItemError } = await serviceClient
      .from('plaid_items')
      .delete()
      .eq('id', plaidItem.id);

    if (deleteItemError) {

    }

    // Soft-delete associated accounts (keep transaction history)
    const { error: deleteAccountsError } = await serviceClient
      .from('accounts')
      .update({ is_deleted: true, deleted_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .not('plaid_account_id', 'is', null);

    if (deleteAccountsError) {

    }


    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {

    return new Response(JSON.stringify({ error: 'Failed to delete Plaid item' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

