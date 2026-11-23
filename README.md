# Millie CFO

The current customized Millie CFO: accounts and transactions, receipt evidence, Gmail syncing, AI assistance, financial reports, household sharing, planning, and configurable modules. MIT licensed. Copyright (c) 2026 Calvin.

This replaces the older starter app in this repository. Its history remains in Git. The customized source came from running Millie Site revision `a8c158c884cdc1ecad3c4775939b44b6a18947a5`.

## Edit in your browser

Open **Code → Codespaces** and create a **2-core** codespace. Dependencies install once, then the Millie preview starts on port 8080. Open **Ports → Millie CFO preview**. Keep the preview port private. Edit files in the browser and commit changes to preserve your work.

Before starting, confirm personal GitHub billing has a **$0 Codespaces budget with Stop usage enabled**. Use a 10-minute idle timeout, stop the codespace when finished, and delete unused codespaces after committing changes. Included compute and storage are limited; when exhausted, wait for the allowance to reset. Do not enable paid overages, prebuilds, larger machines, or a paid Copilot plan for this setup.

The always-free GitHub web editor opens when you press `.` on the repository page. It edits code but cannot run a preview.

## Run and check

Use Node.js 22.12 or newer. Run `npm ci`, then `npm run dev`. Build with `npm run build` and verify output with `npm run check:hosting`. Hosting tests use synthetic inputs and make no paid AI, Gmail, or bank calls.

## Free Cloudflare hosting

Live app: https://millie-cfo.calliegrace13.workers.dev

Use **Workers Free** and the included `workers.dev` address. The **Publish Millie to Cloudflare** GitHub Actions workflow builds, checks, and publishes changes pushed to `main`; it can also be run manually from **Actions**. Its repository variable `CLOUDFLARE_ACCOUNT_ID` identifies the account and its encrypted repository secret `CLOUDFLARE_API_TOKEN` authorizes deployment. The token has only Workers Scripts Edit and Account Settings Read permissions on this account and expires November 19, 2027. Renew that limited token in the repository secret before expiration. Do not use Cloudflare's broader automatically generated build token.

The configuration serves static assets and supports direct links and refreshes. It provisions no Worker script, database, bucket, AI service, or scheduler. Public-repository standard GitHub Actions builds and this static hosting use free allowances. GitHub has a $0 spending block. Do not upgrade Workers, add paid overages, or buy a domain for this setup.

The existing Supabase backend holds accounts, preferences, financial records, server functions, credentials, and scheduled work. This repository contains code, not those records or secrets. The public website uses Millie's existing account login and database access rules to protect records; no paid Cloudflare Access subscription is required. The original Site remains available during migration. Google OAuth callbacks, Supabase auth redirects, and the backend website allowlist include the new Cloudflare address. Keep the old callbacks until cutover is verified.

## Data and testing

The default browser configuration connects to the existing hosted Supabase project. **Signing in and editing data in a preview can change real records.** To test against a separate backend, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in an untracked `.env.local`. Never put service-role keys, bank tokens, Google client secrets, or AI provider keys in browser variables or GitHub.

Hosting and editing free tiers do not cover separate Supabase, Plaid, Google, or AI provider charges. Preserve existing allowances. Do not deploy all Supabase functions or migrations merely to publish the frontend, and do not create a second background scheduler in Codespaces or Cloudflare.

## Customize Millie

Use **Customize Millie** for modules and AI preferences, **Settings** for app settings, and the financial tools for saved records. Page layouts, styles, and features live in `src/` and can be edited in Codespaces. Saving a file changes the preview; publishing is a separate step.
