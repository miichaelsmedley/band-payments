export type ContributionState =
  | "queued"
  | "submission_uncertain"
  | "provider_accepted"
  | "funding_pending"
  | "processing"
  | "fund_received"
  | "rejected"
  | "returned"
  | "manual_reconciliation"
  | "handled_externally";
export type Instruction = {
  operationRef: string;
  environment: "sandbox" | "production";
  digest: string;
  employerRef: string;
  payday: string;
  items: {
    id: string;
    memberRef: string;
    destinationVersion: number;
    amountCents: number;
  }[];
};
export type ProviderEvidence = {
  eventId: string;
  operationRef: string;
  itemId: string;
  state: ContributionState;
  reference: string;
  occurredAt: string;
};
/** Application boundary only. No method implies an actual provider endpoint. */
export interface Clearinghouse {
  readonly name: string;
  readonly environment: "sandbox" | "production";
  employerStatus(
    reference: string,
  ): Promise<{ ready: boolean; mandateRef?: string }>;
  startMemberOnboarding(
    personRef: string,
  ): Promise<{ hostedUrl: string; expiresAt: string }>;
  verifyMember(
    reference: string,
  ): Promise<{ verified: boolean; destinationVersion: number }>;
  validate(
    instruction: Instruction,
  ): Promise<{ valid: boolean; issues: string[] }>;
  submit(
    instruction: Instruction,
  ): Promise<{ providerReference: string; state: "provider_accepted" }>;
  reconcile(operationRef: string): Promise<ProviderEvidence[]>;
  authenticateCallback(
    rawBody: Uint8Array,
    headers: Headers,
  ): Promise<ProviderEvidence[]>;
  requestCorrection(
    originalReference: string,
    revisionRef: string,
  ): Promise<{ supported: boolean; reference?: string }>;
}
export class ProviderUnavailable extends Error {
  constructor() {
    super(
      "An approved clearinghouse API is not configured. No payment was submitted.",
    );
  }
}
export function configuredProvider(): Clearinghouse {
  throw new ProviderUnavailable();
}
const transitions: Record<ContributionState, ContributionState[]> = {
  queued: [
    "submission_uncertain",
    "provider_accepted",
    "manual_reconciliation",
    "handled_externally",
  ],
  submission_uncertain: [
    "provider_accepted",
    "funding_pending",
    "processing",
    "fund_received",
    "rejected",
    "manual_reconciliation",
  ],
  provider_accepted: [
    "funding_pending",
    "processing",
    "fund_received",
    "rejected",
    "manual_reconciliation",
  ],
  funding_pending: [
    "processing",
    "fund_received",
    "rejected",
    "manual_reconciliation",
  ],
  processing: ["fund_received", "rejected", "manual_reconciliation"],
  fund_received: ["returned"],
  rejected: [],
  returned: [],
  manual_reconciliation: [
    "provider_accepted",
    "funding_pending",
    "processing",
    "fund_received",
    "rejected",
    "handled_externally",
  ],
  handled_externally: [],
};
export function advanceState(
  current: ContributionState,
  incoming: ContributionState,
) {
  return transitions[current].includes(incoming) ? incoming : current;
}
export function submissionAction(
  job: {
    attempts: number;
    startedAt: string | null;
    state: string;
    revoked: boolean;
    destinationChanged: boolean;
    environment: string;
  },
  runtime: string,
) {
  if (job.revoked || job.destinationChanged || job.environment !== runtime)
    return "block";
  if (job.startedAt || job.attempts > 0 || job.state === "submission_uncertain")
    return "reconcile";
  return "submit";
}
