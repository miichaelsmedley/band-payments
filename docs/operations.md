# Operations and activation

## Clearinghouse deployment decision

**Live deployment remains blocked pending partner compatibility and acceptance.** Follow the evidence checklist in the [clearinghouse assessment](clearinghouse-research-2026-10-19.md). Public documentation or an employer account is insufficient: obtain written private-app eligibility, API terms, secure onboarding design and provider sandbox/acceptance results. The research did not enable submission or create an account.

## Environment boundaries

Local uses the dedicated `band-payments` Supabase project, ports 55431/55432 and web port 3417. It contains only synthetic users. The app does not read PRIS credentials or databases. Supabase CLI may expose local containers beyond loopback; restrict development host/network access and use synthetic data only. The web server binds to 127.0.0.1.

Staging must be a separate project with sandbox provider access and synthetic data. Production must be separately provisioned with live credentials held in server/Edge secret stores. Never copy `.local`, `.env.local` or a local database into production. The seed script refuses non-local URLs/ports; it is not a deployment seed. No provider spec or production hosting account was supplied for this build.

## Secrets and identity

Provision `NEXT_PUBLIC_SUPABASE_URL` and its publishable key, `APP_ENV`, `APP_ORIGIN` and `CALCULATION_SIGNING_KEY` separately in each environment. The publishable key is public; provider, worker, signing and service-role secrets are never NEXT_PUBLIC. Configure the matching signing key using an authorised database administration path; migrate the private configuration secret to managed Vault for production. RLS and explicit EXECUTE grants remain essential even with server checks.

Use verified hosted Supabase sessions. The SQL policy also requires an active `auth.sessions` row, so sign-out/revocation removes finance authority before JWT expiry. PRIS's custom tokens without that session relationship will deliberately fail. Linking PRIS needs a reviewed identity exchange, explicit band membership mapping and MFA semantics; do not disable the check to make a token work. Roles are assigned through a controlled admin process, not the public portal. Live role/payer admin UI and account recovery remain activation work.

Enable TOTP enrolment/verification, test lost-device recovery and configure secure password recovery email before live accounts. SMTP needs a verified sender domain, SPF/DKIM/DMARC and delivery failure handling. Creating a finance invitation does not send mail or create an Auth account; provision the verified account through the approved invitation workflow before handoff. No real invitations have been sent.

## Documents

Private bucket `band-documents`, UUID object paths, 8 MB PDF/JPEG/PNG. Every new invoice is pending_scan. Wire a scanner worker which reads actual bytes, records hash/scan version/outcome and changes status only using restricted worker authority. MIME headers alone are not malware verification. Until then, documents cannot be matched or downloaded. Add bounded orphan-object cleanup, corrections/replacement versions and retention enforcement before live use. No TFN, raw bank account or member number collection is enabled.

## Payment worker and outage handling

The durable job table stores a stable operation UUID before any provider request. Claim leases are atomic and expire after 60 seconds. The start marker is committed before IO. A restarted/expired post-start job may only reconcile the existing reference; unknown outcomes go to manual resolution, never a new operation key. Authority, payer version, environment, mandate approval expiry, current approver membership and destination verification must be rechecked before submission.

The generic bounded worker is unit tested; provider-specific repository/event application, retries/backoff, authenticated callbacks, correction/return handling and the actual Edge integration remain Stage 3. The deployed boundary is not enabled. Do not schedule Cron until those exist and sandbox failure tests pass. Configure short bounded polling; do not keep an HTTP request or browser open to wait for clearing.

On provider outage: preserve operation reference, stop fresh submission of uncertain items, query documented lookup, escalate with redacted correlation IDs. Never resend successful items from a partial batch. A mistaken destination requires review and a new linked correction, not editing a submitted snapshot. An external payment requires evidence and suppression of duplicate API execution; its command and item reconciliation are still implementation work.

## Monitoring and recovery

Assign an explicit responsible owner before activation. Query overdue leases, blocked/manual-reconciliation jobs, missing fund verification, documents waiting for scan, failed invitation deliveries and obligations approaching actual-payday deadlines. Configure alerts only to that owner through an approved channel. The current UI shows records and setup blockers; it is not an unattended alerting service. Provider health cannot be inferred from the app's health endpoint.

Target recovery must be agreed against the seven-business-day receipt rule and provider cut-offs. Suggested engineering target for review: restore service within four hours with a recovery point no older than one hour; this is not an achieved production SLA. Database backup is insufficient for Storage object bytes. Back up encrypted database state, immutable document objects and a checksum manifest; keep secret material separately under controlled recovery access.

Before deployment, perform a full isolated restore of database and objects, verify checksums, membership/RLS, immutable revisions and operation references, and ensure submission remains disabled until all provider outcomes are reconciled. `scripts/restore-drill.mjs` exercises local database/object restoration only. A local success does not prove hosted backup retention or recovery objectives.

## Remaining delivery work

Stage 0 review: written. Local foundation and substantial settlement/player workflows: implemented and tested. Stage 1 staging deployment, live identity integration, recovery/role administration and operational services: incomplete. Stage 2 invoice corrections, verified bank/fund collection, controlled invitation delivery/account provisioning, split payments, expense evidence workflows and externally handled reconciliation: incomplete. Stage 3 real provider sandbox: blocked on approved specification and access. Stages 4/5 live activation and real gig: not started.

Additional production gates: reviewed holiday calendar and exception rules; professional classification/original-agreement evidence; statutory caps and unusual earnings blocked; partner drawing treatment; provider support for cent adjustments; complete funding checks including other unpaid liabilities and reserves; legal payer/band selection; data-residency/retention/privacy review; actual gig, line-up, receipts and invoices. Do not postpone payments already due while waiting for this software.
