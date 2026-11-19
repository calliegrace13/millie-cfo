import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response('Unauthorized', { status: 401, headers: corsHeaders });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Verify the user
    const anonClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!);
    const { data: { user }, error: authError } = await anonClient.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) return new Response('Unauthorized', { status: 401, headers: corsHeaders });

    const userId = user.id;
    const today = new Date().toISOString().slice(0, 10);
    const alerts: Array<{ title: string; body: string; type: string; reference_type?: string; reference_id?: string; link?: string }> = [];

    // 1. Budget alerts
    const { data: budgets } = await supabase.from('budgets').select('*').eq('user_id', userId).eq('is_active', true);
    if (budgets && budgets.length > 0) {
      const monthStart = today.slice(0, 8) + '01';
      const { data: txs } = await supabase.from('transactions').select('amount, category')
        .eq('user_id', userId).gte('date', monthStart).lte('date', today).gt('amount', 0);

      if (txs) {
        const spendByCategory: Record<string, number> = {};
        for (const tx of txs) {
          if (tx.category) spendByCategory[tx.category] = (spendByCategory[tx.category] || 0) + tx.amount;
        }
        for (const b of budgets) {
          const spent = spendByCategory[b.category] || 0;
          const limit = b.period === 'yearly' ? b.monthly_limit / 12 : b.monthly_limit;
          const pct = limit > 0 ? (spent / limit) * 100 : 0;
          if (pct >= 100) {
            alerts.push({ title: `Budget Exceeded: ${b.category}`, body: `You've spent $${spent.toFixed(0)} of $${limit.toFixed(0)} this month.`, type: 'budget_exceeded', reference_type: 'budget', reference_id: b.id, link: '/manage-finances' });
          } else if (pct >= 90) {
            alerts.push({ title: `Budget Warning: ${b.category}`, body: `At 90% — $${spent.toFixed(0)} of $${limit.toFixed(0)}.`, type: 'budget_danger', reference_type: 'budget', reference_id: b.id, link: '/manage-finances' });
          } else if (pct >= 75) {
            alerts.push({ title: `Budget Alert: ${b.category}`, body: `At 75% — $${spent.toFixed(0)} of $${limit.toFixed(0)}.`, type: 'budget_warning', reference_type: 'budget', reference_id: b.id, link: '/manage-finances' });
          }
        }
      }
    }

    // 2. Missed bills
    const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
    const { data: recurring } = await supabase.from('recurring_transactions').select('*')
      .eq('user_id', userId).eq('is_active', true).lt('next_expected_date', threeDaysAgo);
    if (recurring) {
      for (const r of recurring) {
        alerts.push({ title: `Missed Bill: ${r.name}`, body: `Expected on ${r.next_expected_date}, not yet seen.`, type: 'missed_bill', reference_type: 'recurring', reference_id: r.id, link: '/manage-finances' });
      }
    }

    // 3. Unusual spending (last 24h transactions vs merchant average)
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const { data: recentTxs } = await supabase.from('transactions').select('id, name, merchant_name, amount')
      .eq('user_id', userId).gte('date', yesterday).gt('amount', 0);
    if (recentTxs) {
      for (const tx of recentTxs) {
        const merchant = tx.merchant_name || tx.name;
        const { data: history } = await supabase.from('transactions').select('amount')
          .eq('user_id', userId).ilike('merchant_name', merchant).gt('amount', 0).limit(20);
        if (history && history.length >= 3) {
          const avg = history.reduce((s, h) => s + h.amount, 0) / history.length;
          if (tx.amount > avg * 3) {
            alerts.push({ title: `Unusual Spending: ${merchant}`, body: `$${tx.amount.toFixed(0)} vs avg $${avg.toFixed(0)}.`, type: 'unusual_spending', reference_type: 'transaction', reference_id: tx.id, link: '/transactions' });
          }
        }
      }
    }

    // 4. Upcoming birthdays
    const next7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(Date.now() + i * 86400000);
      return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
    const { data: contacts } = await supabase.from('contacts').select('id, display_name, birthday').eq('user_id', userId).not('birthday', 'is', null);
    if (contacts) {
      for (const c of contacts) {
        if (!c.birthday) continue;
        const mmdd = c.birthday.slice(5); // MM-DD from YYYY-MM-DD
        if (next7Days.includes(mmdd)) {
          alerts.push({ title: `Birthday: ${c.display_name}`, body: `${c.display_name}'s birthday is on ${c.birthday.slice(5)}.`, type: 'birthday', reference_type: 'contact', reference_id: c.id, link: '/chro' });
        }
      }
    }

    // Deduplicate: check existing notifications for today
    const { data: existing } = await supabase.from('notifications').select('reference_type, reference_id, type')
      .eq('user_id', userId).gte('created_at', today + 'T00:00:00Z');
    const existingSet = new Set((existing || []).map(e => `${e.type}:${e.reference_type}:${e.reference_id}`));

    const newAlerts = alerts.filter(a => !existingSet.has(`${a.type}:${a.reference_type}:${a.reference_id}`));

    if (newAlerts.length > 0) {
      await supabase.from('notifications').insert(
        newAlerts.map(a => ({ user_id: userId, ...a }))
      );
    }

    return new Response(JSON.stringify({ generated: newAlerts.length, total_checked: alerts.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

