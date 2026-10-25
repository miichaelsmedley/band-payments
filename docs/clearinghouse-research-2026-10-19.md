# Clearinghouse partner assessment

Researched 19 October 2026 for Band Payments + Super. This is a technical and commercial shortlist, not a provider appointment or a live integration.

## Recommendation

The band has selected **AustralianSuper as the preferred route to pursue**, with clearing supplied by **Wrkr / ClickSuper**; one partner is already an AustralianSuper member. Prioritise its employer setup and private-app API qualification. Membership does not establish business registration or API permission. No provider has yet confirmed our application's eligibility, issued credentials or accepted this integration. Beam and SuperChoice remain researched alternatives, not the current first choice.

Beam has the most inspectable API contract found in this research. SuperChoice has a directly relevant music-industry integration announcement. The decisive unknown for all three is whether they will support a private application serving one small partnership at an acceptable cost. Public employer signup does not establish software-partner access.

## Small-band follow-up: AustralianSuper

AustralianSuper is a promising **portal option** for this band, subject to confirming employer eligibility. Its current offering is the Employer Portal with clearing provided by ClickSuper trading as Wrkr PAY; existing QuickSuper customers are being transitioned. The clearing house distributes contributions to different funds, so using it does not require all players to move their super to AustralianSuper. [Current clearinghouse offering](https://www.australiansuper.com/employers/paying-super/using-a-clearing-house).

Employer registration and portal use are advertised as free. The portal supports manual contribution entry, file uploads, payment tracking and report exports. This is a documented operational route, but not evidence of custom API access. [Employer Portal and registration](https://www.australiansuper.com/employers/why-register-with-us/employer-portal).

The organisation guide asks for business identification, whether AustralianSuper is the default fund, employee count, industry, payroll system, seasonal-employer status and payment frequency. Confirm the legal payer and the appropriate contractor-only partnership setup, including any default-fund requirement. A partner's membership does not establish other players' fund choices or whether his own contribution would be personal or employer-paid. [Organisation registration guide](https://aussuper.zendesk.com/hc/en-au/articles/51315742869273-Organisation-Registration).

The published SAFF upload specification includes `Contractor` as an employment status and documents both APRA and SMSF destinations. It specifies a CSV layout, including portal-required heading rows. This is useful compatibility evidence for a future export, not a completed or tested integration. It also requires personal and payment data beyond the app's current provider-reference model. [SAFF documentation](https://aussuper.zendesk.com/hc/en-au/articles/58643878379929-What-is-a-SAFF-file-and-how-do-I-use-it).

**API finding:** no public AustralianSuper contribution API contract or self-service API enrolment was found. Its clearinghouse page describes planned payroll/HR integrations without establishing access for our application. Wrkr separately confirms that its team scopes integrations and supplies API documentation. AustralianSuper employer access must not be treated as a Wrkr software-partner licence. [Wrkr software-provider integration](https://www.wrkr.com.au/software-providers).

### Other practical small-band options

- **Wrkr directly:** its small-business article lists $5.50/month for 0–2 employees and $7.70/month for 3–9, and confirms contractor contributions. This may suit a band that wants a standalone clearinghouse without a full payroll package. Confirm how occasional players are counted and fees during inactive months; those prices do not establish API rights. [Small-business offering](https://www.wrkr.com.au/resources/do-you-need-payroll-software-to-pay-super).
- **Media Super:** offers a clearinghouse to participating employers and explicitly serves entertainment and creative industries. Its portal supports different destination funds, manual updates and file uploads, regardless of employee count. The service is provided by SuperChoice. No custom API entitlement was established. Confirm participation/default-fund conditions. [Industry offering](https://www.mediasuper.com.au/employers/why-media-super), [payment workflow](https://www.mediasuper.com.au/employers/getting-started/pay-super-online), [SuperChoice provider confirmation](https://www.mediasuper.com.au/employers/getting-started/how-to-use-employer-portal).

### Decision for the app

Qualify AustralianSuper first as the requested small-band portal option. If a manager-operated portal is acceptable, a future workflow could prepare approved contributions, upload them, authorise funding in the portal and reconcile its results. That would be an explicit product choice; it does not replace the original API requirement automatically. Export generation, sensitive-data handling and reconciliation would still need implementation and validation.

For payments initiated inside our app, continue provider qualification and obtain written Wrkr/AustralianSuper API permission, the actual contract, test access and acceptance evidence. Live payment guards remain disabled.

AustralianSuper's published Employer Portal support route is `BusinessHelp@australiansuper.com`. Confirm the small band partnership's occasional-contractor setup and ask whether its employer registration can be connected to a private application through Wrkr's API. [Official contact source](https://www.australiansuper.com/-/media/australian-super/files/tools-and-advice/forms-and-fact-sheets/for-employers/fact-sheets/key-features-of-the-new-employer-portal.pdf). No enquiry or registration has been submitted.

### Recheck and setup checklist (25 October 2026)

AustralianSuper's portal, organisation, payment and SAFF guides and Wrkr's software-provider page were reopened on 25 October 2026 and remain consistent with the findings above. The ATO's Payday Super deadline page (updated 29 September 2026) confirms fund receipt within 7 business days of each payday, or 20 for a first contribution, and covers labour-only contractors and performers. Because API onboarding cannot finish inside that window, the first gig's super should be paid through the Employer Portal and recorded as handled externally. Business days exclude any public holiday that applies to a whole state or territory anywhere in Australia. A partner is generally not an employee of their own partnership, so partner drawings are not qualifying earnings; a partner's own super is a personal contribution outside this app (confirm with an accountant). [ATO payment deadlines](https://www.ato.gov.au/businesses-and-organisations/super-for-employers/paying-super-on-payday/payment-deadlines-for-payday-super).

### Setup sequence for the selected route

1. Confirm whether contributions are for engaged musicians/crew, a partner personally, or both. Confirm the legal payer's business name/ABN and any existing employer account. Personal voluntary contributions and band employer contributions must not be conflated.
2. For band contributions, use the [AustralianSuper employer registration](https://employer.australiansuper.com/register), or the existing employer account if there is one. Complete contact verification and MFA, then register the organisation. [User setup guide](https://aussuper.zendesk.com/hc/en-au/articles/51315838090521-Create-User-Account).
3. Complete the portal's required setup tasks, fund-choice/member verification and payment/refund arrangements. Enter sensitive identity, fund and bank information through approved provider screens. The payment guide offers direct debit, EFT, PayID and BPAY; direct debit requires identity and bank verification. [Payment setup](https://aussuper.zendesk.com/hc/en-au/articles/51754319154585-Set-Up-Contribution-Payments).
4. Obtain written confirmation of API access for this one-business private app, supported operations, fees and sandbox/UAT process. Employer registration alone does not complete this step.
5. Implement the agreed API contract, validate synthetic contributions and failure/reconciliation scenarios with the provider, then complete production approval and the app's remaining release gates. Any switch to a manager-operated upload workflow requires an explicit product decision and its own implementation/validation.

## Comparison

| Candidate         | Documentation and evidence                                                                                                                                                 | Access / membership                                                                                                                                                      | Commercial position                                                                                                                                                                   |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Beam              | Actual downloadable Swagger specification inspected; integration and acceptance-test guides are public.                                                                    | Software-partner Usage Agreement, separately issued test credentials, scheduled acceptance testing and a separate production process. Band registration is another step. | Partner page advertises no setup, software or per-user transaction charges for Super Payments. Obtain written applicability, exclusions and minimum-volume terms for our private app. |
| SuperChoice       | Contributions API offering confirmed; announced Muzeek integration on 24 June 2026 for live music and entertainment. A full public endpoint specification was not located. | DSP enquiry and provider-issued documentation/access needed. Ordinary SuperPay employer enrolment does not prove API rights.                                             | No published custom-integration quote verified. Request onboarding, minimum, recurring, transaction and support fees.                                                                 |
| Wrkr / ClickSuper | Published API, eligible-contractor, APRA/SMSF and member-verification capabilities. Full endpoint contract not located publicly.                                           | Integration is scoped with Wrkr's team. Its support guide distinguishes API credentials from portal login credentials.                                                   | Retail clearinghouse price is not a confirmed custom-API price.                                                                                                                       |

Sources: [Beam partner offer](https://beamconnect.com.au/become-a-partner/), [Beam integration process](https://precisionadmin-beamconnect.apigee.io/integration-process), [SuperChoice DSP offering](https://www.superchoiceservices.com/who/digital-service-providers/), [SuperChoice–Muzeek announcement](https://www.superchoiceservices.com/superchoice-and-muzeek-team-up-to-launch-a-super-contributions-api-for-australias-live-music-and-entertainment-industry-ahead-of-the-payday-super-deadline/), [Wrkr integrations](https://www.wrkr.com.au/software-providers), [ClickSuper API credential guide](https://support.clicksuper.com.au/hc/en-au/articles/53163021752217-Designating-OAUTH-or-V2-API-credentials).

[Wrkr's current retail price page](https://www.wrkr.com.au/pricing) lists $5.50/month for 0–2 employees, $7.70 for 3–9 and $13.20 for 10–19, including GST, per ABN and affiliate. How occasional contractors are counted, which services are included, and whether custom API use qualifies remain unconfirmed. No subscription was purchased.

## Beam: documents actually inspected

- [API catalogue](https://precisionadmin-beamconnect.apigee.io/all-apis)
- [Super Payments reference](https://precisionadmin-beamconnect.apigee.io/docs/beam-clearing-house---v2/1/overview)
- [Downloadable Swagger specification](https://precisionadmin-beamconnect.apigee.io/portals/api/sites/precisionadmin-beamconnect/liveportal/apis/beam-clearing-house---v2/download_spec)
- [Authentication](https://precisionadmin-beamconnect.apigee.io/authentication)
- [Partner integration process](https://precisionadmin-beamconnect.apigee.io/integration-process)
- [Acceptance readiness checklist](https://precisionadmin-beamconnect.apigee.io/super-payments/acceptance-testing-readiness-check)
- [Developer FAQs](https://precisionadmin-beamconnect.apigee.io/faqs)
- [Contribution status meanings](https://precisionadmin-beamconnect.apigee.io/super-payments/handling-process-status-updates)
- [Submission and timeout recovery](https://precisionadmin-beamconnect.apigee.io/super-payments/submitting-cancelling-a-contribution)

The downloaded YAML declares Swagger 2.0, document version `0.1`, an acceptance-environment host and `/clearing-house` base path. SHA-256: `1d48708a244ef367f998fd30d38349c9ad6bc31f75f832ebeec6c43ece0f8ae2`. A research copy is retained in ignored `.local/provider-research/beam-super-payments-spec.yaml`. The document version is not proof of the currently approved production contract.

Verified operations include validation, submission, member verification, participant setup, notification retrieval and lookup of payment instructions by process ID. `Member.employmentStatus` explicitly includes `CONTRACTOR`; SMSF data is modelled. The schema includes full member/fund data and a refund account, so our current reference-only instruction is insufficient by itself. These are schema observations, not tested service behaviour. [Specification](https://precisionadmin-beamconnect.apigee.io/docs/beam-clearing-house---v2/1/overview).

Beam documents environment-specific client credentials, server-side token acquisition and bearer-token requests. Its documented token lifetime is one hour. A centralised server deployment is the relevant model to discuss for our Next.js/worker architecture. No credentials were requested, generated or tested. [Authentication](https://precisionadmin-beamconnect.apigee.io/authentication).

The submission guide confirms that the caller supplies the batch `processId` and message identifiers. A timeout is resolved by querying that process: outcomes distinguish processing, processed and validation error. The guide also requires funding/refund details in each payload and separates validation warnings from blocking errors. Its field table marks date of birth mandatory although the downloaded schema's `Member.required` list omits it. Resolve that discrepancy with the provider; generated schema checks alone cannot establish acceptance. [Submission guide](https://precisionadmin-beamconnect.apigee.io/super-payments/submitting-cancelling-a-contribution).

Integration and Acceptance have separate credentials; Production is separate again. Initial development uses Integration, while Acceptance is used for coordinated end-to-end testing. Passing both parties' acceptance process precedes the go-live request. Public page visibility does not mean we have signed the agreement or obtained access. [Integration process](https://precisionadmin-beamconnect.apigee.io/integration-process).

## What membership means

There are three distinct relationships:

1. **Software partner:** permission for our application to use the provider's API, plus test access, support and production acceptance.
2. **Band / legal payer:** the partnership's clearinghouse registration, correct business details, payment method, refund account and relevant terms/mandate.
3. **Player / fund:** each person's existing fund destination and required verification. Provider access is not a reason to move a player to another fund.

Beam's employer registration guide requires a default fund and completion of its registration terms. Its developer FAQ explicitly says Australian Retirement Trust need not be the default. Confirm how that workflow applies to this eligible-contractor-only partnership. [Registration guide](https://beamconnect.com.au/register-to-pay-super-with-beam/), [FAQ](https://precisionadmin-beamconnect.apigee.io/faqs).

## Consequences for this application's design

These are engineering conclusions from comparing the retrieved material with `src/lib/provider.ts`; they are not completed changes:

| Area               | Required decision or implementation                                                                                                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Onboarding         | Separate employer/participant onboarding from player fund collection. A hosted employer wizard does not establish a hosted player form. Confirm an approved secure data path.                                             |
| Sensitive data     | Establish exactly which member, refund-account and SMSF fields our server must handle. Confirm whether reference-based submission is supported. Do not enable TFN collection merely because a schema contains that field. |
| Redirect security  | The retrieved participant setup description uses a JWT in a click-through URL. Resolve a supported flow consistent with our no-authentication-data-in-URLs requirement before implementation.                             |
| Notifications      | Implement durable polling with a saved cursor and deduplicated events where supported; do not require a webhook-only design.                                                                                              |
| Unknown submission | Bind our stable operation reference to the documented provider process identifier. Confirm duplicate rules and lookup retention, then test lost responses without double payment.                                         |
| Exact amounts      | Confirm monetary units, precision, rounding and cent adjustments before serialising our integer cents.                                                                                                                    |
| Current rules      | Obtain the approved current API version and mapping for actual payday/qualifying-earnings data, contractor categories and applicable exceptions.                                                                          |
| Refunds            | Support partial failures and an audited manual exception path, not just batch success/failure.                                                                                                                            |

Beam's status article distinguishes money received by Beam from transactions sent to destination funds. `SENT_TO_FUND` cannot be translated into our `fund_received` state without further evidence. Its FAQ also describes some manual refunds being reported through ServiceNow rather than the automated contribution feed. Both affect our reconciliation workflow. [Status guide](https://precisionadmin-beamconnect.apigee.io/super-payments/handling-process-status-updates), [Refund FAQ](https://precisionadmin-beamconnect.apigee.io/faqs).

The provider's readiness checklist covers token expiry, hosted registration changes and renewed terms, warnings/errors, timeouts, fund search, differing funding methods, under/overpayment, dishonours and individual SuperStream responses. Those become provider-specific acceptance tests in addition to our existing local tests. [Readiness checklist](https://precisionadmin-beamconnect.apigee.io/super-payments/acceptance-testing-readiness-check).

## Before live deployment

**Decision: not approved for live deployment.** Existing payment guards remain disabled. Finding documentation is a feasibility milestone, not acceptance evidence.

- [ ] Written acceptance of one small partnership and a private, occasional-gig application; scope excludes full payroll/STP unless separately required and agreed.
- [ ] Confirmed pricing, minimums, support arrangements and expected onboarding timeline.
- [ ] Reviewed software-partner agreement and applicable legal-payer terms; provider-issued sandbox credentials in secret storage.
- [ ] Approved current specification, contractor/APRA/SMSF data requirements and secure onboarding design.
- [ ] Adapter implemented and tested against the provider's own sandbox, including uncertain responses, changed destinations, returns and partial failures.
- [ ] Provider acceptance/sign-off and documented meaning of each displayed outcome.
- [ ] Separate production credentials/mandate, selected band and payer, and the application's other activation requirements completed.

## Contact routes and next action

- **Beam:** [partner contact](https://beamconnect.com.au/contact-us/). The developer FAQ lists `product@beamconnect.com.au` for developer credentials. Use the general partner route for initial eligibility; `onboard@beamconnect.com.au` is documented for an integration already under way.
- **SuperChoice:** `sales@superchoice.com.au`, published on its [contact page](https://www.superchoiceservices.com/contact/). Ask specifically about a direct Contributions API partnership and the Muzeek precedent.
- **Wrkr:** the integration enquiry/demo route on its [software-provider page](https://www.wrkr.com.au/software-providers). Ask for current ClickSuper/Wrkr API specifications and private-app commercial access.

The [partner qualification questions](clearinghouse-partner-questions.md) are ready for these discussions. No enquiries, account registrations, terms acceptances or payments were made during this research.
