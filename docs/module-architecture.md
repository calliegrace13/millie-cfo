# Workspace modules

## Guided module setup

Setup now assesses current configuration instead of relying on a static checklist. `setup-assessment.ts` is a pure read-only engine: it recognizes account setup, carried-forward budget versions, saved ownership/visibility choices, cash plans/settings, private module records, goals/projects, held quarters, accounting schedules and card-benefit configuration. It distinguishes missing configuration, material exceptions, a personal review decision, already configured, and unavailable evidence. A failed read never means "empty" or "ready". Owner-scoped supplemental reads are limited to selected workspaces; ordinary pages reuse the cached assessment and never mount another module's service to calculate progress.

Only unresolved steps are in the default walkthrough. Automatic recognition stays distinct from a user's review confirmation. Explicit confirmations store a non-security evidence fingerprint; changed relevant inputs reopen them. Ready status is recomputed from source records on each visit, not permanently copied into manual checkmarks. Evidence signatures and recognized keys live in private setup state and its audit; they do not alter budgets, sharing or financial books. Finishing a pass validates known recognition keys, preserves their provenance separately and remains a workflow acknowledgement, never a certification of financial reconciliation.

Budget suggestions use the existing personal-share financial engine over up to three completed calendar months, net of refunds and excluding internal transfers. At least two observed months are needed; import completeness is explicitly unverified. A carried-forward target (including a deliberate zero) blocks a replacement proposal. The budget form recomputes the draft from authorized data rather than trusting amounts in a URL. A paycheck draft accepts only an eligible posted owned deposit, excludes transfers/refunds/P2P and already linked deposits, and leaves gross pay, tax and pay-period inputs unknown. Debt/investment drafts prefill owned account identity/currency only; APRs, positions, prices and due dates are never invented. Runway setup reuses its existing evidence detector and atomic acceptance API, including duplicate/card-payment/variable-allowance safeguards. No suggestion is saved until the user explicitly accepts it.

Existing closed transactions stay outside ordinary classification review. Close assessment targets only the oldest unfinished *completed historical quarter*, never the current quarter. Archived accounts and inactive plans are not counted as current setup; historical source data remains intact. Supplemental reads and prefills never grant household access. `tests/setup-assessment.mjs` covers recognition, drift, failed sources, currencies, dated personal shares, transfer/refund treatment, held/current quarters, draft deduplication and immutability; the setup SQL tests additionally verify signature validation and the distinction between inferred and manually confirmed state.

`/setup` is the onboarding orchestrator, available even with no optional modules selected. It selects a preset or individual modules, then presents one of 39 specific review steps at a time. The path starts with Accounts/Transactions/Settings, then selected Household ownership, Everyday finances, Compensation, Assets and obligations, Analyst reporting, Period close, Goals, Cash runway, Debt payoff, Investment analysis, Long-term planning and Card benefits. Optional modules are omitted, not implicitly enabled as dependencies. A direct guide link can be used to revisit a module outside the recommended order.

Guides link to the existing authoritative forms and services. The setup client never saves budgets, sharing settings, bank credentials, forecasts, planning inputs or close snapshots on a user's behalf. A setup confirmation means the user reviewed the instructions; it is not proof that balances reconcile. Each guide describes prerequisites, concrete actions, what to verify, and financial side effects. Close onboarding remains quarter-by-quarter in Transactions and the actual close still requires its existing separate action.

`finance_setup_progress` and append-only `finance_setup_history` are private to the login, with owner-only RLS, no direct authenticated writes, strict action/step allowlists and expected-revision RPCs. Progress survives module switches. Defer, review and pause are distinct states. Finishing a setup pass permits deferred modules, but preserves them as unreviewed. Adding a module later adds pending steps without discarding earlier progress. Errors offer a reload; they never stop financial calculations or authorization.

The migration seeds existing identities as optional setup users. Identities first initialized after rollout enter guided setup automatically, choose their tools, and return to the guide on their next home visit while it is active. Canonical workspaces remain reachable to carry out each task. Users may pause and explore at any point. Existing users are never redirected. The sidebar, Customize cards and contextual workspace banner provide entry and return links; no extra module service is mounted solely to compute setup progress.

Tests: `tests/module-setup.mjs` covers all 4,096 module combinations, dependency order, stable route/step contracts, preserved checks and new/existing-user routing. `tests/module-setup-security.sql` uses rollback fixtures to test initialization, isolation from partners, revision conflicts, pause/defer/resume, hidden-module preservation, finish requirements, anonymous denial and unchanged transaction/close counts.

Millie has a modular application layer over one financial record. Modules are
presentation preferences, never entitlements or financial calculation flags.
`src/lib/modules.ts` defines stable module IDs, presets and route ownership.
`ModulesProvider` stores authenticated, user-scoped preferences through a separate
RLS-protected table. Core accounts, transactions, classification rules, Settings
and Customize remain available with every combination, including none selected.
Existing users keep all tools until explicitly saving preferences.

`ModuleAccess` stops disabled pages before mounting their effects. Navigation and
onboarding use the same registry/preferences. Direct links show a recoverable
enable-module screen. Optional panels in core pages follow preferences, while
financial calculations always use the complete authorized record. Household
permissions and dated ownership remain independent. Turning Household off is
not revocation; turning Assets off is not cancelling schedules; turning Close off
does not reopen periods. Budgets have a standalone entry point independent of
Household. Investment balances do not claim holdings or return attribution.

## Service boundaries

The existing Supabase functions own bank ingestion, classification and scheduled
maintenance. They continue independently of workspace presentation. Financial
reporting uses the existing household/accounting engine, including continuity,
historical allocations, held closes and later restatements. Do not pass module
preferences into that engine or filter its input records by module.

Keep user preferences isolated from the ledger and authorization. Future service
extraction should follow domain boundaries (ingestion, classification, reporting,
notifications), use versioned contracts and idempotent operations, and retain one
authoritative owner for each record. Avoid independent duplicate ledgers and
cross-service writes to accounting history. This release introduces no additional
servers or paid providers. Module selection is not a deployment configuration.

## Verification

`node tests/modules.mjs` checks all 256 module combinations, route availability,
presets and round trips against an unchanged historical finance fixture.
`tests/modules-security.sql` runs in a rolled-back transaction and checks
owner isolation, anonymous denial and invalid preferences. Existing financial,
history, classification and close tests must continue to pass.

## Cash and planning workspaces

Cash runway is bank-account liquidity in one currency, using full balances of
active own cash accounts. It is explicitly distinct from ownership-weighted
financial reporting. Only tomorrow onward is projected; a daily bridge and
per-account balances expose every assumption. Linked recurring sources provide
amount/frequency, linked projects provide remaining commitments. Reservations
and the cash buffer affect availability only, never bank cash or expenses.

Goals and life projects reuse finance_documents IDs, with append-only before/after
revision history. Goal changes use a locked, version-checked RPC that checks
aggregate reservations against the current balance share of a logical account.
Account continuity resolves the latest connection while preserving the original
account and historical allocations. Archives retain plans, release goal reserves
and stop project forecasts. The nightly snapshot automatically includes all new
public planning tables. No new services or external providers are introduced.

Presets separate household sharing from advanced accounting. Budget-versus-actual
belongs to Everyday; Goals and Runway have independent switches; card benefits
are optional; investment balances live under Accounts. Old planning bookmarks
redirect to Goals without requiring Analyst. Existing preferences are expanded
to preserve access to previously available tools. Plans remain private; choosing
a household cost scope does not grant account or project access.

Run node tests/cash-runway.mjs and rolled-back tests/planning-security.sql in
addition to module and existing ledger/close regression checks.
# Independent planning services

Income & compensation (`compensation-planning`), investment analysis (`investment-analysis`), debt payoff (`debt-planning`) and long-term planning (`long-term-planning`) are independently deployable Supabase Edge Functions. Each owns a domain and exposes a version 1 POST contract: paginated list, save, and revision history. Archive/restore are audited saves. They share authentication middleware and contract validation, not bank credentials or a separate financial ledger. No new paid data provider or always-running server is introduced.

The browser uses a domain-keyed service client. Every service verifies the caller with Supabase Auth, uses the caller's JWT for all queries and RPCs, restricts browser origins, returns no-store responses and sanitized failures, and never uses a service-role key or logs planning payloads. Disabled modules are gated before mounting their workspace. Domain records remain private even when Household is enabled.

`finance_module_records` is shared physical infrastructure with explicit domain ownership. This is a pragmatic service architecture on the existing Supabase platform, not four independent databases. The database is authoritative for invariants: owner-only RLS; no direct client writes; version checks; per-user transaction locks; request replay keys bound to payloads; duplicate holdings, valuations, debt terms and deposit/flow links rejected; append-only revision history. Independent database extraction can follow if scale requires it; distributed transactions and duplicated financial books would add risk now. Keep schema migrations backward compatible with v1 clients. Service role remains restricted to administrative maintenance/backups.

Paycheck details explain existing deposits and never post income. Holdings reconcile to account balances and are never added to them. Investment returns require exact-date valuations plus explicit completeness confirmation for external flows; Modified Dietz is labeled an estimate. Debt comparisons read canonical account balances and do not add liabilities or Runway cash plans. Long-term scenarios retain a starting snapshot and assumptions; future life events are applied once and never posted to actuals. Scenarios deliberately project financial assets, not total net worth. Turning a module off affects navigation only.

All twelve modules can be combined. Existing all-tools users receive the four additions; customized smaller selections remain unchanged. The Analyst preset includes the new tools; Essentials and Household stay focused. Core investment balance history remains at `/investments`, even when optional holdings analysis is off.

Validation: `tests/planning-domains.mjs`, `tests/planning-domains-security.sql` (transaction rollback), and `tests/modules.mjs` (all 4,096 combinations plus held-close/refund invariance). Financial models are pure, deterministic functions, with no network or persistence side effects. All new public tables are included by the existing dynamic encrypted-backup export. Prices, benchmark levels, paystub details and debt terms are manual inputs in this first release; no market-feed coverage or lender-accurate amortization is claimed.


## Transaction memory

Category edits and individual purchase approvals share `TransactionMemory`. The server previews exact merchant/service and currency matches across the owner's primary accounts. A confirmed amount threshold creates an active merchant preference, categorizes matching open purchases and removes their review flags. A later edit explicitly chooses an individual exception or the matching group plus future imports. Amounts, dates, ownership, tags and recognition schedules are never copied. The starting limit is the approved purchase's amount (or the saved limit); an above-limit purchase defaults to an individual decision.

`merchant_routine_id` records which rule approved a purchase, allowing deliberate updates of that group while preserving unrelated manual corrections. Legacy routine-confirmation provenance is recognized. Refunds, financial movements, pending transactions, larger amounts, held periods, duplicate/overlapping connections, linked offsets and accounting plans are excluded from automatic group changes. Saved merchant routines can be paused from the common-merchants panel. Future imports use the existing database trigger and classifier; there is one ledger.

Preview and save are owner-only RPCs. Saving serializes against period closes, locks the previewed rows and recomputes membership, categories, rule revision and row fingerprints. Stale previews abort atomically. Closed-period checks are materialized once per group to avoid decompressing held snapshots for every transaction. No historical ledger data is changed by the additive schema migration. Tests: `tests/transaction-memory-security.sql` (rolled-back fixtures), `tests/merchant-routines-security.sql`, `tests/merchant-routines.mjs` and `tests/transaction-classifier.mjs`.
### Batch merchant review and mixed retailers

Common merchant review keeps its component mounted during household refreshes, preserving the open panel and draft selections. Users stage several groups and/or individually selected Amazon purchases in one approval basket. `finance_save_merchant_review_batch` validates every source snapshot, locks selected records and serializes against closes before applying the entire batch. A stale record, duplicate, closed record or protected edit rejects all changes. Closed snapshots and accounting links are materialized once for the batch. No amounts, dates or ownership weights change.

Amazon descriptions are consolidated for review instead of presenting misleading bank merchant variants as separate categorical decisions. Category-count badges describe existing labels, not receipt evidence. Original descriptors, dates, amounts, account identities, a receipt link and evidence filters support classification. Grocery-service subscription wording is explicitly distinct from grocery items. Amazon selections are transaction-only corrections and do not create a blanket future Amazon rule. Mixed-basket item allocation still requires receipt detail; this UI never fabricates it.

Validation: `tests/merchant-review.mjs` and rolled-back `tests/batch-merchant-review-security.sql`, plus existing merchant-routine checks.