# Millie CFO

The current customized Millie CFO: accounts and transactions, receipt evidence, Gmail syncing, AI assistance, financial reports, household sharing, planning, and configurable modules. MIT licensed. Copyright (c) 2026 Calvin.

This replaces the older starter app in this repository. Its history remains in Git. The customized source came from running Millie Site revision `a8c158c884cdc1ecad3c4775939b44b6a18947a5`.

## Edit in your browser

Open **Code → Codespaces** and create a **2-core** codespace. Dependencies install once, then the Millie preview starts on port 8080. Open **Ports → Millie CFO preview**. Keep the preview port private. Edit files in the browser and commit changes to preserve your work.

Before starting, confirm personal GitHub billing has a **$0 Codespaces budget with Stop usage enabled**. Use a 10-minute idle timeout, stop the codespace when finished, and delete unused codespaces after committing changes. Included compute and storage are limited; when exhausted, wait for the allowance to reset. Do not enable paid overages, prebuilds, larger machines, or a paid Copilot plan for this setup.

The always-free GitHub web editor opens when you press `.` on the repository page. It edits code but cannot run a preview.

## Run and check

Use Node.js 22. Run `npm ci`, then `npm run dev`. Build with `npm run build` and verify output with `npm run check:hosting`. Hosting tests use synthetic inputs and make no paid AI, Gmail, or bank calls.

## Free Cloudflare hosting

Use **Workers Free** and the included `workers.dev` address. Connect this GitHub repository with build command `npm run build && npm run check:hosting` and deploy command `npm run deploy:cloudflare`. The configuration serves static assets and supports direct links and refreshes. It provisions no Worker script, database, bucket, AI service, or scheduler. Do not upgrade Workers or buy a domain for this setup.

The existing Supabase backend holds accounts, preferences, financial records, server functions, credentials, and scheduled work. This repository contains code, not those records or secrets. Keep the existing app running during migration. Set up owner-only access on the new host and verify login, saved settings, reports, Gmail, AI, and background work before switching the main URL. Update Google OAuth callbacks and Supabase auth redirects for the exact new URL; retain old callbacks until cutover is verified.

## Data and testing

The default browser configuration connects to the existing hosted Supabase project. **Signing in and editing data in a preview can change real records.** To test against a separate backend, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in an untracked `.env.local`. Never put service-role keys, bank tokens, Google client secrets, or AI provider keys in browser variables or GitHub.

Hosting and editing free tiers do not cover separate Supabase, Plaid, Google, or AI provider charges. Preserve existing allowances. Do not deploy all Supabase functions or migrations merely to publish the frontend, and do not create a second background scheduler in Codespaces or Cloudflare.

## Customize Millie

Use **Customize Millie** for modules and AI preferences, **Settings** for app settings, and the financial tools for saved records. Page layouts, styles, and features live in `src/` and can be edited in Codespaces. Saving a file changes the preview; publishing is a separate step.
