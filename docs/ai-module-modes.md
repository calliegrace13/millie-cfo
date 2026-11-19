# Manual and AI execution modes

Every module and the always-available transaction foundation has a private, versioned execution policy. This is separate from workspace visibility. Manual mode blocks new inference and automatic saves; it never removes confirmed routines, amortization schedules, splits, or held closes. Hiding an optional module also blocks new assistant execution for it. Existing outputs and manual tools remain usable.

`assistant-tasks.ts` is the capability registry shared by the UI and task service. It describes actual workers, not arbitrary model-generated tools. Module reviews cover budgets, cash, goals, reporting, household, close readiness, timing, benefits, compensation, investments, debt, scenarios, watchlists and recoveries. Transaction receipts and merchant patterns retain their dedicated workflows. Supported financial commands are expense categorization, single-purchase service/asset/deposit plans, personal budget proposals and unreserved goals. Other workers complete evidence-backed analysis and precise follow-up questions. Sharing, payments, trades, loan/lease setup and period-close attestation remain explicit domain workflows.

## Service boundaries

- `finance-assistant`: separately deployable, authenticated orchestration service. It assembles owned-account evidence, dispatches bounded model calls, persists work, and invokes domain commands. No second ledger or client-side secret.
- `finance-ai`: existing receipt/pattern inference now also checks module/task permissions server-side.
- `assistant-provider.ts`: isolated provider adapter using the existing encrypted API key vault and `finance_ai_reserve` request budget. OpenAI and Anthropic adapters are independently mock-tested. Public research and structured financial interpretation are separate calls because Claude citations and strict JSON output cannot be combined.
- Database commands own financial mutations. `finance_assistant_apply` locks the same owner context as transaction review and period closing, then uses existing reviewed-purchase, accounting-plan, budget and goal commands. Successful applies are idempotent; a failed sub-operation rolls back the entire command.

These are explicit service and domain boundaries on the existing Supabase deployment, not independent databases. Shared financial invariants remain transactional. Domain services can evolve without duplicating balances, transaction ownership or historical reports.

## Evidence and trust

All new modules default to Manual. Existing explicitly connected receipt/pattern tools remain available, but no new automatic saving permission is granted by migration. Per-task automatic approval is available only for supported category/timing changes and clear receipt matches. Other financial proposals require a save action. Auto saving re-checks current permissions and their revision; edited proposals require manual saving. Human changes are protected from later imports by the existing rules.

Each module run uses a visible date window of at most a year: up to 200 recent transactions, 40 eligible purchases and bounded configuration collections. Sources are labeled as owned full-account evidence, not a complete household or personal-share statement. A model is never the source of accounting totals. New plans link the original purchase, preserve its cash date and prevent a duplicate expense. New timing coverage cannot overlap a closed period.

Optional Gmail evidence reads up to ten unexpired, already-synced emails (20,000 characters total); this does not request new OAuth access or perform an unattended inbox sync. Optional public merchant research uses only cleaned merchant names, at most two searches, then feeds cited public context to interpretation. Private purchase facts, dates and amounts are never search inputs. Missing or unsupported public evidence becomes a question. Web content and email text are treated as untrusted data, with exact-quote validation. Mixed-retailer categorization needs receipt or owner evidence. Timing requires attributable coverage dates; asset useful life and residual assumptions require an owner answer. Source text is encrypted in the prepared-job envelope; only supporting quotes and minimal action snapshots persist in the private work queue.

## Recovery and limits

Job IDs and stage IDs are stable across retries. Prepared encrypted context is immutable, provider and model are fixed for the run, and each paid stage reserves the existing rolling request quota. Cached stages do not call the provider again. Failed calls do not automatically retry or fall back to another model. The app limits request count and output size, not dollars; provider spending controls remain necessary. Module runs start on demand after the user authorizes the displayed evidence. No cloud schedule or always-on agent is introduced.

Questions and answers, proposals, completed work and dismissals persist privately with revision history. The user can answer and continue, edit a proposal, use manual tools, or mark an item handled. Turning AI off leaves this work intact. Financial changes remain editable through the authoritative module.

## Validation

`assistant-modes.mjs` validates capability coverage, task gating, evidence, ambiguous retailers and timing assumptions. `assistant-provider.mjs` mocks both providers, search limits, quota failures, replays and model changes without network calls. `assistant-security.sql` runs rolled-back fixtures against the live schema for private access, direct-write denial, Manual mode, receipt gate, stale settings, atomic mode presets, idempotent applies, closed periods, unchanged bank facts, linked plans and saved answers. Existing receipt queues, matching, accounting schedules and module/history tests remain part of release checks.

Provider references: [OpenAI web search](https://developers.openai.com/api/docs/guides/tools-web-search), [Claude web search](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool), [Claude structured-output compatibility](https://platform.claude.com/docs/en/build-with-claude/structured-outputs#feature-compatibility).

Manual receipt review keeps Gmail syncing, email-file import, text previews, purchase search and a category approval basket available with AI disabled. Switching modes preserves prepared receipt inputs; manual approval uses the same protected ledger RPC as other transaction review. It does not persist a receipt attachment or create a new bank transaction.
