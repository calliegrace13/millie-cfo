

# Phase 6: Three New Personas — CTO, CIO, CMO

Add three new role-based dashboards following the existing plug-and-play pattern.

---

## New Roles

| Role | Label | Tagline | Color (light) | Color (dark) | Icon |
|------|-------|---------|---------------|-------------|------|
| CTO | CTO | Technology | Purple (270°) | Purple | Monitor |
| CIO | CIO | Investments | Amber (35°) | Amber | LineChart |
| CMO | CMO | Marketing | Pink (330°) | Pink | Megaphone |

---

## CTO — Technology Dashboard

Manage your digital life: subscriptions, devices, passwords.

**Database tables:**
- `digital_subscriptions` — name, cost, billing_cycle, category (streaming/software/cloud/other), url, next_billing_date, is_active
- `device_inventory` — name, type (phone/laptop/tablet/watch/other), brand, model, purchase_date, warranty_end, serial_number, notes
- `credential_vault` — name, username, url, category, notes (NO actual passwords — just a reference tracker)

**Dashboard tabs:**
- **Subscriptions** — list/add/edit digital subscriptions, monthly cost total, upcoming renewals
- **Devices** — inventory of owned tech with warranty status
- **Credentials** — reference list of accounts/logins (not a password manager, just "where do I have accounts")

---

## CIO — Investments Dashboard

Track portfolio allocation and watchlists.

**Database tables:**
- `investment_holdings` — name, ticker, asset_class (stocks/bonds/crypto/real_estate/cash/other), quantity, cost_basis, current_value, account_id (optional link), notes
- `watchlist_items` — ticker, name, target_price, notes, is_active

**Dashboard tabs:**
- **Portfolio** — holdings list with allocation pie chart (by asset class), total value, gain/loss
- **Watchlist** — tickers you're monitoring with target prices
- Uses existing `accounts` table for investment-type accounts as a data source option

---

## CMO — Marketing / Personal Brand Dashboard

Track personal brand, networking, and content.

**Database tables:**
- `social_accounts` — platform (linkedin/twitter/instagram/youtube/tiktok/other), handle, url, follower_count, last_updated
- `content_calendar` — title, platform, scheduled_date, status (draft/scheduled/published), content_type (post/video/article/story), notes
- `networking_log` — contact_name, company, met_at, date, follow_up_date, notes, status (new/followed_up/connected)

**Dashboard tabs:**
- **Social Accounts** — track follower counts across platforms
- **Content Calendar** — plan and track content by date and platform
- **Networking** — log people you've met, follow-up reminders

---

## Implementation Details

**Files to create (9 new files):**
- `src/pages/CTODashboard.tsx`
- `src/pages/CIODashboard.tsx`
- `src/pages/CMODashboard.tsx`
- `src/components/cto/SubscriptionManager.tsx`
- `src/components/cto/DeviceInventory.tsx`
- `src/components/cto/CredentialTracker.tsx`
- `src/components/cio/PortfolioView.tsx`
- `src/components/cio/Watchlist.tsx`
- `src/components/cmo/ContentCalendar.tsx`

**Files to modify (4 files):**
- `src/lib/constants.ts` — add `cto | cio | cmo` to MillieRole union and MILLIE_ROLES array
- `src/index.css` — add 6 new theme blocks (3 roles × light + dark)
- `src/components/layout/AppLayout.tsx` — add nav items, icons, and dashboard routes for 3 new roles
- `src/App.tsx` — add routes for `/cto`, `/cio`, `/cmo` and sub-routes
- `src/pages/CEODashboard.tsx` — add CTO/CIO/CMO summary cards to CEO overview

**Database migrations (1 migration, 8 tables):**
- 8 new tables with RLS (users see own rows only)
- All tables: user_id uuid references auth.users, created_at, updated_at with trigger

**No edge functions needed** — all CRUD is client-side via Supabase SDK.


