import "server-only";
import { supabase } from "./supabase";
import { unwrap } from "./http";
import type { Draft, Settlement, Engagement } from "./finance";
export type Person = {
  id: string;
  name: string;
  email: string;
  auth_user_id: string | null;
  abn: string | null;
  gst_registered: boolean;
  profile_version: number;
  bank_status: string;
  fund_status: string;
  notice_accepted_at: string | null;
};
export type Gig = {
  id: string;
  title: string;
  draft: Draft;
  version: number;
  payday: string;
  performance_date: string;
};
export type Revision = {
  id: string;
  gig_id: string;
  gig_version: number;
  result: Settlement;
  digest: string;
  created_at: string;
};
export type PlayerGig = {
  id: string;
  gigId: string;
  title: string;
  performanceDate: string;
  payday: string;
  terms: Engagement;
  version: number;
  response: string;
  personId: string;
};
export type Invoice = {
  id: string;
  engagement_id: string;
  person_id: string;
  document_id: string;
  invoice_number: string;
  amount_cents: number;
  status: string;
};
export type ExternalSuper = {
  id: string;
  engagement_id: string;
  revision_id: string;
  person_id: string;
  amount_cents: number;
  qe_day: string;
  paid_on: string;
  portal_reference: string;
  fund_label: string;
  status: "paid_via_portal" | "fund_receipt_confirmed";
  receipt_evidence: string | null;
  confirmed_at: string | null;
};
export type AppData = {
  userId: string;
  role: string;
  canApprove: boolean;
  workspace: {
    id: string;
    name: string;
    legal_name: string | null;
    abn: string | null;
  };
  workspaces: { id: string; name: string }[];
  people: Person[];
  gigs: Gig[];
  revisions: Revision[];
  playerGigs: PlayerGig[];
  engagements: {
    id: string;
    gig_id: string;
    person_id: string;
    response: string;
  }[];
  invoices: Invoice[];
  documents: { id: string; scan_status: string }[];
  transfers: {
    id: string;
    invoice_id: string;
    amount_cents: number;
    paid_on: string;
    source: string;
  }[];
  invitations: {
    id: string;
    person_id: string;
    gig_id: string;
    email: string;
    delivery_status: string;
    claimed_at: string | null;
    revoked_at: string | null;
    expires_at: string;
  }[];
  audit: {
    id: string;
    action: string;
    created_at: string;
    metadata: Record<string, unknown>;
  }[];
  payRuns: {
    id: string;
    status: string;
    digest: string;
    revision_id: string;
  }[];
  contributions: {
    id: string;
    engagement_id: string;
    person_id: string;
    amount_cents: number;
    status: string;
  }[];
  externalSuper: ExternalSuper[];
  local: boolean;
};
export async function loadData(workspaceId?: string): Promise<AppData | null> {
  const client = await supabase();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return null;
  const db = client.schema("band_finance");
  const memberships = unwrap(
    await db.from("memberships").select("*").eq("user_id", user.id),
  );
  if (!memberships?.length) return null;
  const member =
    memberships.find((x) => x.workspace_id === workspaceId) ?? memberships[0];
  const w = member.workspace_id;
  const allWorkspaces =
    unwrap(await db.from("workspaces").select("id,name,legal_name,abn")) ?? [];
  const manager = ["owner", "finance_manager", "reviewer"].includes(
    member.role,
  );
  const tables = [
    "people",
    "invoices",
    "documents",
    "bank_transfers",
    "contributions",
    "external_super_payments",
    ...(manager
      ? [
          "gigs",
          "revisions",
          "engagements",
          "invitations",
          "audit_events",
          "pay_runs",
        ]
      : []),
  ];
  const results = await Promise.all(
    tables.map(async (table) => {
      let query = db.from(table).select("*").eq("workspace_id", w);
      if (table === "audit_events" || table === "revisions")
        query = query.order("created_at", { ascending: false });
      return [table, unwrap(await query.limit(200)) ?? []] as const;
    }),
  );
  const rows = Object.fromEntries(results);
  const playerGigs =
    member.role === "player" ? unwrap(await db.rpc("player_gigs", { w })) : [];
  return {
    userId: user.id,
    role: member.role,
    canApprove: member.can_approve,
    workspace: allWorkspaces.find((x) => x.id === w)!,
    workspaces: allWorkspaces,
    people: rows.people,
    gigs: rows.gigs ?? [],
    revisions: rows.revisions ?? [],
    playerGigs,
    engagements: rows.engagements ?? [],
    invoices: rows.invoices,
    documents: rows.documents,
    transfers: rows.bank_transfers,
    invitations: rows.invitations ?? [],
    audit: rows.audit_events ?? [],
    payRuns: rows.pay_runs ?? [],
    contributions: rows.contributions,
    externalSuper: rows.external_super_payments,
    local: process.env.APP_ENV === "local",
  };
}
