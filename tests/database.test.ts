import { beforeAll, describe, it, expect } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { settle, type Draft } from "../src/lib/finance";
const enabled = existsSync(".local/test-config.json");
describe.skipIf(!enabled)("real local Supabase access and workflows", () => {
  let cfg: any,
    accounts: any,
    manager: SupabaseClient,
    player: SupabaseClient,
    outsider: SupabaseClient,
    reviewer: SupabaseClient,
    admin: SupabaseClient;
  let draft: Draft, gigId: string, version: number;
  beforeAll(async () => {
    cfg = JSON.parse(readFileSync(".local/test-config.json", "utf8"));
    accounts = JSON.parse(readFileSync(".local/accounts.json", "utf8"));
    if (!cfg.url.startsWith("http://127.0.0.1:55431"))
      throw Error("Tests require the isolated local Supabase project.");
    const login = async (role: string) => {
      const c = createClient(cfg.url, cfg.anon, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error } = await c.auth.signInWithPassword(accounts[role]);
      if (error) throw error;
      return c;
    };
    [manager, player, outsider, reviewer] = await Promise.all(
      ["manager", "player", "outsider", "reviewer"].map(login),
    );
    admin = createClient(cfg.url, cfg.service, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const r = await manager
      .schema("band_finance")
      .from("gigs")
      .select("*")
      .eq("id", cfg.gig)
      .single();
    if (r.error) throw r.error;
    draft = r.data.draft;
    gigId = r.data.id;
    version = r.data.version;
  });
  it("players cannot read gig budgets, revisions or audit history", async () => {
    for (const t of ["gigs", "revisions", "audit_events"]) {
      const r = await player.schema("band_finance").from(t).select("*");
      expect(r.error).toBeNull();
      expect(r.data).toEqual([]);
    }
  });
  it("players receive only their own profile and engagements", async () => {
    const p = await player.schema("band_finance").from("people").select("*");
    expect(p.data?.map((x) => x.id)).toEqual([cfg.player]);
    const e = await player
      .schema("band_finance")
      .rpc("player_gigs", { w: cfg.workspace });
    expect(e.error).toBeNull();
    expect(e.data.length).toBe(1);
    expect(e.data[0].personId).toBe(cfg.player);
    expect(JSON.stringify(e.data)).not.toContain("taxReserve");
    expect(JSON.stringify(e.data)).not.toContain(accounts.player2.email);
  });
  it("cross-workspace owner cannot read or edit another workspace", async () => {
    const r = await outsider
      .schema("band_finance")
      .from("gigs")
      .select("*")
      .eq("workspace_id", cfg.workspace);
    expect(r.data).toEqual([]);
    const mutation = await outsider
      .schema("band_finance")
      .rpc("save_draft", {
        w: cfg.workspace,
        gig: gigId,
        expected_version: version,
        payload: draft,
      });
    expect(mutation.error?.code).toBe("42501");
  });
  it("reviewer can read but cannot save", async () => {
    const r = await reviewer
      .schema("band_finance")
      .from("gigs")
      .select("id")
      .eq("id", gigId);
    expect(r.data?.length).toBe(1);
    const m = await reviewer
      .schema("band_finance")
      .rpc("save_draft", {
        w: cfg.workspace,
        gig: gigId,
        expected_version: version,
        payload: draft,
      });
    expect(m.error?.code).toBe("42501");
  });
  it("denies direct financial and role writes, even from the owner", async () => {
    for (const [table, values] of [
      ["memberships", { role: "owner" }],
      ["people", { fund_status: "verified" }],
      ["gigs", { version: 999 }],
      ["revisions", { digest: "forged" }],
      ["audit_events", { action: "forged" }],
    ] as const) {
      const r = await manager
        .schema("band_finance")
        .from(table)
        .update(values)
        .eq("workspace_id", cfg.workspace);
      expect(r.error?.code).toBe("42501");
    }
  });
  it("denies direct SQL worker execution", async () => {
    const r = await manager.schema("band_finance").rpc("claim_job");
    expect(r.error?.code).toBe("42501");
  });
  it("rejects stale draft versions", async () => {
    const r = await manager
      .schema("band_finance")
      .rpc("save_draft", {
        w: cfg.workspace,
        gig: gigId,
        expected_version: version + 100,
        payload: draft,
      });
    expect(r.error?.message).toBe("stale_version");
  });
  it("enforces composite workspace references in draft engagements", async () => {
    const invalid = structuredClone(draft);
    invalid.engagements.forEach((e) => {
      e.id = randomUUID();
    });
    invalid.engagements[0].personId = randomUUID();
    const r = await manager
      .schema("band_finance")
      .rpc("save_draft", {
        w: cfg.workspace,
        gig: randomUUID(),
        expected_version: 0,
        payload: invalid,
      });
    expect(r.error?.code).toBe("23503");
  });
  it("rejects browser-authored calculation signatures", async () => {
    const r = await manager
      .schema("band_finance")
      .rpc("commit_revision", { payload_text: "{}", signature: "forged" });
    expect(r.error?.message).toBe("invalid_server_attestation");
  });
  it("commits an attested server revision idempotently", async () => {
    const text = JSON.stringify({
      workspaceId: cfg.workspace,
      gigId,
      version,
      actorId: accounts.manager.id,
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      input: draft,
      result: settle(draft),
    });
    const params = {
      payload_text: text,
      signature: createHmac("sha256", cfg.signingKey)
        .update(text)
        .digest("hex"),
    };
    const first = await manager
      .schema("band_finance")
      .rpc("commit_revision", params);
    expect(first.error).toBeNull();
    const second = await manager
      .schema("band_finance")
      .rpc("commit_revision", params);
    expect(second.data).toBe(first.data);
  });
  it("blocks provider setup rather than returning fake success", async () => {
    const revision = await manager
      .schema("band_finance")
      .from("revisions")
      .select("id")
      .eq("gig_id", gigId)
      .eq("gig_version", version)
      .single();
    const r = await manager
      .schema("band_finance")
      .rpc("prepare_run", {
        w: cfg.workspace,
        revision: revision.data?.id,
        funding_available: 10000000,
        funding_evidence: "Synthetic check",
      });
    expect(r.error?.message).toBe("provider_and_deadline_setup_required");
  });
  it("requires MFA for any payment authorisation", async () => {
    const r = await manager
      .schema("band_finance")
      .rpc("authorise_run", {
        w: cfg.workspace,
        run: randomUUID(),
        expected_digest: "0".repeat(64),
        command_key: randomUUID(),
      });
    expect(r.error?.message).toBe("mfa_required");
  });
  it("external super requires manager MFA and rejects players and direct writes", async () => {
    const own = draft.engagements.find((e) => e.personId === cfg.player)!;
    const params = {
      w: cfg.workspace,
      engagement: own.id,
      revision: randomUUID(),
      amount: 1200,
      qe_day: "2026-10-20",
      paid_on: "2026-10-22",
      reference: "SYNTHETIC-PORTAL",
      fund_label: "AustralianSuper",
    };
    const m = await manager
      .schema("band_finance")
      .rpc("record_external_super", params);
    expect(m.error?.message).toBe("mfa_required");
    const p = await player
      .schema("band_finance")
      .rpc("record_external_super", params);
    expect(p.error?.code).toBe("42501");
    const c = await manager
      .schema("band_finance")
      .rpc("confirm_external_super_receipt", {
        w: cfg.workspace,
        id: randomUUID(),
        evidence: "Synthetic receipt",
      });
    expect(c.error?.message).toBe("mfa_required");
    const direct = await manager
      .schema("band_finance")
      .from("external_super_payments")
      .insert({
        workspace_id: cfg.workspace,
        engagement_id: own.id,
        revision_id: randomUUID(),
        person_id: cfg.player,
        amount_cents: 1200,
        qe_day: "2026-10-20",
        paid_on: "2026-10-22",
        portal_reference: "forged",
        fund_label: "forged",
        recorded_by: accounts.manager.id,
      });
    expect(direct.error?.code).toBe("42501");
  });
  it("invitation rejects the wrong email, allows its recipient once, then rejects replay", async () => {
    const token = randomBytes(32).toString("base64url"),
      hash = createHash("sha256").update(token).digest("hex");
    const created = await manager
      .schema("band_finance")
      .rpc("create_invitation", {
        w: cfg.workspace,
        gig: gigId,
        person: cfg.player,
        hashed_token: hash,
      });
    expect(created.error).toBeNull();
    const wrong = await outsider
      .schema("band_finance")
      .rpc("claim_invitation", { hashed_token: hash });
    expect(wrong.error?.message).toBe("invitation_unavailable");
    const correct = await player
      .schema("band_finance")
      .rpc("claim_invitation", { hashed_token: hash });
    expect(correct.error).toBeNull();
    const replay = await player
      .schema("band_finance")
      .rpc("claim_invitation", { hashed_token: hash });
    expect(replay.error?.message).toBe("invitation_unavailable");
  });
  it("invitation revocation and expiry block claim", async () => {
    for (const kind of ["revoke", "expire"]) {
      const hash = createHash("sha256").update(randomBytes(32)).digest("hex");
      const created = await manager
        .schema("band_finance")
        .rpc("create_invitation", {
          w: cfg.workspace,
          gig: gigId,
          person: cfg.player,
          hashed_token: hash,
        });
      if (kind === "revoke")
        await manager
          .schema("band_finance")
          .rpc("revoke_invitation", {
            w: cfg.workspace,
            invitation: created.data,
          });
      else
        await admin
          .schema("band_finance")
          .from("invitations")
          .update({ expires_at: "2020-01-01T00:00:00Z" })
          .eq("id", created.data);
      const r = await player
        .schema("band_finance")
        .rpc("claim_invitation", { hashed_token: hash });
      expect(r.error?.message).toBe("invitation_unavailable");
    }
  });
  it("rejects another player agreement and stale acceptance", async () => {
    const other = draft.engagements.find((e) => e.personId !== cfg.player)!;
    const r = await player
      .schema("band_finance")
      .rpc("respond_agreement", {
        w: cfg.workspace,
        engagement: other.id,
        expected_version: 1,
        response_value: "accepted",
        note: "",
      });
    expect(r.error?.code).toBe("42501");
    const own = draft.engagements.find((e) => e.personId === cfg.player)!;
    const stale = await player
      .schema("band_finance")
      .rpc("respond_agreement", {
        w: cfg.workspace,
        engagement: own.id,
        expected_version: 1000,
        response_value: "accepted",
        note: "",
      });
    expect(stale.error?.message).toBe("stale_version");
  });
  it("private storage rejects foreign prefixes and quarantines new objects", async () => {
    const path = `${cfg.workspace}/${accounts.outsider.id}/${randomUUID()}`;
    const wrong = await player.storage
      .from("band-documents")
      .upload(path, new TextEncoder().encode("%PDF-1.4\n"), {
        contentType: "application/pdf",
      });
    expect(wrong.error).not.toBeNull();
    const own = `${cfg.workspace}/${accounts.player.id}/${randomUUID()}`;
    const upload = await player.storage
      .from("band-documents")
      .upload(own, new TextEncoder().encode("%PDF-1.4\n"), {
        contentType: "application/pdf",
      });
    expect(upload.error).toBeNull();
    const read = await player.storage.from("band-documents").download(own);
    expect(read.error).not.toBeNull();
    await admin.storage.from("band-documents").remove([own]);
  });
  it("does not allow public registration", async () => {
    const c = createClient(cfg.url, cfg.anon, {
      auth: { persistSession: false },
    });
    const r = await c.auth.signUp({
      email: `test-${randomUUID()}@example.test`,
      password: randomBytes(24).toString("hex"),
    });
    expect(r.error).not.toBeNull();
  });
});
