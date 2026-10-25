import type { Clearinghouse, Instruction, ProviderEvidence } from "./provider";
export interface JobLease {
  workspaceId: string;
  jobId: string;
  leaseToken: string;
  action: "submit" | "reconcile";
  instruction: Instruction;
}
export interface JobRepository {
  claim(): Promise<JobLease | null>;
  markStarted(lease: JobLease): Promise<void>;
  recordAccepted(lease: JobLease, reference: string): Promise<void>;
  applyEvidence(lease: JobLease, events: ProviderEvidence[]): Promise<void>;
  holdForManualReconciliation(lease: JobLease): Promise<void>;
}
/** One bounded job. The approved adapter and durable repository must be supplied by the worker. */
export async function runOneJob(
  repository: JobRepository,
  provider: Clearinghouse,
  runtime: "sandbox" | "production",
) {
  if (provider.environment !== runtime)
    throw Error("provider_environment_mismatch");
  const lease = await repository.claim();
  if (!lease) return { status: "idle" as const };
  if (lease.instruction.environment !== runtime)
    throw Error("job_environment_mismatch");
  if (lease.action === "reconcile") {
    try {
      const events = await provider.reconcile(lease.instruction.operationRef);
      if (!events.length) {
        await repository.holdForManualReconciliation(lease);
        return { status: "manual_reconciliation" as const };
      }
      await repository.applyEvidence(lease, events);
      return { status: "reconciled" as const };
    } catch {
      await repository.holdForManualReconciliation(lease);
      return { status: "manual_reconciliation" as const };
    }
  }
  // Persist the stable operation reference and uncertainty marker BEFORE network IO.
  // markStarted rechecks current authority and lease; a failure never calls the provider.
  await repository.markStarted(lease);
  try {
    const outcome = await provider.submit(lease.instruction);
    await repository.recordAccepted(lease, outcome.providerReference);
    return { status: "provider_accepted" as const };
  } catch {
    // Includes a crash-equivalent DB failure after provider acceptance: never resend.
    await repository.holdForManualReconciliation(lease);
    return { status: "manual_reconciliation" as const };
  }
}
