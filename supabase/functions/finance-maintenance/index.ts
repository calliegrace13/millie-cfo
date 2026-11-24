import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { syncItem, decryptToken } from '../_shared/bank-sync.ts';
import { bankIntegrity } from '../_shared/bank-integrity.ts';
import { integrationHealth } from '../_shared/integration-health.ts';
import recoveryPublic from '../_shared/recovery-public.json' with {
  type: 'json'
};
const b64 = (bytes)=>btoa(String.fromCharCode(...bytes));
serve(async (req)=>{
  const reply = (data, status = 200)=>new Response(JSON.stringify(data), {
      status,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  if (req.method !== 'POST') return reply({
    error: 'Method not allowed'
  }, 405);
  try {
    const db = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
    const auth = await db.rpc('finance_scheduler_authorized', {
      _token: (req.headers.get('Authorization') || '').replace(/^Bearer /, '')
    });
    if (auth.error || auth.data !== true) return reply({
      error: 'Unauthorized'
    }, 401);
    const body = await req.json();
    if (body.action === 'bank-integrity') {
      return reply(await bankIntegrity(db, body.item_id, decryptToken));
    }
    if (body.action === 'integration-health') {
      return reply(await integrationHealth(db, body.owner_id));
    }
    if (body.action === 'recovery') {
      const names = [
        'TOKEN_ENCRYPTION_KEY',
        'PLAID_CLIENT_ID',
        'PLAID_SECRET',
        'PLAID_ENV'
      ];
      const secrets = Object.fromEntries(names.map((name)=>[
          name,
          Deno.env.get(name)
        ]));
      if (names.some((name)=>!secrets[name])) throw Error('Configuration missing');
      const key = await crypto.subtle.importKey('spki', Uint8Array.from(atob(recoveryPublic.spki), (c)=>c.charCodeAt(0)), {
        name: 'RSA-OAEP',
        hash: 'SHA-256'
      }, false, [
        'wrapKey'
      ]);
      const aes = await crypto.subtle.generateKey({
        name: 'AES-GCM',
        length: 256
      }, true, [
        'encrypt'
      ]);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ciphertext = await crypto.subtle.encrypt({
        name: 'AES-GCM',
        iv
      }, aes, new TextEncoder().encode(JSON.stringify(secrets)));
      const wrapped = await crypto.subtle.wrapKey('raw', aes, key, {
        name: 'RSA-OAEP'
      });
      const saved = await db.rpc('finance_save_recovery', {
        _envelope: {
          version: 1,
          algorithm: 'RSA-OAEP-SHA256/AES-256-GCM',
          iv: b64(iv),
          wrappedKey: b64(new Uint8Array(wrapped)),
          ciphertext: b64(new Uint8Array(ciphertext)),
          createdAt: new Date().toISOString()
        }
      });
      if (saved.error) throw saved.error;
      return reply({
        recovery: 'encrypted'
      });
    }
    if (body.action !== 'sync' || typeof body.item_id !== 'string') return reply({
      error: 'Invalid request'
    }, 400);
    const item = await db.from('plaid_items').select('*').eq('id', body.item_id).single();
    if (item.error) throw item.error;
    const result = await syncItem(db, item.data);
    return reply(result, result.error ? 502 : 200);
  } catch  {
    return reply({
      error: 'Maintenance failed'
    }, 500);
  }
});
