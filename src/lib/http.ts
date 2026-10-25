import { NextResponse } from "next/server";
export function requireOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!process.env.APP_ORIGIN || origin !== process.env.APP_ORIGIN)
    throw new Error("forbidden_origin");
}
export function errorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : "request_failed";
  const known: Record<string, [number, string]> = {
    mfa_setup_failed: [
      409,
      "Authenticator setup failed. Review your existing factors or contact the workspace owner.",
    ],
    mfa_code_invalid: [
      400,
      "That authenticator code could not be verified. Try a current code.",
    ],
    forbidden_origin: [403, "This request must come from the application."],
    unauthorised: [401, "Sign in again to continue."],
    forbidden: [403, "You do not have access to this action."],
    stale_version: [409, "This record changed. Reload it before saving again."],
    provider_and_deadline_setup_required: [
      503,
      "Clearinghouse access and reviewed deadline rules are required before preparing a pay run.",
    ],
    provider_unavailable: [
      503,
      "The clearinghouse is not connected. No payment was submitted.",
    ],
    mfa_required: [
      403,
      "Verify with multi-factor authentication before continuing.",
    ],
    approver_required: [
      403,
      "Only a designated approver can authorise this pay run.",
    ],
    invitation_unavailable: [
      400,
      "This invitation is expired, unavailable or belongs to another verified email.",
    ],
    document_scan_required: [
      409,
      "The document is quarantined until malware scanning completes.",
    ],
    bank_verification_required: [
      409,
      "A verified secure bank-payment reference is required.",
    ],
    invoice_amount_mismatch: [
      409,
      "The invoice amount does not match the validated revision.",
    ],
    transfer_already_recorded: [
      409,
      "A different transfer is already recorded for this invoice.",
    ],
    external_super_amount_mismatch: [
      409,
      "The super amount must exactly match the current validated revision. Nothing was recorded.",
    ],
    external_super_date_invalid: [
      400,
      "The clearing house payment date must be on or after the day the player was paid, and neither date can be in the future.",
    ],
    external_super_details_invalid: [
      400,
      "Enter the portal reference and the fund's name only. Do not enter member numbers, TFNs or bank details.",
    ],
    external_super_already_recorded: [
      409,
      "Different clearing house payment details are already recorded for this player's super.",
    ],
    super_already_in_pay_run: [
      409,
      "This super is already in a pay run in the app. Do not also record it as paid through the clearing house.",
    ],
    external_super_recorded: [
      409,
      "Super for this gig was paid through the clearing house. A pay run cannot include it again.",
    ],
    receipt_evidence_required: [
      400,
      "Enter the fund's receipt evidence, such as a statement or confirmation reference.",
    ],
    external_super_already_confirmed: [
      409,
      "Fund receipt is already confirmed with different evidence.",
    ],
    idempotency_conflict: [
      409,
      "This command key was already used for a different approval.",
    ],
    pay_run_locked: [
      409,
      "Revoke or reconcile the existing pay run before changing this gig.",
    ],
    engagement_removal_requires_review: [
      409,
      "Recorded engagements need a reviewed cancellation. Keep the engagement and request a correction.",
    ],
    upload_invalid: [400, "Upload a PDF, PNG or JPEG up to 8 MB."],
    configuration_required: [
      503,
      "The application is awaiting secure configuration.",
    ],
  };
  const [status, message] = known[code] ?? [
    400,
    "The request could not be completed. Check the details and try again.",
  ];
  return NextResponse.json(
    {
      error: {
        code: known[code] ? code : "validation_failed",
        message,
        correlationId: crypto.randomUUID(),
      },
    },
    { status },
  );
}
export function unwrap<T>(result: {
  data: T;
  error: { message: string; code?: string } | null;
}) {
  if (result.error)
    throw new Error(
      result.error.code === "42501" &&
        !["mfa_required", "approver_required"].includes(result.error.message)
        ? "forbidden"
        : result.error.message,
    );
  return result.data;
}
