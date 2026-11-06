import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    if (message.includes('rate limit')) {
      return 'Too many requests. Please try again later.';
    }
    if (message.includes('network') || message.includes('fetch')) {
      return 'Connection error. Please check your network and try again.';
    }
  }
  
  return 'An error occurred. Please try again later.';
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

    const plaidEnv = Deno.env.get('PLAID_ENV') || 'sandbox';
    const plaidUrl = plaidEnv === 'production' 
      ? 'https://production.plaid.com' 
      : plaidEnv === 'development' 
        ? 'https://development.plaid.com' 
        : 'https://sandbox.plaid.com';

    console.log(`Creating link token for user ${user.id} in ${plaidEnv} environment`);

    const response = await fetch(`${plaidUrl}/link/token/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: Deno.env.get('PLAID_CLIENT_ID'),
        secret: Deno.env.get('PLAID_SECRET'),
        user: { client_user_id: user.id },
        client_name: 'Personal Finance App',
        products: ['transactions'],
        transactions: {
          days_requested: 730, // Request maximum 2 years of transaction history
        },
        country_codes: ['US'],
        language: 'en',
      }),
    });

    const data = await response.json();
    
    if (data.error_code) {
      console.error('Plaid error:', data);
      // Return generic error for Plaid errors
      return new Response(JSON.stringify({ error: 'Unable to connect to bank. Please try again.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Link token created successfully');
    return new Response(JSON.stringify({ link_token: data.link_token }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error creating link token:', error);
    return new Response(JSON.stringify({ error: mapErrorToClient(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
