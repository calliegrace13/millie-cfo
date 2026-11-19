# Durable execution and AI spending

The agent is an orchestration service around existing financial commands. It does not create a second ledger. Period locks, dated sharing, owner consent and optimistic transaction revisions remain enforced by the existing accounting commands.

## Execution

`finance_dispatch_autopilot` runs every minute through the existing Supabase pg_cron/pg_net infrastructure. It dispatches at most five due owners. Each owner gets a five-minute exclusive lease and one bounded task per invocation. Pending work, request IDs, results, attempts, research decisions and next-run times live in Postgres. A closed tab or disconnected computer does not interrupt scheduling. The UI only observes progress.

An internal request must authenticate with the existing server-only scheduler credential and an enabled, unexpired owner lease. Browser JWTs are never saved for background use. Child services accept only their narrow worker operations; worker reads are owner-filtered and accounting writes go through an allowlisted database command gateway. Workers cannot change consent, spending limits, sharing or period-close state. Pause revokes access before the next provider stage or financial command. Already-sent provider calls may finish and are metered.

The planner reuses saved receipt evidence before paying for new work. It prioritizes answered questions, receipt facts, enabled inbox sync, expense timing, categorization, close preparation and missing module setup. Source fingerprints and request IDs prevent duplicate work. Failed paid work opens a circuit until explicit retry or manual review; changing its status never erases its cost. Infrastructure failures without a paid task receive bounded scheduled retries (up to three). Stale leases recover automatically. After ten minutes a crashed paid call becomes uncertain, never automatically resubmitted.

## Spending

All inference paths (receipts, merchant patterns, module tasks and public research) use one provider gateway and an atomic per-owner database reservation. Dollar budgets are shared across providers; the existing rolling 24-hour request cap also remains and now counts all providers. Defaults are USD 1/day and USD 5/calendar month. UTC day/month boundaries are explicit. A zero limit stops new paid calls. Budget edits are revision-checked and audited.

Before sending, Millie reserves a conservative maximum in integer microdollars using a verified, expiring model tariff. Ordinary text is bounded by UTF-8 payload bytes plus framing allowance and a hard output limit. Opaque research reserves three full context passes, maximum output and two search fees; this can be much more expensive than expected actual usage. If optional research cannot fit, the task checkpoints that decision and uses existing evidence or asks a question. It never substitutes a paid provider or increases a budget.

Provider token usage is recorded before content parsing. Cache reads, cache creation and search fees are counted. Unknown usage/timeouts retain the entire reservation across calendar boundaries; they cannot quietly refund the allowance. A crash before the durable send marker releases its unsent reservation after expiry. Usage settlement is idempotent. An observed tariff overrun disables that tariff for future calls. Missing or expired model pricing fails closed.

Amounts are standard API usage valuations, not invoices; taxes, discounts and usage outside Millie are not visible. Pre-migration calls have no usage metadata and are excluded, with the tracking start shown in the UI. Provider account billing limits remain useful as a separate guard. Tariffs expire after 30 days and must be refreshed from official prices before more paid work; do not silently extend expiry without verification.

Verified sources (2026-11-03): [OpenAI pricing](https://developers.openai.com/api/docs/pricing), [GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini), [GPT-4o mini](https://developers.openai.com/api/docs/models/gpt-4o-mini), [Claude pricing](https://platform.claude.com/docs/en/about-claude/pricing). Only exact, reviewed model IDs are enabled.

## Release and recovery

Apply the migration, deploy `finance-ai`, `finance-assistant`, `receipt-email`, and `finance-autopilot`, then enable the cron schedule. Existing users are not silently opted into background execution; the requesting owner's already-enabled automation can be activated explicitly for this release. Other users choose Start background work. Site audience remains private.

Validation: provider calls are mocked; SQL authorization/reservation/lease tests run inside rollback transactions; scheduled execution is smoke-tested with a synthetic owner, no provider and no financial records. No paid call is needed for release verification. Preserve run and charge history during incident recovery. Do not delete a failed run or release an uncertain hold merely to make a task run again.
