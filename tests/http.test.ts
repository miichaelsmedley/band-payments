import { beforeAll, describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
const origin = process.env.APP_TEST_ORIGIN;
describe.skipIf(!origin)("Next.js HTTP workflow", () => {
  let cfg: any,
    managerCookie = "",
    playerCookie = "",
    admin: SupabaseClient,
    engagementId: string,
    documentId: string,
    invoiceId: string;
  const post = (
    path: string,
    body: any,
    cookie = "",
    requestOrigin = origin!,
  ) =>
    fetch(`${origin}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: requestOrigin,
        Cookie: cookie,
      },
      body: JSON.stringify(body),
    });
  beforeAll(async () => {
    if (origin !== "http://127.0.0.1:3417") throw Error("Local app test only");
    cfg = JSON.parse(readFileSync(".local/test-config.json", "utf8"));
    admin = createClient(cfg.url, cfg.service, {
      auth: { persistSession: false },
    });
    for (const role of ["manager", "player"]) {
      const r = await post("/api/auth", { action: "local", role });
      expect(r.status).toBe(200);
      const cookie = r.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join("; ");
      if (role === "manager") managerCookie = cookie;
      else playerCookie = cookie;
    }
    const e = await admin
      .schema("band_finance")
      .from("engagements")
      .select("id")
      .eq("gig_id", cfg.gig)
      .eq("person_id", cfg.player)
      .single();
    engagementId = e.data!.id;
  });
  it("rejects cookie mutations from a foreign origin", async () =>
    expect(
      (
        await post(
          "/api/v1/commands",
          {
            action: "calculate",
            workspaceId: cfg.workspace,
            gigId: cfg.gig,
            version: 1,
          },
          managerCookie,
          "https://untrusted.example",
        )
      ).status,
    ).toBe(403));
  it("rejects unauthenticated commands", async () =>
    expect(
      (
        await post("/api/v1/commands", {
          action: "calculate",
          workspaceId: cfg.workspace,
          gigId: cfg.gig,
          version: 1,
        })
      ).status,
    ).toBe(401));
  it("does not let a player calculate the entire budget", async () =>
    expect(
      (
        await post(
          "/api/v1/commands",
          {
            action: "calculate",
            workspaceId: cfg.workspace,
            gigId: cfg.gig,
            version: 1,
          },
          playerCookie,
        )
      ).status,
    ).toBe(403));
  it("reads the persisted draft for authoritative calculation", async () => {
    const g = await admin
      .schema("band_finance")
      .from("gigs")
      .select("version")
      .eq("id", cfg.gig)
      .single();
    const r = await post(
      "/api/v1/commands",
      {
        action: "calculate",
        workspaceId: cfg.workspace,
        gigId: cfg.gig,
        version: g.data!.version,
        result: { invoiceTotal: 0 },
      },
      managerCookie,
    );
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.data.result.invoiceTotal).toBeGreaterThan(0);
  });
  it("supports an own agreement response through the server", async () => {
    const e = await admin
      .schema("band_finance")
      .from("engagements")
      .select("version")
      .eq("id", engagementId)
      .single();
    const r = await post(
      "/api/v1/commands",
      {
        action: "agreement",
        workspaceId: cfg.workspace,
        engagementId,
        version: e.data!.version,
        response: "accepted",
        note: "",
      },
      playerCookie,
    );
    expect(r.status).toBe(200);
  });
  it("uploads an own invoice and prevents access before scanning", async () => {
    const prior = await admin
      .schema("band_finance")
      .from("invoices")
      .select("id,document_id")
      .eq("engagement_id", engagementId)
      .maybeSingle();
    if (prior.data) {
      invoiceId = prior.data.id;
      documentId = prior.data.document_id;
    } else {
      const f = new FormData();
      f.set("workspaceId", cfg.workspace);
      f.set("engagementId", engagementId);
      f.set("invoiceNumber", `TEST-${randomUUID().slice(0, 8)}`);
      f.set("amount", "350.00");
      f.set(
        "file",
        new Blob(
          [
            "%PDF-1.4\n% Synthetic upload fixture, not a real issued invoice\n%%EOF",
          ],
          { type: "application/pdf" },
        ),
        "synthetic-invoice.pdf",
      );
      const r = await fetch(`${origin}/api/v1/invoices`, {
        method: "POST",
        headers: { Origin: origin!, Cookie: playerCookie },
        body: f,
      });
      expect(r.status).toBe(200);
      invoiceId = (await r.json()).data.invoiceId;
      const row = await admin
        .schema("band_finance")
        .from("invoices")
        .select("document_id")
        .eq("id", invoiceId)
        .single();
      documentId = row.data!.document_id;
    }
    const download = await fetch(`${origin}/api/v1/documents/${documentId}`, {
      headers: { Cookie: playerCookie },
    });
    expect(download.status).toBe(409);
    const response = await download.json();
    expect(response.error.code).toBe("document_scan_required");
  });
  it("requires MFA before recording an invoice transfer", async () => {
    const before = await admin
      .schema("band_finance")
      .from("invoices")
      .select("id")
      .eq("engagement_id", engagementId);
    expect(before.data?.length).toBe(1);
    const r = await post(
      "/api/v1/commands",
      {
        action: "record_transfer",
        workspaceId: cfg.workspace,
        invoiceId,
        amount: 35000,
        paidDate: "2026-10-19",
        evidence: "Synthetic evidence",
      },
      managerCookie,
    );
    expect(r.status).toBe(403);
    expect((await r.json()).error.code).toBe("mfa_required");
  });
  it("requires MFA before recording super paid through the clearing house", async () => {
    const r = await post(
      "/api/v1/commands",
      {
        action: "record_external_super",
        workspaceId: cfg.workspace,
        engagementId,
        revisionId: randomUUID(),
        amount: 1200,
        qeDay: "2026-10-20",
        paidOn: "2026-10-22",
        reference: "SYNTHETIC-PORTAL",
        fundLabel: "AustralianSuper",
      },
      managerCookie,
    );
    expect(r.status).toBe(403);
    expect((await r.json()).error.code).toBe("mfa_required");
  });
  it("rejects member numbers in the fund name before reaching the database", async () => {
    const r = await post(
      "/api/v1/commands",
      {
        action: "record_external_super",
        workspaceId: cfg.workspace,
        engagementId,
        revisionId: randomUUID(),
        amount: 1200,
        qeDay: "2026-10-20",
        paidOn: "2026-10-22",
        reference: "SYNTHETIC-PORTAL",
        fundLabel: "Member 123456789",
      },
      managerCookie,
    );
    expect(r.status).toBe(400);
  });
  it("rejects unconfigured callback payloads without claiming success", async () => {
    const r = await fetch(`${origin}/api/v1/provider/callback`, {
      method: "POST",
      body: "{}",
    });
    expect(r.status).toBe(503);
  });
});
