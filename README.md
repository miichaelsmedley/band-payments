# Band Payments + Super

An open-source Next.js + Supabase app for small Australian bands that hire musicians and crew for occasional gigs. It settles gig receipts and costs, calculates eligible-contractor fees with GST and super exactly to the cent, lets players review their original agreement and upload invoices from a phone, and keeps invoice payments and super contributions separate and auditable.

**Status:** deployable and running with payments switched off. It does not submit super through a clearinghouse yet: that waits on an approved provider API (AustralianSuper's portal, provided by Wrkr/ClickSuper, is the route being qualified). It is not a payroll, BAS or tax system. Get professional advice on worker classification and super obligations.

Read [the architecture review](docs/architecture.md), [API contract](docs/api.md), [deployment](docs/deployment.md), [verification report](docs/verification.md) and [operations / remaining work](docs/operations.md). The [clearinghouse partner assessment](docs/clearinghouse-research-2026-10-19.md) records provider research and the evidence required before live submission.

## Run locally

Requirements: Node 22.12+ (or current supported stable), Docker, npm. Supabase CLI is pinned in development dependencies.

```sh
npm ci
npm run db:start
npm run local:setup
npm run dev
```

Open http://127.0.0.1:3417 and choose a synthetic manager, player or reviewer account. This uses real Supabase authentication and persistent Postgres records, not sessionStorage. Local account shortcuts are unavailable in production builds. Local passwords and keys are generated into ignored mode-0600 files; do not copy them into production.

The dedicated local Supabase API/database use ports 55431/55432, separate from existing PRIS. Stop only this project's services with `npm run db:stop`; the CLI preserves its data. `local:setup` can be rerun with its existing files and data. If a developer intentionally resets the whole local database, move `.local/accounts.json` aside first so synthetic Auth accounts can be recreated; do not reset an existing environment just to run tests.

## What works

- Manager, player and reviewer sign-in with current membership checks and database RLS. Session revocation is enforced in SQL; TOTP setup and verification are available in Workspace setup.
- Persistent gigs, itemised receipts and costs, venue withholding, reimbursements, retained savings, tax reserves, fixed fees, weighted allocations and partner drawings.
- Exact cent arithmetic, uniform GST, effective-dated 12% SG, explicit rounding residuals and immutable server-validated revisions.
- Roster, hashed expiring invitation codes, recipient/email binding, revocation and replay protection. Codes are created without sending email.
- Own-profile editing, original-agreement acceptance/correction requests, private issued-invoice upload and quarantine.
- Invoice matching and operator-recorded transfers behind verification/MFA gates. Scanning and secure bank verification must be configured before those gates can pass.
- Atomic approval/outbox SQL, lease/restart protections and a typed provider boundary. **No real provider adapter or fake green payment outcome.**

## Verify

```sh
npm run typecheck
npm test
# With the local dev server running, include HTTP workflows:
APP_TEST_ORIGIN=http://127.0.0.1:3417 npm test
npm run db:test
npm run build
node scripts/restore-drill.mjs
```

`npm test` runs finance/provider tests everywhere and local database integration tests when `.local/test-config.json` exists. Database tests require `local:setup`. SQL approval/worker tests roll back all their data and configuration changes. They do not transfer money. Tests cover isolated synthetic accounts only.

## Deployment

Cloudflare Workers (OpenNext) plus a dedicated hosted Supabase project. Follow [docs/deployment.md](docs/deployment.md): apply migrations, expose `band_finance`, lock down Auth, set Worker secrets, build from a clean checkout, create the first owner with `scripts/bootstrap-owner.mjs`, then run the smoke checks. Keep payment submission disabled. Never reuse the local seed or local secrets outside your machine.

Live use is still blocked on: custom SMTP for player invitations and account recovery, invoice malware scanning, secure bank/fund collection, an approved clearinghouse API, reviewed holiday/deadline rules, monitoring and tested hosted backups. See [operations](docs/operations.md).

## Contributing and security

Issues and pull requests are welcome. Keep money in integer cents, keep the guards fail-closed, and add tests with every change. Report vulnerabilities privately; see [SECURITY.md](SECURITY.md).

## Licence

[MIT](LICENSE)
