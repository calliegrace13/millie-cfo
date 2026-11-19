-- Apply after deploying all four updated Edge Functions. Existing users must
-- opt into background execution; this schedule does not alter their consent.
select cron.schedule('millie-agent-work','* * * * *','select public.finance_dispatch_autopilot()');
