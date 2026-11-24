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
the existing durable scheduler resumes it. Pause prevents new stages; a provider
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
