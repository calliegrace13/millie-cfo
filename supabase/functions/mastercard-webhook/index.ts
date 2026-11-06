import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate webhook using existing partner secret
    const webhookSecret = Deno.env.get("MASTERCARD_PARTNER_SECRET");
    const providedSecret = req.headers.get("x-webhook-secret") || req.headers.get("X-Webhook-Secret");
    if (!webhookSecret || !providedSecret || providedSecret !== webhookSecret) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    console.log("Mastercard webhook received:", JSON.stringify(body, null, 2));

    const eventType = body.eventType;
    
    switch (eventType) {
      case "added":
        console.log("Account added event - accounts will be fetched after Connect completes");
        break;
      case "deleted":
        console.log("Account deleted event");
        break;
      case "institutionLoginChanged":
        console.log("Institution login changed - may need reconnection");
        break;
      default:
        console.log("Unknown event type:", eventType);
    }

    return new Response(
      JSON.stringify({ received: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Mastercard webhook error:", error);
    return new Response(
      JSON.stringify({ error: "Webhook processing failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
