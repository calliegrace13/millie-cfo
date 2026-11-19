# Analyst workspace implementation

Scope: unified report calculations and drill-through; dated account histories (mine or partner before sharing); separate balance ownership and expense responsibility; category split defaults; reimbursements; named comparable scopes and pro forma; dated snapshots and reconciliation; saved scenarios; project commitments and funded goals; monthly closes; explicit separation; legacy calculation cleanup; data quality and review controls.

Do not change any existing user's split, visibility, categories, or bank connections automatically. Preserve raw records. Existing allocation percentages remain as legacy balance defaults until explicitly configured. All new editing uses owner checks and RLS. No provider purchases.

Validation: TypeScript, calculation fixtures including both pre-sharing perspectives, owner/partner security rollback fixtures, source diff checks, production deployment verification.

## Implemented release

- Shared report engine for income, cash, balances, budget variance and planning; quarter/YTD/TTM, equal elapsed-date comparisons, saved account groups and pro forma simulation.
- Account life changes: mine or partner before sharing, date, later expense percentage, independently entered balance/debt ownership; preserved later phases and audited replacement history.
- Category defaults and transaction override precedence; separation ends future expense defaults but preserves balance ownership and history; immediate unlink remains independent.
- Recorded/normalized reconciliation, schedules and offsets; classified cash movement, exact-observation cash and net-worth bridges with unexplained residuals; source drill-through, exports and frozen private summaries.
- Saved scenarios, cash events, investment contributions and principal; project commitments and selected actual costs; server-validated, cash-backed goal reservations.
- CSV import preview and duplicate checks; reviewed rule batches with conflict disclosure and protected undo; no transfer auto-linking merely on page view.
- Explicit legacy-budget migration, category suggestions, recurring end dates, and tracked card-credit usage rather than headline value in the fee comparison.

## Practical limits that remain visible in the app

- This is management tracking, not legal ownership or tax accounting. Bank connection ownership and visibility stay independent.
- Old balances cannot be reconstructed reliably. Snapshot history begins with genuine observations. Residuals are not labeled investment returns.
- Legacy recurring items lack account/currency attribution: recurring-only forecasts are restricted to the personal unrestricted USD view and use monthly equivalents, not a daily payment calendar. Household scenarios use allocated history and explicit cash events.
- Forecasts use income/expense cash conversion in the same month; no automatic borrowing, gross-pay/tax model, principal schedule or market-return inference. Manual property is outside the forecast model.
- Projects and goals are private planning documents. Project actuals follow selected source records and current report scope; user must explicitly choose costs, commitments and funding amounts. Existing event records and manual assets remain accessible.
- Budget targets are full calendar-month targets. Subset/pro forma views omit targets instead of inventing allocations. A saved period summary freezes totals; it is not a certified financial close.
- Shared access can be revoked. Saved comparison groups flag unavailable accounts; no promise of permanent access to an ex-partner's source records.
- No paid provider subscription or bank login was initiated.

## Verification

TypeScript passes. `tests/household-finance.mjs` and `tests/analyst-finance.mjs` pass. `tests/analyst-security.sql` passed against the deployed schema with all fixtures rolled back: account phases, expense/balance independence, future cutoffs, owner-only mutations, private plans, immutable close summaries, goal limits, rule apply/undo and duplicate-safe imports.

## Per-instrument transaction-history correction

Household now names a specific card, checking/savings account or investment account, with masked identity, before/after transaction counts and an explicit preview. The Millie profile and bank connector are not treated as the transaction beneficiary. Accounts links directly to the selected financial account's form. Bulk changes are secondary.

`finance_transaction_history` changes transaction allocation defaults for only that account ID. It preserves raw transactions, bank balances, every existing balance-ownership boundary, future arrangements, other accounts and access grants. Earlier transaction defaults are audited. Category and transaction exceptions remain explicit. Tested with rollback fixtures for mine-origin and partner-origin cards, savings/investment accounts, legacy balance percentages, same-date corrections, future rules and unauthorized edits.


## Dated household lifecycle
Household now opens with single, sharing expenses, and merged-finance stages. Users select individual financial accounts, effective dates and expense percentages, with separate explicit balance/debt pooling. Preview and owner-authorized atomic RPC preserve earlier and later rules; category default resets are optional and audited. Partner visibility remains independently controlled. Each confirmation creates a private timeline event and fixed account group.

Account reconciliation uses identical accessible accounts, currency, dates and activity basis: mine + partner + unassigned = combined, less outside-household activity = household. Current account net worth is separately labelled as latest balances using today's ownership; it is not historical period-end net worth. Unknown partner accounts, inaccessible scope members and former-partner residuals are not invented. Manual assets and standalone schedules are excluded from this account bridge.

Validation: lifecycle-finance.mjs covers all three phases, comparable scope, normalized activity, cash ownership and residuals. lifecycle-security.sql uses rollback fixtures to test owner-only mutation, private event visibility, preserved history, explicit pooling, category boundaries and stale-preview rejection.


## Durable history and period closes
Archiving retains bank rows and captures the last known balance; hard account deletion is blocked. Changed/deleted transactions retain owner-private audit versions from installation onward. Historical data erased before this feature cannot be recreated. Revoking shared account visibility or ending a partner link captures only previously authorized account/transaction history for the recipient; no future bank access is granted. Historical retained accounts have no live balances. Private amortization schedules and offset relationships are not copied by the revocation trigger.

Reconnects retain stable provider IDs. Changed IDs remain distinct until the user confirms the account and a date handoff; possible matches are suggested by mask/type/currency, never auto-merged from a fingerprint. Canonical report history takes the old source before the handoff and the new source on/after it; raw overlap is kept, not deleted. Gaps and partial-day boundaries need review. Existing original-account dated splits govern the combined history.

Weekly (Monday-Sunday), monthly and quarterly closes are manual, immutable private documents with source copies, settings, totals and lines. Restated comparisons use current authorized data plus retained unavailable history. Available-account scopes incorporate new historical imports; fixed groups intentionally exclude accounts outside the group. Refund recognition dates/offsets affect normalized income while bank-date cash remains unchanged. Closed snapshots cannot be updated or deleted by authenticated clients.
