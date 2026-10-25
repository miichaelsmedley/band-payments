import { describe, it, expect } from "vitest";
import {
  advanceState,
  configuredProvider,
  submissionAction,
} from "../src/lib/provider";
import { validateUpload } from "../src/lib/uploads";
describe("provider boundary", () => {
  it("never pretends an unconfigured provider is live", () =>
    expect(() => configuredProvider()).toThrow("No payment was submitted"));
  it("does not regress receipt on delayed processing events", () =>
    expect(advanceState("fund_received", "processing")).toBe("fund_received"));
  it("tracks returns separately from rejection", () => {
    expect(advanceState("fund_received", "returned")).toBe("returned");
    expect(advanceState("returned", "fund_received")).toBe("returned");
  });
  it("requires reconciliation after an attempt, including worker restart", () => {
    const job = {
      attempts: 0,
      startedAt: null,
      state: "queued",
      revoked: false,
      destinationChanged: false,
      environment: "sandbox",
    };
    expect(submissionAction(job, "sandbox")).toBe("submit");
    expect(
      submissionAction({ ...job, startedAt: "2026-10-19" }, "sandbox"),
    ).toBe("reconcile");
    expect(submissionAction({ ...job, attempts: 1 }, "sandbox")).toBe(
      "reconcile",
    );
    expect(submissionAction(job, "production")).toBe("block");
    expect(
      submissionAction({ ...job, destinationChanged: true }, "sandbox"),
    ).toBe("block");
  });
});
describe("upload boundary", () => {
  it("rejects MIME spoofing and executable files", () =>
    expect(() =>
      validateUpload(
        new TextEncoder().encode("<script>bad</script>"),
        "application/pdf",
      ),
    ).toThrow());
  it("recognises PDF bytes but does not claim they are malware free", () =>
    expect(
      validateUpload(new TextEncoder().encode("%PDF-1.4\n"), "application/pdf"),
    ).toBe("application/pdf"));
  it("enforces the size cap", () =>
    expect(() =>
      validateUpload(new Uint8Array(8 * 1024 * 1024 + 1), "image/png"),
    ).toThrow());
});
