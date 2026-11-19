import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

async function refreshAccessToken(refreshToken: string, clientId: string, clientSecret: string): Promise<{ access_token: string; expires_in: number }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Token refresh failed: ${JSON.stringify(data)}`);
  return data;
}

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

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !SUPABASE_URL || !SERVICE_ROLE_KEY) {
      throw new Error("Missing environment configuration");
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Not authenticated");

    const supabaseUser = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) throw new Error("Not authenticated");

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: tokenRow, error: tokenError } = await supabaseAdmin
      .from("google_calendar_tokens")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (tokenError || !tokenRow) throw new Error("Google Calendar not connected");

    let accessToken = tokenRow.access_token;

    if (new Date(tokenRow.token_expires_at) <= new Date()) {
      const refreshed = await refreshAccessToken(tokenRow.refresh_token, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
      accessToken = refreshed.access_token;
      const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
      await supabaseAdmin.from("google_calendar_tokens").update({
        access_token: accessToken,
        token_expires_at: newExpiry,
      }).eq("user_id", user.id);
    }

    const body = await req.json();
    const { action, timeMin, timeMax, event } = body;

    const calendarId = tokenRow.calendar_id || "primary";
    const baseUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}`;

    if (action === "list") {
      const params = new URLSearchParams({
        timeMin: timeMin || new Date().toISOString(),
        timeMax: timeMax || new Date(Date.now() + 30 * 86400000).toISOString(),
        maxResults: "250",
        singleEvents: "true",
        orderBy: "startTime",
      });

      const res = await fetch(`${baseUrl}/events?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(`Google Calendar API error [${res.status}]: ${JSON.stringify(data)}`);

      const gcalEvents = (data.items || []).map((item: any) => {
        const isAllDay = !!item.start?.date;
        const eventDate = isAllDay ? item.start.date : item.start.dateTime?.split("T")[0];
        const startTime = !isAllDay && item.start?.dateTime
          ? item.start.dateTime.split("T")[1]?.substring(0, 5) + ":00"
          : null;
        const endTime = !isAllDay && item.end?.dateTime
          ? item.end.dateTime.split("T")[1]?.substring(0, 5) + ":00"
          : null;

        return {
          user_id: user.id,
          google_event_id: item.id,
          title: item.summary || "(No title)",
          description: item.description || null,
          event_date: eventDate,
          start_time: startTime,
          end_time: endTime,
          is_all_day: isAllDay,
          color: "#0ea5e9",
        };
      }).filter((e: any) => e.event_date);

      if (gcalEvents.length > 0) {
        await supabaseAdmin
          .from("ceo_calendar_events")
          .delete()
          .eq("user_id", user.id)
          .not("google_event_id", "is", null)
          .gte("event_date", timeMin?.split("T")[0] || new Date().toISOString().split("T")[0])
          .lte("event_date", timeMax?.split("T")[0] || new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0]);

        const { error: insertError } = await supabaseAdmin
          .from("ceo_calendar_events")
          .insert(gcalEvents);

        if (insertError) console.error("Insert error:", insertError);
      }

      await supabaseAdmin.from("google_calendar_tokens").update({
        last_synced_at: new Date().toISOString(),
      }).eq("user_id", user.id);

      return new Response(JSON.stringify({ synced: gcalEvents.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else if (action === "create") {
      if (!event) throw new Error("Missing event data");

      const gcalEvent: any = {
        summary: event.title,
        description: event.description || "",
      };

      if (event.is_all_day) {
        gcalEvent.start = { date: event.event_date };
        gcalEvent.end = { date: event.event_date };
      } else {
        gcalEvent.start = { dateTime: `${event.event_date}T${event.start_time || "09:00"}:00`, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
        gcalEvent.end = { dateTime: `${event.event_date}T${event.end_time || "10:00"}:00`, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
      }

      const res = await fetch(`${baseUrl}/events`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(gcalEvent),
      });

      const created = await res.json();
      if (!res.ok) throw new Error(`Failed to create event [${res.status}]: ${JSON.stringify(created)}`);

      return new Response(JSON.stringify({ googleEventId: created.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else if (action === "status") {
      return new Response(JSON.stringify({ connected: true, lastSynced: tokenRow.last_synced_at }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (e) {
    const isNotConnected = e.message?.includes("not connected");
    return new Response(JSON.stringify({ error: e.message, connected: false }), {
      status: isNotConnected ? 200 : 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

