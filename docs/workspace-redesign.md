# Workspace redesign

The AI and manual experiences share financial engines and saved records, while presenting different starting points. The user-scoped browser preference changes presentation only. It never enables a task, changes provider consent, hides a module, runs paid analysis, or edits the ledger.

AI starts with the next actionable task and saved work queues. Manual starts with reporting, transaction review and a searchable tool directory. `/overview` retains the original reporting overview; `/` is the new workspace home. `/receipts` opens the existing receipt matching engine independently, and all original transaction deep links remain supported. The detailed module setup is retained at `/setup?guided=1`; AI setup recognizes current connections and points to missing configuration without certifying financial completeness.

The design uses progressive disclosure (https://www.nngroup.com/articles/progressive-disclosure/) and task-oriented status lists (https://design-system.service.gov.uk/patterns/complete-multiple-tasks/). Optional evidence controls, dates and source-import methods are exposed in context. No background automation was introduced.

Verification covers all module combinations in the tool directory, route coverage and search; existing module and AI permission tests; desktop and phone browser checks for switching experience, setup, navigation and queue views. Paid calls and financial mutations are excluded from UI QA.
