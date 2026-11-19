# Household reporting

Open Household to link your partner, configure account sharing, set dated splits, and create dated monthly budgets. No marriage date, split, or new sharing grant is selected automatically.

## Views
- My share and Partner's share use participant IDs and allocations effective on each transaction date. Transaction-level share overrides apply to income/spending, while cash-flow reports use account ownership for the cash ledger.
- Household total / Comparable includes authorized history of accounts ever selected for household reporting, including history before the financial combination date. This is a comparison projection, not a rewrite of recorded allocations.
- Household total / As recorded includes accounts from their effective inclusion dates. It may change scope across a transition and is explicitly labelled unsuitable for like-for-like trends without reviewing coverage.

Reports are currency-specific. They show available imported history, not a guarantee of complete bank coverage. Missing transactions are not presented as zero. Current account net worth does not include separately entered assets or reconstruct historical balances. Advanced personal reports retain the previous adjusted statement features.

## Initial history and later changes
A newly imported account starts at 100% for its owner. One-time initial setup may assign its historical split from an explicitly selected date after preview. Normal scheduling remains today or later. The explicit retroactive option can insert or replace a rule on a selected past or current date for any owned active account. Earlier and later rules remain intact; the correction applies until the next dated rule. Same-day replacement saves the previous rule in the owner-only audit alongside the new version. Historical correction never grants sharing access. A future rule may be cancelled, with an audit entry retained. Unlinking revokes sharing but preserves recorded allocations. Relinking does not reactivate previous sharing grants.

A household view requires each owner to select their accounts for household inclusion. Sharing is a separate explicit step with a history start date. Your partner's private accounts and personal budget targets remain unavailable. Each owner configures their own accounts; one person's bulk transition cannot change the other person's allocations.

## Duplicates and transfers
Connect a real bank account once. If it was linked twice, explicitly choose a primary copy in Household. The duplicate is excluded from the shared engine's reports while that primary is available. This does not merge or delete bank records, and it is not an automatic cross-provider identity matcher. Confirm complete history before excluding a copy.

Link internal transfers / settlements in Transactions or classify them as Transfer, Reimbursement, or Settlement. These are excluded from income and expense totals. Cash flow retains cash-account entries; internal transfers net only when both imported sides belong to the reporting perimeter. Never treat a reimbursement as both a new expense and income.

## Budgets
New monthly targets belong to My share or Household total. Household targets are shared with the active partner link. A saved target starts at the selected month and carries forward until replaced. Saving in the current month affects that whole month's target; earlier months remain unchanged. Annual reports sum the twelve effective monthly targets. Zero ends a target prospectively. Legacy budgets remain accessible separately; they are not silently reinterpreted as household targets.

## Validation
- `node tests/household-finance.mjs`: pure calculation tests, no network or private data.
- `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json`: application type check.
- `tests/household-security.sql` and `tests/household-invitations.sql`: privileged integration checks requiring suitable existing test users. They run all fixtures within a rolled-back transaction. Do not remove the transaction boundaries.

Supabase migrations are deployed to project cdkqtoghirbegixbgfli. Functions use authenticated owner checks and fixed search paths; tables have RLS and no direct authenticated mutations. Invitation redemption is rate limited with 128-bit one-use, expiring codes. Client preferences store only the report view, not financial data.
