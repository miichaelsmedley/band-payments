import { it, expect, vi } from "vitest";
import {
  runOneJob,
  type JobLease,
  type JobRepository,
} from "../src/lib/worker";
import type { Clearinghouse } from "../src/lib/provider";
const lease: JobLease = {
  workspaceId: "w",
  jobId: "j",
  leaseToken: "l",
  action: "submit",
  instruction: {
    operationRef: "stable-op",
    environment: "sandbox",
    digest: "approved",
    employerRef: "synthetic",
    payday: "2026-10-26",
    items: [
      {
        id: "i",
        memberRef: "synthetic",
        destinationVersion: 1,
        amountCents: 1200,
      },
    ],
  },
};
function fixture() {
  const order: string[] = [];
  const repository: JobRepository = {
    claim: vi.fn(async () => structuredClone(lease)),
    markStarted: vi.fn(async () => {
      order.push("started");
    }),
    recordAccepted: vi.fn(async () => {
      order.push("accepted");
    }),
    applyEvidence: vi.fn(async () => {}),
    holdForManualReconciliation: vi.fn(async () => {}),
  };
  const provider = {
    environment: "sandbox",
    submit: vi.fn(async () => {
      order.push("network");
      return {
        providerReference: "fixture-reference",
        state: "provider_accepted",
      };
    }),
    reconcile: vi.fn(async () => []),
  } as unknown as Clearinghouse;
  return { repository, provider, order };
}
it("marks the durable attempt before the provider call and preserves approved cents", async () => {
  const f = fixture();
  expect(await runOneJob(f.repository, f.provider, "sandbox")).toEqual({
    status: "provider_accepted",
  });
  expect(f.order).toEqual(["started", "network", "accepted"]);
  expect(f.provider.submit).toHaveBeenCalledWith(lease.instruction);
});
it("never retries submission after a timeout", async () => {
  const f = fixture();
  vi.mocked(f.provider.submit).mockRejectedValue(new Error("timeout"));
  expect(await runOneJob(f.repository, f.provider, "sandbox")).toEqual({
    status: "manual_reconciliation",
  });
  expect(f.provider.submit).toHaveBeenCalledTimes(1);
  expect(f.repository.holdForManualReconciliation).toHaveBeenCalledTimes(1);
});
it("handles database failure after provider acceptance as an uncertain outcome", async () => {
  const f = fixture();
  vi.mocked(f.repository.recordAccepted).mockRejectedValue(
    new Error("database unavailable"),
  );
  expect(await runOneJob(f.repository, f.provider, "sandbox")).toEqual({
    status: "manual_reconciliation",
  });
  expect(f.provider.submit).toHaveBeenCalledTimes(1);
});
it("uses the same operation reference after a worker restart", async () => {
  const f = fixture();
  vi.mocked(f.repository.claim).mockResolvedValue({
    ...lease,
    action: "reconcile",
  });
  await runOneJob(f.repository, f.provider, "sandbox");
  expect(f.provider.reconcile).toHaveBeenCalledWith("stable-op");
  expect(f.provider.submit).not.toHaveBeenCalled();
});
it("does not submit after revocation or loss of lease", async () => {
  const f = fixture();
  vi.mocked(f.repository.markStarted).mockRejectedValue(
    new Error("authority_changed"),
  );
  await expect(
    runOneJob(f.repository, f.provider, "sandbox"),
  ).rejects.toThrow();
  expect(f.provider.submit).not.toHaveBeenCalled();
});
it("rejects sandbox providers in production before claiming work", async () => {
  const f = fixture();
  await expect(
    runOneJob(f.repository, f.provider, "production"),
  ).rejects.toThrow();
  expect(f.repository.claim).not.toHaveBeenCalled();
});
