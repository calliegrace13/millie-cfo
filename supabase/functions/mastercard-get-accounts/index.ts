import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { getCorsHeaders } from "../_shared/cors.ts";

const FINICITY_API_URL = "https://api.finicity.com";

async function getAccessToken(): Promise<string> {
  const partnerId = Deno.env.get("MASTERCARD_PARTNER_ID");
  const partnerSecret = Deno.env.get("MASTERCARD_PARTNER_SECRET");
  const appKey = Deno.env.get("MASTERCARD_APP_KEY");

  if (!partnerId || !partnerSecret || !appKey) {
    throw new Error("Missing Mastercard API credentials");
  }

  const response = await fetch(`${FINICITY_API_URL}/aggregation/v2/partners/authentication`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Finicity-App-Key": appKey,
      "Accept": "application/json",
    },
    body: JSON.stringify({ partnerId, partnerSecret }),
  });

  if (!response.ok) {
    throw new Error(`Failed to authenticate: ${response.status}`);
  }

  const data = await response.json();
  return data.token;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { customerId } = await req.json();
    if (!customerId) {
      return new Response(JSON.stringify({ error: "Missing customerId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const appKey = Deno.env.get("MASTERCARD_APP_KEY")!;
    const accessToken = await getAccessToken();

    console.log("Fetching accounts for customer:", customerId);

    const accountsResponse = await fetch(
      `${FINICITY_API_URL}/aggregation/v1/customers/${customerId}/accounts`,
      {
        headers: {
          "Finicity-App-Key": appKey,
          "Finicity-App-Token": accessToken,
          "Accept": "application/json",
        },
      }
    );

    if (!accountsResponse.ok) {
      const errorText = await accountsResponse.text();
      console.error("Get accounts error:", accountsResponse.status, errorText);
      throw new Error(`Failed to get accounts: ${accountsResponse.status}`);
    }

    const accountsData = await accountsResponse.json();
    const accounts = accountsData.accounts || [];
    console.log("Found", accounts.length, "accounts");

    const typeMap: Record<string, string> = {
      checking: "depository",
      savings: "depository", 
      moneyMarket: "depository",
      cd: "depository",
      creditCard: "credit",
      lineOfCredit: "credit",
      investment: "investment",
      investmentTaxDeferred: "investment",
      mortgage: "loan",
      loan: "loan",
    };

    for (const account of accounts) {
      const accountData = {
        user_id: user.id,
        plaid_account_id: `mc_${account.id}`,
        name: account.name || account.accountNickname || `Account ${account.accountNumberDisplay}`,
        official_name: account.name,
        type: typeMap[account.type] || "depository",
        subtype: account.type,
        mask: account.accountNumberDisplay?.slice(-4),
        current_balance: account.balance ?? 0,
        available_balance: account.availableBalance,
        currency: "USD",
        is_manual: false,
        is_deleted: false,
      };

      const { error: upsertError } = await supabaseAdmin
        .from("accounts")
        .upsert(accountData, { onConflict: "plaid_account_id" });

      if (upsertError) {
        console.error("Error upserting account:", upsertError);
      }
    }

    return new Response(
      JSON.stringify({ success: true, accountCount: accounts.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Mastercard get accounts error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

