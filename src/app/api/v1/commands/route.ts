import { NextResponse } from "next/server";
import { createHmac, randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import { draftSchema, settle, localDate } from "@/lib/finance";
import { supabase } from "@/lib/supabase";
import { requireOrigin, errorResponse, unwrap } from "@/lib/http";
export const runtime = "nodejs";
const uuid = z.string().uuid();
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 128000) throw new Error("payload_too_large");
    const body = JSON.parse(raw);
    const client = await supabase();
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user) throw new Error("unauthorised");
    const db = client.schema("band_finance");
    if (body.action === "claim_invitation") {
      const token = z.string().min(40).max(100).parse(body.token);
      const data = unwrap(
        await db.rpc("claim_invitation", {
          hashed_token: createHash("sha256").update(token).digest("hex"),
        }),
      );
      return NextResponse.json({ data });
    }
    const w = uuid.parse(body.workspaceId);
    const membership = unwrap(
      await db
        .from("memberships")
        .select("role,can_approve")
        .eq("workspace_id", w)
        .eq("user_id", user.id)
        .single(),
    );
    if (!membership) throw new Error("forbidden");
    let data: unknown;
    switch (body.action) {
      case "save_draft": {
        const payload = draftSchema.parse(body.draft);
        data = unwrap(
          await db.rpc("save_draft", {
            w,
            gig: uuid.parse(body.gigId),
            expected_version: z.number().int().min(0).parse(body.version),
            payload,
          }),
        );
        break;
      }
      case "calculate": {
        if (!["owner", "finance_manager"].includes(membership.role))
          throw new Error("forbidden");
        const g = unwrap(
          await db
            .from("gigs")
            .select("*")
            .eq("workspace_id", w)
            .eq("id", uuid.parse(body.gigId))
            .single(),
        );
        if (body.version !== g.version) throw new Error("stale_version");
        const input = draftSchema.parse(g.draft);
        const result = settle(input);
        if (!process.env.CALCULATION_SIGNING_KEY)
          throw new Error("configuration_required");
        const payloadText = JSON.stringify({
          workspaceId: w,
          gigId: g.id,
          version: g.version,
          actorId: user.id,
          expiresAt: new Date(Date.now() + 60000).toISOString(),
          input,
          result,
        });
        const signature = createHmac(
          "sha256",
          process.env.CALCULATION_SIGNING_KEY,
        )
          .update(payloadText)
          .digest("hex");
        data = {
          revisionId: unwrap(
            await db.rpc("commit_revision", {
              payload_text: payloadText,
              signature,
            }),
          ),
          result,
        };
        break;
      }
      case "add_person":
        data = unwrap(
          await db.rpc("add_person", {
            w,
            person_name: z.string().min(1).max(120).parse(body.name),
            person_email: z.email().parse(body.email),
          }),
        );
        break;
      case "create_invitation": {
        const token = randomBytes(32).toString("base64url");
        const invitationId = unwrap(
          await db.rpc("create_invitation", {
            w,
            gig: uuid.parse(body.gigId),
            person: uuid.parse(body.personId),
            hashed_token: createHash("sha256").update(token).digest("hex"),
          }),
        );
        data = { invitationId, token, deliveryStatus: "not_sent" };
        break;
      }
      case "revoke_invitation":
        data = unwrap(
          await db.rpc("revoke_invitation", {
            w,
            invitation: uuid.parse(body.invitationId),
          }),
        );
        break;
      case "profile":
        data = unwrap(
          await db.rpc("update_profile", {
            w,
            person: uuid.parse(body.personId),
            expected_version: z.number().int().positive().parse(body.version),
            legal_name: z.string().min(1).max(120).parse(body.name),
            abn_value: z
              .string()
              .regex(/^(\d{11})?$/)
              .parse(body.abn),
            gst: z.boolean().parse(body.gst),
            notice_accepted: z.literal(true).parse(body.notice),
          }),
        );
        break;
      case "agreement":
        data = unwrap(
          await db.rpc("respond_agreement", {
            w,
            engagement: uuid.parse(body.engagementId),
            expected_version: z.number().int().positive().parse(body.version),
            response_value: z
              .enum(["accepted", "correction_requested"])
              .parse(body.response),
            note: z.string().max(2000).parse(body.note),
          }),
        );
        break;
      case "review_invoice":
        data = unwrap(
          await db.rpc("review_invoice", {
            w,
            invoice: uuid.parse(body.invoiceId),
            revision: uuid.parse(body.revisionId),
          }),
        );
        break;
      case "record_transfer":
        data = unwrap(
          await db.rpc("record_transfer", {
            w,
            invoice: uuid.parse(body.invoiceId),
            amount: z.number().int().positive().max(1e9).parse(body.amount),
            paid_date: localDate.parse(body.paidDate),
            evidence: z.string().min(3).max(500).parse(body.evidence),
          }),
        );
        break;
      case "record_external_super":
        data = unwrap(
          await db.rpc("record_external_super", {
            w,
            engagement: uuid.parse(body.engagementId),
            revision: uuid.parse(body.revisionId),
            amount: z.number().int().positive().max(1e9).parse(body.amount),
            qe_day: localDate.parse(body.qeDay),
            paid_on: localDate.parse(body.paidOn),
            reference: z.string().trim().min(1).max(100).parse(body.reference),
            fund_label: z
              .string()
              .trim()
              .min(1)
              .max(120)
              .refine((v) => !/\d{5,}/.test(v))
              .parse(body.fundLabel),
          }),
        );
        break;
      case "confirm_external_super_receipt":
        data = unwrap(
          await db.rpc("confirm_external_super_receipt", {
            w,
            id: uuid.parse(body.externalSuperId),
            evidence: z.string().trim().min(3).max(500).parse(body.evidence),
          }),
        );
        break;
      case "prepare_run":
        data = unwrap(
          await db.rpc("prepare_run", {
            w,
            revision: uuid.parse(body.revisionId),
            funding_available: z
              .number()
              .int()
              .min(0)
              .max(1e9)
              .parse(body.funding),
            funding_evidence: z.string().min(3).max(500).parse(body.evidence),
          }),
        );
        break;
      case "authorise_run":
        data = unwrap(
          await db.rpc("authorise_run", {
            w,
            run: uuid.parse(body.runId),
            expected_digest: z.string().length(64).parse(body.digest),
            command_key: uuid.parse(body.idempotencyKey),
          }),
        );
        break;
      default:
        throw new Error("unsupported_command");
    }
    return NextResponse.json({ data });
  } catch (e) {
    if (e instanceof Error && "code" in e && typeof e.code === "string")
      return NextResponse.json(
        { error: { code: e.code, message: e.message } },
        { status: 422 },
      );
    return errorResponse(e);
  }
}
