import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Check if origin is allowed - accepts all Lovable project domains
function isAllowedOrigin(origin: string): boolean {
  if (!origin) return false;
  
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
    if (message.includes('database') || message.includes('query')) {
      return 'Unable to save data. Please try again.';
    }
    if (message.includes('network') || message.includes('fetch')) {
      return 'Connection error. Please check your network and try again.';
    }
  }
  
  return 'An error occurred. Please try again later.';
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Verify the caller is authenticated
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401,
        }
      );
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      console.error('Authentication failed:', authError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401,
        }
      );
    }

    console.log(`Authenticated user ${user.id} triggered balance sheet snapshot`);

    // Use service role for data operations (but only process the authenticated user's data)
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const snapshotDate = new Date().toISOString().split('T')[0];

    // Fetch accounts for the authenticated user only
    const { data: accounts, error: accountsError } = await supabase
      .from('accounts')
      .select('*')
      .eq('user_id', user.id)
      .or('is_deleted.is.null,is_deleted.eq.false');

    if (accountsError) {
      console.error(`Error fetching accounts for user ${user.id}:`, accountsError);
      throw accountsError;
    }

    // Fetch assets for the authenticated user only
    const { data: assets, error: assetsError } = await supabase
      .from('assets')
      .select('*')
      .eq('user_id', user.id);

    if (assetsError) {
      console.error(`Error fetching assets for user ${user.id}:`, assetsError);
      throw assetsError;
    }

    // Calculate balance sheet values
    let currentAssets = 0;
    let fixedAssets = 0;
    let currentLiabilities = 0;
    let longTermLiabilities = 0;

    // Process accounts
    for (const account of accounts || []) {
      const balance = account.current_balance || 0;
      
      const type = (account.type || '').toLowerCase();

      if (type === 'depository' || type === 'checking' || type === 'savings') {
        currentAssets += balance;
      } else if (type === 'investment') {
        fixedAssets += balance;
      } else if (type === 'credit') {
        currentLiabilities += Math.abs(balance);
      } else if (type === 'loan') {
        longTermLiabilities += Math.abs(balance);
      } else {
        // Fallback: treat positive balances as assets and negative balances as liabilities
        if (balance >= 0) currentAssets += balance;
        else currentLiabilities += Math.abs(balance);
      }
    }

    // Process manual assets
    for (const asset of assets || []) {
      if (asset.is_liability) {
        longTermLiabilities += asset.value;
      } else if (asset.type === 'cash') {
        currentAssets += asset.value;
      } else {
        fixedAssets += asset.value;
      }
    }

    const totalAssets = currentAssets + fixedAssets;
    const totalLiabilities = currentLiabilities + longTermLiabilities;
    const totalEquity = totalAssets - totalLiabilities;

    // Skip if user has no data
    if (totalAssets === 0 && totalLiabilities === 0) {
      console.log(`User ${user.id} has no balance sheet data`);
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No balance sheet data to snapshot',
          date: snapshotDate,
          user_id: user.id,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    // Upsert the snapshot for the authenticated user only
    const { error: upsertError } = await supabase
      .from('balance_sheet_snapshots')
      .upsert({
        user_id: user.id,
        snapshot_date: snapshotDate,
        total_assets: totalAssets,
        current_assets: currentAssets,
        fixed_assets: fixedAssets,
        total_liabilities: totalLiabilities,
        current_liabilities: currentLiabilities,
        long_term_liabilities: longTermLiabilities,
        total_equity: totalEquity,
      }, {
        onConflict: 'user_id,snapshot_date',
      });

    if (upsertError) {
      console.error(`Error saving snapshot for user ${user.id}:`, upsertError);
      throw upsertError;
    }

    console.log(`Saved snapshot for user ${user.id}: assets=${totalAssets}, liabilities=${totalLiabilities}, equity=${totalEquity}`);

    return new Response(
      JSON.stringify({
        success: true,
        date: snapshotDate,
        user_id: user.id,
        total_assets: totalAssets,
        total_liabilities: totalLiabilities,
        total_equity: totalEquity,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error in snapshot-balance-sheet:', error);
    return new Response(
      JSON.stringify({ error: mapErrorToClient(error) }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
