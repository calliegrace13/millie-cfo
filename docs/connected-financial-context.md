# Connected financial context

The context domain is an explanatory overlay on the authoritative accounting engine. It never posts, totals, reclassifies or allocates money. Multiple context links can describe the same transaction. Financial amounts remain in the existing ledger and statement engine.

## Services and provenance

- `financial-context.ts` builds a deterministic read model from authorized records: receipts, dated account arrangements, payment/transfer pairs, offsets, accounting plans, recognition schedules, trips, life projects, recurring cash evidence, compensation and recoveries.
- `useFinancialContext` loads each owner-private source independently. A failed source is unavailable, never reported as empty. Accounts and transactions use the existing retained-history and account-continuity adapter.
- `finance_context_records` stores private notes, types, service dates and explicit source IDs. Receipt payloads are immutable extracted evidence. User changes go through `finance_save_context`, with ownership validation, version checks, idempotent replay, snapshots and revision history. Archive is reversible. Links to unavailable original sources remain inspectable; snapshots do not recreate ledger activity.
- Existing successful receipt analyses are imported once, and future successful receipt runs capture their validated extracted results. No email body, credentials or additional provider calls are required. Matching is a suggestion until the user confirms the receipt-to-transaction link. A past category approval does not establish a receipt identity.
- `connected-context.ts` gives the assistant bounded, explicitly linked facts for its selected owned transactions. It honors receipt-use consent, excludes other users, archived context and unconfirmed suggestions, and adds coverage disclaimers. Existing task authorization and request limits still govern analysis. Opening Context makes no AI calls.

Private context remains available when an optional module is hidden. Editing the source in that module requires re-enabling its workspace. Module preferences never rewrite links or financial records. Existing public-table backup discovery includes both new context tables.

## User workflow

Connections & setup opens **Next connections**, a prioritized evidence inventory and checklist. Module setup guides remain available. **Understand a transaction** shows its linked sources and distinguishes saved links, automatic trip assignments and unconfirmed receipt suggestions. **Saved evidence** supports linking, editing notes, archive/restore and revision history. Transactions and Receipts link into the same context workspace.

Contracts, purchases, people and life events can be recorded now, with service dates and selected transaction IDs. A contract note is not an accounting policy: the user must use Assets, bills & timing to create recognition schedules. Receipt linking can add evidence to a closed purchase without editing its original statement.

## Connection plan and current boundaries

1. Verify bank coverage and continuity; use statement import for unsupported institutions.
2. Confirm Gmail and sync receipt text; review extracted matches. The receipt workspace checks while open. Step 4 also supports server-side sync when background work and automatic Gmail syncing are enabled. Attachments are not downloaded.
3. Add lease/insurance service dates and major-purchase facts, then the appropriate accounting schedule.
4. Enter paystub/benefits breakdowns against existing deposits. Direct payroll sync is not built.
5. Review travel dates, claims and repayment evidence.
6. Add dated brokerage holdings, valuations and contribution records. Automatic holdings/activity ingestion needs a separate provider integration and coverage validation.
7. Build private attachment/document ingestion with validation, extraction, page citations and retention controls. Existing email-file import accepts text/HTML/EML; do not represent it as a PDF parser.
8. Build a finance-specific read-only calendar connector with separate user consent. The legacy CEO calendar is not used or enabled by this release.

No new financial provider, calendar access, mailbox scope, background job or paid AI task is activated by deployment. The checklist reports recorded evidence, not verified completeness. Extracted evidence and notes are retained privately with history until explicitly managed; raw email expiry remains governed by the existing email service.

## Verification

`tests/financial-context.mjs` exercises privacy, suggestions, competing matches, currencies, movements, archives, absent sources, deduplication, connection errors and assistant consent. `tests/financial-context-security.sql` runs synthetic fixtures in a rollback transaction to verify RLS, command-only writes, version conflicts, replay, receipt provenance, unchanged ledger fields and saved evidence after source removal. Existing reporting, navigation and assistant tests protect the boundaries.
