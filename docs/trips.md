# Trips and travel receipt matching

Trips are an independent, private domain attached to the Goals module. `/trips` uses owner-scoped `finance_trips`, `finance_trip_links`, `finance_trip_receipts` and an append-only history. RPCs enforce ownership and optimistic revisions; browser clients cannot write these tables directly.

## Assignment order

Manual assignments and exclusions always win. Archived trips and disabled matching retain saved links. Otherwise, a complete travel receipt with one matching posted charge and one enclosing trip takes precedence over purchase-date matching. One purchase can belong to one trip. Overlapping trips and duplicate bank charges wait for a user decision. Account filters apply to automatic matches; manual choices can deliberately include another owned account. Existing event tags and life-project membership remain unchanged.

A transaction trigger handles later bank imports and corrections. Saving trip dates, completing receipt analysis, or selecting Check new matches reconciles existing candidates. All comparisons are inclusive calendar dates. Travel legs must all fit a single trip; dates are never inferred from the email timestamp. Full days use the imported bank date, so late posting may need a manual assignment.

## Gmail and AI

Read-only Gmail search now includes itineraries, flight confirmations, e-tickets and booking/reservation confirmations. Existing syncing/retention/consent limits remain unchanged. Syncing alone never calls an AI provider. The existing explicit receipt-analysis action extracts evidenced flight/stay/rail/car dates in the same paid request, under the same request limit. Each date must be supported by a literal date quote and travel context. Incomplete or ambiguous travel evidence is discarded while the purchase can still be reviewed normally. Receipts without a supported purchase date, total/currency or merchant cannot auto-match a bank charge; use manual assignment.

Successful receipt analysis stores a private travel summary and deterministically matches it to bank transactions (same amount/currency, merchant evidence, purchase date -1/+10 days). New analyses use receipt contract version 3; existing request IDs retain version-2 replay so unfinished work is not charged again. To extract travel dates from an old cached analysis, begin a new analysis. Receipt matching must be enabled in Transactions AI settings, and automatic travel matching is opt-in per trip. No new mailbox permission, provider, cloud schedule or always-on AI agent is introduced.

## Accounting and history

Trip tags do not change bank dates, amounts, categories, review status, amortization, household shares or held closes. The trip view is purchase-cost tracking, grouped by currency, with personal shares calculated at each source transaction date. Existing linked refunds reduce costs exactly once. It is deliberately distinct from a period income statement, which may recognize expenses on an amortization schedule. Unavailable or currently excluded linked transactions are flagged rather than replaced with zero and described as complete. Snapshots and assignment history remain private and persisted; archives do not delete links.

## Verification

`tests/trips.mjs` covers inclusive dates, overlapping trips, account scope, advance booking dates, currencies, dated shares, refunds, unchanged ledger data and travel evidence. `tests/trips-security.sql` uses rolled-back synthetic fixtures to verify owner isolation, restricted writes, stale revision rejection, automatic and manual linking, duplicate handling, archive preservation and unchanged bank facts. Existing receipt/provider/Gmail/matching and accounting tests are also retained. No paid AI or personal mailbox analysis is performed by these tests.

## Suggested trips
The Trips page groups unassigned analyzed travel receipts by overlapping travel dates and prefills a draft. Users can combine separate groups or extend an existing active trip, then edit and save using the same revision-checked RPC. Suggestions exclude dismissed/resolved bookings and date ranges already covered by saved trips. One-way flights remain one-day evidence until the user supplies the rest. No additional AI requests occur in this step; Gmail sync and explicit receipt analysis remain the source of evidence.
