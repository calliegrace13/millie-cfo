# Authoritative accounting and reporting

`reporting-engine.ts` owns the versioned statement package. It composes the existing household recognition engine, cash journal and dated accounting plans. All primary statement routes, report exports, the browser's read-only financial-report tool and newly captured closes use this package. Basic `report()` and `analyticalReport()` share the same recognition and cash rules; planning, setup and project consumers therefore agree about loan principal, interest, deposits, escrow and refunds.

This is a deterministic domain service within the existing application. It introduces no independent ledger database, background service, provider calls or new data grants. Raw imports and saved accounting commands remain authoritative. The calculation journal is a read model with source references and separate income, expense and cash measures, not a fabricated double-entry general ledger or an additional transaction feed. Recognition sources point to plans/schedules and their linked transactions.

## Date and scope contract

Every package includes period, currency, personal/partner/household perspective, as-lived/comparable/pro-forma scope, account selection, activity basis and engine version. The dated balance sheet uses exact-date observations and dated plan balances. It never substitutes today's current balance for historical evidence. Archived accounts remain eligible. Overdrafts are liabilities; credit balances on debt accounts are assets. Plan debt already represented by a connected account is not added again.

Manual legacy assets lack a currency and valuation date. Their saved values remain separately available with existing legacy balance snapshots; neither is quietly included in a historical statement. Latest balances remain a separate, clearly dated section. A complete modeled balance sheet refers to observed accounts plus linked accounting plans, not untracked property or guaranteed complete personal wealth.

Cash and account-net-worth bridges require boundary observations. Ownership changes are valued using the immediately preceding day's observation and the difference in dated shares. Missing observations remain missing. The remaining account-net-worth difference may include valuations, unrecorded activity or responsibility-versus-ownership differences; it is never labeled investment performance without evidence. Arithmetic controls are explicitly distinguished from source completeness and external reconciliation.

## Closed reporting editions

- Latest available data: current authorized/retained history and chosen reporting scope.
- As originally closed: frozen statement package for new closes; exactly the originally saved totals and lines for older closes. Old closes are never recomputed and relabeled original.
- Latest restatement: current evidence with the original close's settings and the existing retained-history policy. Deleted corrections on still-accessible accounts are not resurrected.

New manual and quarterly closes include engine version, journal, controls and boundary coverage. Older close payloads are unchanged. All editions retain the original source snapshots. No production close is created by deployment. The selected close belongs to the signed-in owner; partner visibility is not expanded. Forecasting continues to use latest data rather than accidentally inheriting a frozen reporting edition.

## Verification

`tests/reporting-engine.mjs` covers source-linked journal totals, principal/interest, card payments, dated balances, overdrafts, credit balances, mid-period ownership, missing observations, normalization, frozen and legacy closes, owner isolation, archived accounts, duplicate accounts and currencies. Existing household, analyst, accounting-plan, lifecycle, durable-history, planning, setup, trips, cash-runway and module tests protect the surrounding behavior. No financial records or AI quotas are changed by these tests.
