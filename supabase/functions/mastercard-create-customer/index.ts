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
    const errorText = await response.text();
    console.error("Finicity auth error:", response.status, errorText);
    throw new Error(`Failed to authenticate with Finicity: ${response.status}`);
  }

  const data = await response.json();
  return data.token;
}

async function createOrGetCustomer(userId: string, accessToken: string): Promise<string> {
  const appKey = Deno.env.get("MASTERCARD_APP_KEY")!;
  
  const searchResponse = await fetch(
    `${FINICITY_API_URL}/aggregation/v1/customers?username=${userId}`,
    {
      headers: {
        "Finicity-App-Key": appKey,
        "Finicity-App-Token": accessToken,
        "Accept": "application/json",
      },
    }
  );

  if (searchResponse.ok) {
    const searchData = await searchResponse.json();
    if (searchData.customers && searchData.customers.length > 0) {
      console.log("Found existing customer:", searchData.customers[0].id);
      return searchData.customers[0].id;
    }
  }

  const createResponse = await fetch(`${FINICITY_API_URL}/aggregation/v2/customers/testing`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Finicity-App-Key": appKey,
      "Finicity-App-Token": accessToken,
      "Accept": "application/json",
    },
    body: JSON.stringify({ username: userId }),
  });

  if (!createResponse.ok) {
    const errorText = await createResponse.text();
    console.error("Create customer error:", createResponse.status, errorText);
    throw new Error(`Failed to create customer: ${createResponse.status}`);
  }

  const customerData = await createResponse.json();
  console.log("Created new customer:", customerData.id);
  return customerData.id;
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
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Getting Mastercard access token for user:", user.id);
    const accessToken = await getAccessToken();
    
    console.log("Creating/getting Finicity customer");
    const customerId = await createOrGetCustomer(user.id, accessToken);

    return new Response(
      JSON.stringify({ customerId, accessToken }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Mastercard create customer error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

