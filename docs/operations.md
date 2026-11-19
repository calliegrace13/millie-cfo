# Sync, coverage, and recovery

## Bank imports

The database invokes `finance-maintenance` every six hours at :17 UTC (00:17, 06:17, 12:17, 18:17). Each bank connection gets its own request. Manual sync uses the same import engine. The scheduler authenticates with a random secret in Supabase Vault; the browser cannot call privileged sync or backup RPCs. User-triggered sync authenticates the session and scopes connections to that user.

A per-connection lease prevents overlapping imports. The complete Plaid pagination sequence and final cursor are applied in one database transaction. Failed pagination does not advance the cursor. Only exact Plaid transaction IDs and explicit pending-to-posted IDs reconcile records; similar merchants, dates, and amounts are not treated as duplicates. Existing custom categories survive updates. Failures preserve the previous success timestamp and create one in-app notification per changed error. No emails are sent. The next six-hour run retries. An unexpectedly terminated run becomes eligible again after its five-minute lease expires.

Imports use `/accounts/get` cached balances. They do not force a paid real-time balance refresh. The bank determines how fresh its data is. No Plaid refresh/webhook subscription was added.

Coverage panels show each user's connection state and available account-history dates. An earliest transaction date is not a certified coverage boundary. Missing/private accounts cannot be discovered automatically. Partner connection metadata is not exposed. The report amount and CSV still require the user's statement verification.

Limits: a single import accepts at most 20 pages of 500 records, and an edge execution can time out. Such a run must not be called a success. Large historical imports can be requested in smaller date windows. The backend may create records while balance refresh later fails; the failure message therefore refers to the last successful import timestamp, not an assertion that the database had no changes.

## Backups

Nightly at 07:40 UTC, `finance_snapshot()` captures every public table plus auth users and identities in one transaction. Seven days are retained in the private `millie_operations` schema. These are data snapshots within the same Supabase project, not independent disaster-recovery backups. Auth sessions, storage objects, provider settings, and a full Postgres schema dump are not included. There were no storage objects when configured.

An independent local export is scheduled through the Codex app for 08:15 local time. It requires this computer and Codex to be available. `work/export-millie-backup.ps1` saves to the sibling `recovery` directory, includes the source SQL migrations, rejects snapshots older than 36 hours, and verifies Windows DPAPI decryption and bank-secret recovery in memory. Local copies are not automatically deleted. A failed or stale export alerts the user.

The live TOKEN_ENCRYPTION_KEY and Plaid configuration are encrypted on the edge using AES-256-GCM; the AES key is wrapped with RSA-OAEP SHA-256. Only the RSA public key is in source. The private key is Windows-DPAPI-protected locally, outside the Site repository. Secrets are never returned in plaintext to the browser or chat.

Important recovery boundary: DPAPI files depend on the original Windows account and machine. For recovery after losing this computer, personally run `work/export-portable-recovery.ps1`. It prompts privately for a password, uses PBKDF2-SHA256 (600,000 iterations) and AES-256-GCM, and bundles the latest backup plus the RSA recovery key. Store the encrypted output independently and its password separately. Creating that password-protected portable copy requires the user's private password entry; it is not done by the agent.

If bank secrets rotate, invoke the maintenance recovery action using the existing server-side scheduler credential, then take and export a fresh snapshot. Never replace the RSA public key without securely retaining its matching private key. The scheduler credential is deliberately excluded from the exported recovery envelope; recreate it after a disaster.

## Restore validation and disaster recovery

`tests/backup-restore.sql` restores every table from the latest snapshot into an isolated temporary schema, compares all rows including duplicates, and rolls back. It never overwrites production. This validates table-data recovery against the current schema, not a complete rebuild of a lost Supabase project.

For an actual recovery: preserve the current project, decrypt the backup privately, create a separate target project, reconstruct/review its schema using the preserved original backup and source migrations, restore auth identities and public data in dependency order, recreate RLS/policies/functions/edge configuration, restore secrets through Supabase's secret interface, and verify row counts, exact comparisons, and owner/partner isolation before switching the Site. Do not blindly replay the entire original migration history against an existing database. Reconnect banks if restoring old cursors/tokens no longer works. Never paste secrets into chat or commit recovery artifacts.

Validation performed: TypeScript check, household report tests, database tests for leases/replay/cursor rollback/failure alerts/private privileges, exact table-data restore, encrypted local backup round-trip, and bank-secret envelope decryption. Four real connections subsequently synced successfully; statement reconciliation remains the user's responsibility.
