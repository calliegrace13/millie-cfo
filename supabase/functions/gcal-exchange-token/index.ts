import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CALENDAR_CLIENT_ID");
    const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CALENDAR_CLIENT_SECRET");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!GOOGLE_CLIENT_ID) throw new Error("GOOGLE_CALENDAR_CLIENT_ID not configured");
    if (!GOOGLE_CLIENT_SECRET) throw new Error("GOOGLE_CALENDAR_CLIENT_SECRET not configured");
    if (!SUPABASE_URL) throw new Error("SUPABASE_URL not configured");
    if (!SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY not configured");

    // Authenticate the user from the Authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Not authenticated");

    const supabaseUser = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) throw new Error("Not authenticated");

    // Only extract code and redirectUri - userId comes from authenticated session
    const { code, redirectUri } = await req.json();
    if (!code || !redirectUri) throw new Error("Missing code or redirectUri");

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) throw new Error("Token exchange failed");

    const { access_token, refresh_token, expires_in } = tokenData;
    if (!access_token || !refresh_token) throw new Error("Missing tokens from Google response");

    const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { error: upsertError } = await supabaseAdmin
      .from("google_calendar_tokens")
      .upsert({
        user_id: user.id,  // Use authenticated user ID, not client input
        access_token,
        refresh_token,
        token_expires_at: expiresAt,
      }, { onConflict: "user_id" });

    if (upsertError) throw new Error("Failed to store tokens");

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: "Authentication or token exchange failed" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
