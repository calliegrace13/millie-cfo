import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { getCorsHeaders } from "../_shared/cors.ts";

const FINICITY_API_URL = "https://api.finicity.com";

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

    const { customerId, accessToken } = await req.json();
    if (!customerId || !accessToken) {
      return new Response(JSON.stringify({ error: "Missing customerId or accessToken" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const appKey = Deno.env.get("MASTERCARD_APP_KEY");
    if (!appKey) {
      throw new Error("Missing MASTERCARD_APP_KEY");
    }

    const origin = Deno.env.get("MASTERCARD_APP_ORIGIN") || req.headers.get("origin");
    if (!origin) {
      return new Response(JSON.stringify({ error: "Missing application origin" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const redirectUri = new URL("/accounts", origin).toString();

    console.log("Generating Connect URL for customer:", customerId, "redirect:", redirectUri);

    const requestBody = {
      partnerId: Deno.env.get("MASTERCARD_PARTNER_ID"),
      customerId,
      redirectUri,
      webhook: `${Deno.env.get("SUPABASE_URL")}/functions/v1/mastercard-webhook`,
      webhookContentType: "application/json",
      singleUseUrl: true,
    };

    console.log("Request body:", JSON.stringify(requestBody, null, 2));

    const response = await fetch(`${FINICITY_API_URL}/connect/v2/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Finicity-App-Key": appKey,
        "Finicity-App-Token": accessToken,
        "Accept": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Generate Connect URL error:", response.status, errorText);
      throw new Error(`Failed to generate Connect URL: ${response.status}`);
    }

    const data = await response.json();
    console.log("Connect URL generated successfully");

    return new Response(
      JSON.stringify({ connectUrl: data.link }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Mastercard generate URL error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
