# Run Millie

Home now presents the workflow control before the financial briefing. The AI
sidebar also links directly to it. **Run Millie across my enabled tools** is the
explicit opt-in to analysis across every task in currently visible tools, plus
the shared transaction/receipt foundation. Switching the AI/Manual workspace
alone changes presentation; it does not authorize paid work.

Starting checks the current provider/model, verified pricing, nonzero daily and
monthly limits, a current settings revision and the absence of an active lease.
It preserves dollar budgets, request allowances, automatic-save permissions,
receipt-use and web-research choices, hidden tools, and partner permissions.
Modules previously set to Manual become AI for their supported analysis tasks
when the user explicitly chooses this all-enabled workflow. Existing opt-ins
retain `workflow_scope=core` until that button is used.

The server processes one durable step per scheduled invocation. It includes
Gmail and receipts where permitted, open purchase categorization and timing,
oldest-quarter close preparation, merchant-pattern insights, and analysis of
budgets, runway, goals, reporting, sharing, rewards, income, investments, debt,
long-term plans, watchlists and recoveries in visible modules. Saved answers
take priority. Other task areas get a turn before another large receipt or
category batch. Module reviews use bounded evidence in the latest recorded
quarter; they never assert a complete reconciliation. Empty or incomplete
evidence produces questions rather than invented assumptions.

Complete, supported changes save only under the existing automatic-save
permissions; other results remain questions or proposals in **Needs you & saved
results**. Pattern analysis returns insights/questions and never creates merchant
rules. There is no automatic money movement, period close or sharing change.

Evidence and policy fingerprints prevent unchanged reviews from being sent
again just because time passed. Every call still reserves its maximum cost and
checks the shared request allowance. A pass can span several allowance windows;
the existing durable scheduler resumes it. Connections can use **dollar budgets
only**, with analysis counts shown as information, or retain an optional rolling
request-count cap. Existing connections keep their chosen cap until changed;
new connections default to dollar-only. Dollar reservations, verified pricing,
concurrency protection and all daily/monthly ceilings apply in both modes.
Receipt queues and the background planner honor the same mode. Changing modes
does not change dollar budgets. Pause prevents new stages; a provider
call already sent may finish.

In the expanded workflow, a failed paid request remains failed. Its transaction
or receipt batch, answer or failed module review is excluded from automatic
retries while independent work continues. The user can explicitly retry or leave
that saved task for manual review. Legacy core workflows keep their original
global failure gate. Neither deploying this feature nor opening Home opts a user
into the expanded workflow or performs a new paid analysis.

The visible task list summarizes recent checkpoints and pending questions,
including failed work. It is based on the latest 200 task records, not a
completion certificate for every financial record. New evidence can require
another check. Completed checkpoints refresh the financial data and receipt
review queue as well as the question inbox.

`npm run check:workflow` tests scope, permissions, failure isolation, fairness,
stable fingerprints and visible progress. `npm run test:workflow-sql` uses a
disposable local PostgreSQL database with synthetic provider metadata and a
dispatcher that records requests locally without making network calls. It tests
the actual opt-in, lease and scheduler functions, including unchanged budgets,
hidden tools, saved failures and legacy behavior. These checks run before every
website publication. Provider, assistant and cost-control fixtures remain part
of manual validation for orchestration changes.


### Models and API credits

Home’s workflow card and Customize → Models & credits show connected providers,
their selected models, and a direct provider switch. Changing a model uses the
saved encrypted key to list only available models with current verified pricing;
no key needs to be pasted again and listing does not purchase AI inference.
Switches preserve financial permissions, request-cap preferences, dollar budgets,
and completed checkpoints. A live call must finish before a switch; an entirely
unsent prepared task can be superseded, while metered work must recover first.

A credit is a manually entered remaining USD balance and inclusive UTC expiry date.
This is not a live provider balance or evidence that a grant covers a selected
model. Check grant eligibility with the provider. Millie subtracts subsequent
settled usage and all pending/uncertain reservations across that provider’s models.
Refresh the entered balance if other apps use the same credits. Saving a refreshed
balance checkpoints past settled charges without erasing pending reservations.

While credit tracking is enabled, the server blocks new calls when the credit is
expired or cannot cover the next maximum reservation. Existing cached results
remain accessible. Credit exhaustion waits for an explicit balance update,
provider switch, or removal of credit protection; it never silently falls back to
another provider. Shared daily/monthly budgets continue to count gross API usage,
including usage that a provider may cover with credits. Credits never raise those
limits, reset the ledger, force unnecessary work, or retry failed paid tasks.


### Automatic expiring-credit selection

The **Use expiring credits automatically** switch is an explicit opt-in for
background work. Existing users remain in manual mode. At a safe task boundary,
the server selects a connected model with valid pricing and recorded, unexpired
credit, ordered by expiry date. Ties keep the current provider where possible.

If the next maximum reservation cannot fit, no provider call is made. The task
is superseded only if it has no metered stage, and the next eligible credit is
considered on the next scheduler tick. A residual balance that cannot cover that
maximum stays tracked; it becomes eligible again when reservations clear or the
balance is refreshed enough to cover it. Expired, unpriced and untracked providers
are excluded. No eligible credit means a durable pause, not a paid fallback.

Existing leases and paid or uncertain work stay pinned for recovery. Routing does
not retry a paid failure, reset a failure stop, enable hidden tasks, alter evidence
permissions, increase dollar limits, or re-run completed financial checks. Both
shared dollar ceilings and any optional request caps remain enforced by the final
reservation. Choosing a provider manually turns automatic selection off.


### Failure recovery

Provider requests can run for up to 120 seconds, within the worker's outer
request window. GPT-6.1 Sol uses low reasoning effort while retaining the same
6,000-token maximum output reservation. A returned response is checkpointed with
owner-bound encryption before validation. A failed checkpointed response can be
revalidated under the current evidence contract using its original request ID,
without another provider call. Original policy and learning revisions still apply.

Each financial suggestion must pass the existing strict checks. Batch processing
preserves valid suggestions; invalid actions are withheld and become anchored
review questions where evidence permits. Duplicate financial actions are excluded.
Malformed whole responses still fail and stay recoverable for diagnosis.

An explicit retry-queue action authorizes one attempt per selected failed task.
It recovers saved responses first, preserves the prior attempt ID, and otherwise
uses a fresh ID on the selected provider. Repeated clicks do not duplicate the
queue. Each call still checks shared dollar budgets, credit protection, task
permissions and provider pricing. Prior uncertain charges remain held. Timeouts,
provider rejection and validation failures are recorded as readable private
failure messages; raw provider responses and keys never enter browser status.
