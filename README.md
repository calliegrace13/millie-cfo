# Millie CFO

Millie CFO tracks accounts, spending, budgets, and cash flow. You can run the web app on your computer with its own local database. Manual accounts work without a Plaid subscription. The optional bank connection uses your own Plaid credentials.

## Run locally

Install Node.js 22 or newer and start Docker Desktop or a compatible container runtime. From the repository directory, run:

```sh
npm ci
npx supabase start
npx supabase status
```

Copy `.env.example` to `.env.local`. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` to the local API URL and publishable key printed by Supabase. If your CLI shows an anon key instead, use that as the browser key.

```sh
npm run dev -- --host localhost --port 8080 --strictPort
```

Open [Millie CFO on localhost](http://localhost:8080), create a local account, then choose **Accounts → Manual Account**. If signup requires email confirmation, use the local mail inbox URL shown by `npx supabase status`. Each local instance starts with its own database.

## Optional Plaid Sandbox

Copy `supabase/functions/.env.example` to `supabase/functions/.env` and set your Plaid Sandbox client ID, Sandbox secret, and a persistent random encryption key. Keep that encryption key with your deployment so previously stored connection tokens can still be decrypted. Set `VITE_ENABLE_PLAID=true` in `.env.local`, restart Vite, and restart the local Supabase stack with `npx supabase stop` followed by `npx supabase start`.

Keep the Plaid secret, encryption key, and Supabase service role key on the server. Vite bundles variables beginning with `VITE_` into the browser app. Only put the Supabase URL and browser key in the front-end settings.

Run the Plaid unit tests with `node --test supabase/tests/plaid-ledger.test.mjs`. Run the SQL regression script against a disposable Supabase database after applying migrations.

## Build the web app

Set the front-end environment variables for your own Supabase project and run `npm run build`. The build output is in `dist`. For hosting, serve the output over HTTPS and configure the host to route app paths back to `index.html`. Apply the Supabase migrations and deploy the functions you use to your own backend. Configure Supabase Auth's site URL and password reset redirect for your deployed origin. If using Plaid, include that origin in the Edge Functions' `PLAID_ALLOWED_ORIGINS` and configure the credentials there.

## Build an Android or iOS app

Capacitor packages the contents of `dist` into a native app. It still needs a reachable Supabase backend. A physical device cannot use your computer's `localhost` as its backend. For a phone build, configure your own device-reachable HTTPS Supabase endpoint before building.

```sh
npm run build
npx cap add android
npx cap sync android
npx cap open android
```

The add command is a one-time setup. Use Android Studio to run or sign the build. For iOS, use macOS with Xcode and substitute `ios` for `android`. These steps create a native build project. Validate native authentication, password reset, and any enabled bank flow on the target device before distributing a signed build.
