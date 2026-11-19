# Quarterly analyst workspace

`/analyst` is the Analyst reporting module's landing page. It composes six views from the existing authoritative reporting engine: quarterly review, reported-to-adjusted bridge, expense drivers, compensation quality, wealth creation and an integrated scenario. Existing statements and legacy planning remain accessible.

## Calculation boundaries

`analyst-workspace.ts` is a deterministic domain service with no network or writes. Reported and engine-normalized packages both come from `accountingReport`. Analyst overlays are explicit signed income/expense changes scoped to exact dates, perspective, currency, historical basis and account group. They never edit source transactions, accounting schedules, reported statements, budgets or closes. Adjustments in comparison periods use their own saved scope. A source-level bridge explains every engine delta; all categories, including disappearing ones, reconcile the expense change. Merchant counts are statement entries, not purchased quantities; no price/volume inference is made.

Calendar quarters compare to actual prior calendar quarters or the same quarter last year. Current quarters compare elapsed days capped at the comparison quarter end. Empty imported periods are coverage gaps, not proof of zero. Dated household changes are disclosed; personal expense shares continue using the authoritative dated rules even in comparable household inclusion mode.

Compensation uses owner-private paystubs only in unrestricted personal, as-lived scope. It separates cash compensation, deductions, reimbursements, employer retirement and noncash equity. Paystub-linked deposits must be unique, posted income in an eligible cash account, in the selected period, and wholly allocated to the owner. Missing, duplicated, shared or out-of-period evidence prevents a claimed reconciliation. Withholding is not an effective tax rate. Paystubs do not post a second income record.

Wealth requires actual observations at both period boundaries and before ownership changes. It shows reported surplus, documented ownership movement and an unexplained residual. That residual is not investment performance. Manual undated property remains outside the modeled balance sheet. Missing observations are not filled using current balances.

The scenario seeds adjusted calendar-month averages and dated period-end balances. It projects income, expenses, cash, investments, connected debt and other net assets. Contributions, principal and working capital move balance-sheet value without creating surplus. Each month checks `wealth change = surplus + assumed return`. Principal is capped at outstanding debt. Negative cash remains an unfunded shortfall. No automatic borrowing, future sharing change, tax prediction, paycheck gross-up, trip commitment or recurring-plan addition is inferred. Additional events are explicit to avoid counting existing commitments twice. Saved cases retain their original assumptions and results.

## Persistence and service contract

`useAnalystWorkpapers` reads owner-scoped analysis and compensation evidence. Failed reads block analysis persistence instead of becoming empty evidence. The database command `finance_save_analyst_workpaper` is the only authenticated write path to `finance_analyst_workpapers`; it enforces owner isolation, bounded payloads, required adjustment rationale, owned source IDs, optimistic revision checks and idempotent identical retries. `finance_analyst_history` preserves revisions. Analysts can archive/restore overlays; held quarterly review payloads cannot be rewritten. Saving a review is distinct from accounting close. Module switches affect navigation only. Existing public-table encrypted backups include the new tables.

This is an isolated analysis domain and command boundary within the existing deployment, not a claim of a new independently operated ledger service. It shares the canonical source model and does not duplicate its accounting authority. No provider access, AI invocation, quota change or bank mutation is introduced.

## Verification

- `tests/analyst-workspace.mjs`: bridge identities, disappearing category drivers, source immutability, dated wealth gaps, quarter boundaries, scope/owner isolation, payroll duplication, baseline months and 100 scenario stress cases.
- `tests/analyst-workpapers-security.sql`: synthetic rollback fixtures for owner isolation, command-only writes, replay, stale versions, archive/restore, source validation and immutable review editions.
- Existing reporting-engine and workspace-navigation regressions, TypeScript and production build.

UI verification does not save invented personal adjustments or run paid AI analyses.
