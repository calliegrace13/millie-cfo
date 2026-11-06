import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';

const VALID_CATEGORIES = new Set([
  'Produce', 'Meat & Seafood', 'Dairy', 'Bakery', 'Pantry', 'Frozen', 'Beverages', 'Other'
]);

function sanitizeString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  return value.replace(/<[^>]*>/g, '').trim().slice(0, maxLength) || null;
}

function sanitizeNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0 || num > 100000) return null;
  return num;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate webhook via secret
    const webhookSecret = Deno.env.get('ZAPIER_WEBHOOK_SECRET');
    if (!webhookSecret) {
      console.error('ZAPIER_WEBHOOK_SECRET not configured');
      return new Response(
        JSON.stringify({ error: 'Webhook not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const providedSecret = req.headers.get('x-webhook-secret') || req.headers.get('X-Webhook-Secret');
    if (!providedSecret || providedSecret !== webhookSecret) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();

    const userId = body.user_id;
    const receiptText = body.email_body || body.receipt_text || body.body || '';

    if (!userId || typeof userId !== 'string') {
      return new Response(
        JSON.stringify({ error: 'user_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(userId)) {
      return new Response(
        JSON.stringify({ error: 'Invalid user_id format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!receiptText.trim()) {
      return new Response(
        JSON.stringify({ error: 'No receipt text provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user exists
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: userProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .single();

    if (!userProfile) {
      return new Response(
        JSON.stringify({ error: 'Invalid user_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse using AI
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'AI not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const trimmedReceipt = receiptText.trim().slice(0, 50000);

    const prompt = `You are a grocery receipt parser. Extract grocery items from the following email receipt text.

Return a JSON array of items with these fields:
- name: string (clean product name, no prices or codes)
- quantity: number or null
- unit: string or null (e.g. "lb", "oz", "ct", "gal")
- category: string (one of: "Produce", "Meat & Seafood", "Dairy", "Bakery", "Pantry", "Frozen", "Beverages", "Other")

Rules:
- Remove store codes, SKUs, tax lines, HTML tags
- Normalize product names (e.g. "ORG BANANAS" -> "Organic Bananas")
- Skip non-food items unless household essentials
- Skip subtotals, totals, tax, discounts, delivery fees
- Return ONLY a JSON array, no other text

Receipt text:
${trimmedReceipt}`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
      }),
    });

    if (!aiResponse.ok) {
      console.error('AI API error:', await aiResponse.text());
      return new Response(
        JSON.stringify({ error: 'AI parsing failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || '[]';

    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    let rawItems: any[];
    try {
      rawItems = JSON.parse(jsonStr);
    } catch {
      console.error('Failed to parse AI response:', content);
      rawItems = [];
    }

    if (!Array.isArray(rawItems)) {
      rawItems = [];
    }

    const items = rawItems
      .slice(0, 200)
      .map((i: any) => {
        const name = sanitizeString(i.name, 200);
        if (!name) return null;
        return {
          user_id: userId,
          name,
          quantity: sanitizeNumber(i.quantity),
          unit: sanitizeString(i.unit, 20),
          category: (typeof i.category === 'string' && VALID_CATEGORIES.has(i.category)) ? i.category : 'Other',
        };
      })
      .filter(Boolean);

    if (items.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No grocery items found in receipt', items_added: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { error: insertError } = await supabase.from('grocery_items').insert(items);

    if (insertError) {
      console.error('Insert error:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to save items' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        message: `${items.length} items added to grocery list`,
        items_added: items.length,
        items: items.map((i: any) => i.name),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
