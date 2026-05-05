# Supabase setup

This project is prepared for cloud sync scaffolding.

## 1) Create a Supabase project
Create a hosted project in Supabase.

## 2) Enable email auth
Email auth is supported by Supabase Auth. Magic link / passwordless login is available through `signInWithOtp`. Configure your Site URL and redirect URLs in the Supabase dashboard. See the official docs for passwordless email logins and redirect URL behavior. citeturn383296search2turn536870search5

Recommended redirect URLs:
- your Vercel production URL
- localhost dev URL if you run locally

## 3) Run the SQL schema
Open the SQL editor in Supabase and run:
- `supabase/planner_schema.sql`

RLS is required for browser access to public-schema tables. Supabase documents that RLS must be enabled and policies should key off `auth.uid()` for per-user access. citeturn383296search3

## 4) Add environment variables
Set these in Vercel and local `.env.local`:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Supabase documents using the project URL and publishable/anon key when creating a browser client with `createClient`. citeturn818600search0turn818600search3

## 5) Install dependencies
Run:
- `npm install`

Supabase documents installing the JavaScript client with `npm install @supabase/supabase-js`. citeturn818600search0

## 6) App-side wiring status
Already added in repo:
- `src/lib/supabase.ts`
- `src/lib/cloudPlanner.ts`
- `.env.example`
- `supabase/planner_schema.sql`

Not yet wired into the UI:
- login screen
- sign out button
- load-on-login
- auto-save debounce to cloud
- cloud/local conflict handling

## 7) What remains
After you create the project and have your URL + anon key available, the next patch can wire the current planner UI to:
- send magic links
- detect auth session changes
- load the user's latest planner row
- upsert planner state automatically
- keep JSON export/import as manual backup
