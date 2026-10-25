# Deployment

The hosted app runs on **Cloudflare Workers** through the [OpenNext Cloudflare adapter](https://opennext.js.org/cloudflare), backed by a dedicated **hosted Supabase project** (Sydney region recommended for Australian users). Payment submission stays disabled in every environment until an approved clearinghouse integration exists.

## 1. Supabase project

Create a separate project; never share one with another application. Then:

1. Apply `supabase/migrations/` in order (`supabase db push`, or the Management API migrations endpoint). Never apply local seeds.
2. API settings: add `band_finance` to the exposed schemas.
3. Auth settings: disable signups, minimum password length 12, enable TOTP MFA enrol and verify, set the site URL and redirect allow-list to the app's origin, keep anonymous sign-ins and manual linking off.
4. Insert the private configuration row with a fresh random signing key and environment `production` (or `sandbox` for staging):

   ```sql
   insert into finance_private.configuration(id, signing_key, environment)
   values (true, '<64 random hex characters>', 'production');
   ```

   Generate the key on your machine, pipe it to both the database and the Worker secret, and never paste it into chat, tickets or logs.
5. Run the security advisor and confirm no findings.

## 2. Worker

`wrangler.jsonc` contains only non-secret defaults. Provide environment values as Worker secrets so they survive redeploys and stay out of Git:

```sh
wrangler secret put APP_ENV               # production or sandbox
wrangler secret put APP_ORIGIN            # https://your-app.example
wrangler secret put CALCULATION_SIGNING_KEY
```

`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are inlined at build time, so export them in the build shell. Build from a **clean checkout** with no `.env.local` or `.local/`, because Next.js loads `.env.local` during production builds:

```sh
git clone <repo> && cd band-payments && npm ci
export NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
export CLOUDFLARE_ACCOUNT_ID=<your account id>
npm run cf:build && npm run cf:deploy
```

Next.js 16 always runs `src/proxy.ts` (session refresh) on the Node.js runtime, which OpenNext marks as experimental on Cloudflare. Re-run the smoke checks below after every adapter or Next.js upgrade.

## 3. First owner

There is no public signup. Create the first workspace and owner with the controlled admin script, run in your own terminal so the password is typed at a hidden prompt:

```sh
SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=... node scripts/bootstrap-owner.mjs
```

Then sign in and enrol an authenticator app under Workspace setup before approving anything. The service-role key is used only for this step and never deployed to the Worker.

## 4. Smoke checks

After each deploy, confirm:

- `GET /api/health` reports payments disabled and provider unconfigured.
- Security headers are present (`no-store`, `DENY`, `nosniff`, `no-referrer`).
- Local account shortcuts return 403; a foreign `Origin` returns 403; anonymous commands return 401.
- The provider callback returns 503.
- Supabase rejects public signup and anonymous reads of `band_finance`.
- Sign in, refresh the page, sign out, and confirm the session is gone.

## Not yet production-ready

Player invitations need a custom SMTP sender (Supabase's built-in mail only reaches project team members). Invoice malware scanning, secure bank/fund collection, account recovery and the clearinghouse API remain open; see [operations](operations.md).
