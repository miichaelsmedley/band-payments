# Clearinghouse partner qualification questions

Prepared 19 October 2026. Unsent discussion brief. No provider has agreed to these requirements.

## Use case

A small Australian partnership operates a band and engages musicians and crew for occasional gigs. We are building a private Next.js/Supabase application for settlements, eligible-contractor super and player self-service. Initial scope is one legal payer; exact band, ABN and volumes will be confirmed. Player invoices are paid separately by manual bank transfer. We seek an API clearinghouse integration for super, without building a full payroll system or holding client money.

## Initial qualification

1. Will you accept a private application serving one small partnership as an API/software partner? What minimum employers, members, contribution volumes or revenue commitments apply?
2. Can it submit super for eligible contractor musicians and crew independently of employee payroll and STP? What classifications and contribution categories must be used?
3. What are the partner application, agreement, security review, certification/UAT and production-approval steps? What is the expected lead time?
4. Provide the full fee schedule: setup, API access, onboarding, monthly minimum, active/inactive contractor counting, transactions, verification, returns, support and GST. Are zero-gig months charged?
5. Provide the currently supported API specification, change policy, sandbox access process, test scenarios and technical contact. Credentials must be provisioned through secure channels, not pasted into correspondence.

## Technical confirmation before implementation

6. Which payer registration, identity checks, default-fund requirements and debit/refund mandates apply? Which funding methods and cut-offs are available to this integration?
7. Is there a hosted contractor fund-choice/verification flow? Which APRA, SMSF, member, refund-account and identity fields must our application collect, transmit or store? Can submissions use provider references only? Is a TFN mandatory in any supported case, and what is the approved missing-TFN path?
8. Can hosted onboarding avoid credentials/tokens in URLs? Describe redirect allowlists, expiry, consent/notice evidence and changed-detail verification.
9. Confirm monetary units and permitted precision, original fee treatment, rounding adjustments and fields for actual payday/qualifying earnings. What current schema version must be used?
10. Explain client-reference uniqueness, duplicate requests, lookup after a lost response, retention windows, retry limits and concurrent-submission behaviour. Can an unresolved result be held without resubmission?
11. Which notifications are polled versus pushed? Supply payload schemas, authentication, event IDs, cursor/retention rules, ordering and rate limits.
12. Which evidence proves a particular fund received a particular player's money? Distinguish clearinghouse funding, sending to a fund and confirmed receipt. How do partial rejection, late returns, corrections and manually handled refunds appear?
13. Confirm security/data-processing locations, subprocessors, retention/deletion, incident handling, support coverage and outage escalation.
14. What written acceptance evidence will you issue before production? Which tests must we repeat after API or regulatory changes?

## Provider-specific points

- **AustralianSuper / Wrkr employer portal (preferred route):** One partner is an AustralianSuper member. Confirm employer setup for one small partnership paying occasional contractor musicians whose chosen funds may differ. Is an AustralianSuper default-fund relationship required? Are there minimum participant/contribution requirements or inactivity rules? Can this employer registration be used by our private app through Wrkr's API, under which agreement and fees? If only portal uploads are available, confirm the current SAFF contract, required data, contribution identifiers and report-based reconciliation before we choose that separate workflow.
- **Media Super:** confirm participating-employer/default-fund conditions for a small band with players in other funds, any charges, and whether the SuperChoice portal relationship offers any supported API integration for a private app.
- **Beam:** confirm the advertised Super Payments fee position applies to this use case; current production specification/version; contractor-only employer registration; hosted employer versus member onboarding; manual-refund support responsibility; and precise receipt evidence beyond `SENT_TO_FUND`.
- **SuperChoice:** confirm whether the music/entertainment model described in the Muzeek announcement is available to an independent small private app; request the Contributions API and sandbox contract rather than only SuperPay portal enrolment.
- **Wrkr / ClickSuper:** confirm which API product/version to integrate, how the software-partner and employer accounts relate, and whether retail clearinghouse prices include any custom API rights.
