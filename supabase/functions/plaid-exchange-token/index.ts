import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as encodeBase64 } from "https://deno.land/std@0.168.0/encoding/base64.ts";

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
    console.error('Encryption failed:', error);
    throw new Error('Failed to encrypt access token');
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

    console.log(`Exchanging token for user ${user.id} - Institution: ${institutionName || 'unknown'}`);

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
      console.error('Plaid exchange error:', exchangeData);
      return new Response(JSON.stringify({ error: 'Unable to connect to bank. Please try again.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { access_token, item_id } = exchangeData;
    
    // Encrypt the access token before storing
    const encryptedToken = await encryptToken(access_token);
    console.log('Access token encrypted successfully');

    // Use service role to store the plaid item
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Store the Plaid item with encrypted token (using validated fields)
    const { data: item, error: insertError } = await supabaseAdmin.from('plaid_items').insert({
      user_id: user.id,
      item_id,
      access_token: encryptedToken,
      institution_id: institutionId || null,
      institution_name: institutionName || null,
    }).select('id').single();

    if (insertError) {
      console.error('Error storing plaid item:', insertError);
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

    if (!accountsResponse.ok || !Array.isArray(accountsData.accounts)) {
      throw new Error('Could not load linked accounts; retry from Sync');
    }
    const { error: accountsError } = await supabaseAdmin.rpc('attach_plaid_accounts', {
      p_item: item.id, p_user: user.id, p_accounts: accountsData.accounts,
    });
    if (accountsError) throw accountsError;

    console.log('Token exchange completed successfully');
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error exchanging token:', error);
    return new Response(JSON.stringify({ error: mapErrorToClient(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
