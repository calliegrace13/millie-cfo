import { disconnectPlaidItem } from "../_shared/plaid-ledger.mjs";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decode as decodeBase64 } from "https://deno.land/std@0.168.0/encoding/base64.ts";

function isAllowedOrigin(origin: string): boolean {
  if (!origin) return false;
  const configuredOrigins = (Deno.env.get('PLAID_ALLOWED_ORIGINS') ?? '').split(',').map(value => value.trim());
  if (configuredOrigins.includes(origin)) return true;
  if (origin.startsWith('http://localhost:')) return true;
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

// Consistent PBKDF2-based decryption (matches plaid-exchange-token and plaid-sync-transactions)
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

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      console.error('Auth error:', authError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { item_id } = await req.json();
    
    if (typeof item_id !== 'string' || !item_id) {
      return new Response(JSON.stringify({ error: 'item_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Deleting Plaid item ${item_id} for user ${user.id}`);

    // Get the Plaid item to retrieve the access token
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: plaidItem, error: fetchError } = await serviceClient
      .from('plaid_items')
      .select('access_token, id, disconnecting')
      .eq('item_id', item_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!plaidItem) {
      console.error('Failed to fetch Plaid item:', fetchError);
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
      console.error('Failed to decrypt token:', error);
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

    const ownership = { p_item: plaidItem.id, p_user: user.id };
    await disconnectPlaidItem({
      staged: plaidItem.disconnecting,
      request: async (path: string) => {
        const response = await fetch(`${plaidUrl}${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ client_id: Deno.env.get('PLAID_CLIENT_ID'),
            secret: Deno.env.get('PLAID_SECRET'), access_token: decryptedToken }),
        });
        const result = await response.json();
        if (!response.ok && !result.error_code) throw new Error(`Plaid HTTP ${response.status}`);
        return result;
      },
      stage: async (accounts: unknown[]) => {
        const { error } = await serviceClient.rpc('stage_plaid_disconnect', { ...ownership, p_accounts: accounts });
        if (error) throw error;
      },
      finish: async () => {
        const { error } = await serviceClient.rpc('finish_plaid_disconnect', ownership);
        if (error) throw error;
      },
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error deleting Plaid item:', error);
    return new Response(JSON.stringify({ error: 'Failed to delete Plaid item' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
