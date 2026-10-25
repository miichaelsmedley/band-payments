# Local verification — 19 October 2026

This report covers the isolated local application and synthetic records. It is not evidence of a deployed portal, a provider sandbox connection, production readiness or a real payment.

## Results

| Check                                            | Result         | Coverage                                                                                                     |
| ------------------------------------------------ | -------------- | ------------------------------------------------------------------------------------------------------------ |
| `npm run typecheck`                              | Passed         | Application and test types                                                                                   |
| `npm run build`                                  | Passed         | Next.js production compilation and route generation                                                          |
| `APP_TEST_ORIGIN=http://127.0.0.1:3417 npm test` | 72 passed      | Calculations, provider state rules, bounded worker recovery, uploads, real local Auth/RLS and HTTP workflows |
| `npm run db:test`                                | 11 passed      | Atomic approvals, idempotency, leases, uncertain submission, destination changes and revoked authority       |
| `node scripts/restore-drill.mjs`                 | Passed locally | Database restore, permissions/RLS, one private object and its checksum; submissions remained disabled        |

The restore receipt was recorded at `2026-10-19T06:02:15.371Z`. It verified one gig, one revision, 17 audit rows and 16 tables with RLS. Subsequent browser and HTTP checks created additional local activity. Ignored backups and their receipt remain under `.local/`; no backup or secret is included in Git.

## Authentication evidence

Supabase Auth provides password sign-in and TOTP MFA. Next.js uses `@supabase/ssr` with server-verified sessions and HttpOnly cookies. Mutations enforce the configured origin. Application commands check current workspace membership, while Postgres RLS and explicitly granted SQL functions independently enforce access. SQL requires a current native Auth session, so a signed-out JWT loses finance authority before its original expiry.

Tests exercised successful sign-in, incorrect MFA code rejection, correct MFA elevation, immediate session revocation, blocked public signup, player isolation, cross-workspace denial, forbidden direct writes and restricted worker functions. Approving a payment requires a designated current approver and an MFA-authenticated session. PRIS identity exchange, hosted account provisioning, password recovery and lost-authenticator recovery remain deployment work.

## Browser checks

The in-app browser was used at its approximately 648-pixel-wide panel viewport. The manager changed a receipt from $2,400 to $2,450, recalculated the settlement, saved revision 2 and received server validation. The player portal showed only the signed-in player's engagement, original agreement, invoice and separate super status. Sign-out and local role sign-in worked. This is not a claim of exhaustive desktop/device testing or a completed invitation-to-provider journey.

- [Manager settlement screenshot](screenshots/manager-settlement.png)
- [Player portal screenshot](screenshots/player-portal.png)

## Limits

No remote deployment, real invitations, PRIS connection or payment submission occurred. The clearinghouse adapter fails closed. Invoice uploads remain quarantined until a real scanner is connected. Bank/fund verification, provider callbacks and reconciliation, hosted recovery and monitoring still need implementation and configuration. The complete remaining delivery stages are in [operations](operations.md).
