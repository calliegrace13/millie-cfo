begin;
create function public.finance_dispatch_sync() returns integer language plpgsql security definer set search_path=public as $$
declare p record; token text; sent integer:=0;
begin
 select decrypted_secret into strict token from vault.decrypted_secrets where name='millie_scheduler_token';
 for p in select id from public.plaid_items loop
  perform net.http_post(url:='https://cdkqtoghirbegixbgfli.supabase.co/functions/v1/finance-maintenance',headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||token),body:=jsonb_build_object('action','sync','item_id',p.id),timeout_milliseconds:=120000);
  sent:=sent+1;
 end loop;
 return sent;
end $$;
revoke all on function public.finance_dispatch_sync() from public,anon,authenticated;
grant execute on function public.finance_dispatch_sync() to service_role;
select cron.schedule('millie-bank-sync','17 */6 * * *','select public.finance_dispatch_sync()');
select cron.schedule('millie-nightly-snapshot','40 7 * * *','select public.finance_snapshot()');
-- Create an encrypted recovery envelope without exposing the live key to a
-- database result, local process, source repository, or browser.
select net.http_post(url:='https://cdkqtoghirbegixbgfli.supabase.co/functions/v1/finance-maintenance',headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='millie_scheduler_token')),body:='{"action":"recovery"}'::jsonb,timeout_milliseconds:=30000) as recovery_request;
commit;
