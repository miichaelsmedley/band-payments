import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const status = JSON.parse(
  execFileSync("npx", ["supabase", "status", "-o", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }),
);
if (
  !["127.0.0.1", "localhost"].includes(new URL(status.API_URL).hostname) ||
  !status.API_URL.endsWith(":55431")
)
  throw new Error("Only the isolated local project is supported.");
mkdirSync(".local", { recursive: true, mode: 0o700 });
const client = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const accountFile = ".local/accounts.json";
const accounts = existsSync(accountFile)
  ? JSON.parse(readFileSync(accountFile, "utf8"))
  : {};
for (const role of ["manager", "player", "reviewer", "outsider", "player2"]) {
  if (!accounts[role]) {
    const email = `band-${role}@example.test`,
      password = randomBytes(24).toString("base64url");
    const { data, error } = await client.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error)
      throw new Error(
        `Could not create synthetic ${role} account: ${error.code}`,
      );
    accounts[role] = { email, password, id: data.user.id };
    writeFileSync(accountFile, JSON.stringify(accounts, null, 2), {
      mode: 0o600,
    });
  }
}
const stateFile = ".local/state.json";
const state = existsSync(stateFile)
  ? JSON.parse(readFileSync(stateFile, "utf8"))
  : {
      workspace: randomUUID(),
      otherWorkspace: randomUUID(),
      player: randomUUID(),
      player2: randomUUID(),
      managerPerson: randomUUID(),
      signingKey: randomBytes(32).toString("hex"),
      gig: randomUUID(),
    };
writeFileSync(stateFile, JSON.stringify(state, null, 2), { mode: 0o600 });
writeFileSync(
  ".local/test-config.json",
  JSON.stringify({
    url: status.API_URL,
    anon: status.ANON_KEY,
    service: status.SERVICE_ROLE_KEY,
    ...state,
  }),
  { mode: 0o600 },
);
const q = (s) => `'${String(s).replaceAll("'", "''")}'`;
const sql = `
insert into finance_private.configuration(id,signing_key,environment) values(true,${q(state.signingKey)},'local') on conflict(id) do update set signing_key=excluded.signing_key;
insert into band_finance.workspaces(id,name) values(${q(state.workspace)},'Local rehearsal band'),(${q(state.otherWorkspace)},'Isolation test workspace') on conflict do nothing;
insert into band_finance.people(workspace_id,id,auth_user_id,name,email) values
(${q(state.workspace)},${q(state.player)},${q(accounts.player.id)},'Alex · test musician',${q(accounts.player.email)}),
(${q(state.workspace)},${q(state.player2)},${q(accounts.player2.id)},'Sam · test crew',${q(accounts.player2.email)}),
(${q(state.workspace)},${q(state.managerPerson)},${q(accounts.manager.id)},'Test partner',${q(accounts.manager.email)}) on conflict do nothing;
insert into band_finance.memberships(workspace_id,user_id,role,can_approve,person_id) values
(${q(state.workspace)},${q(accounts.manager.id)},'owner',true,${q(state.managerPerson)}),
(${q(state.workspace)},${q(accounts.player.id)},'player',false,${q(state.player)}),
(${q(state.workspace)},${q(accounts.player2.id)},'player',false,${q(state.player2)}),
(${q(state.workspace)},${q(accounts.reviewer.id)},'reviewer',false,null),
(${q(state.otherWorkspace)},${q(accounts.outsider.id)},'owner',true,null) on conflict do nothing;
`;
execFileSync(
  "docker",
  [
    "exec",
    "-i",
    "supabase_db_band-payments",
    "psql",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
  ],
  { input: sql, stdio: ["pipe", "ignore", "pipe"] },
);
const env = `APP_ENV=local\nAPP_ORIGIN=http://127.0.0.1:3417\nNEXT_PUBLIC_SUPABASE_URL=${status.API_URL}\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${status.ANON_KEY}\nCALCULATION_SIGNING_KEY=${state.signingKey}\nPAYMENT_PROVIDER=unconfigured\nLIVE_PAYMENTS_ENABLED=false\n`;
writeFileSync(".env.local", env, { mode: 0o600 });
const signed = createClient(status.API_URL, status.ANON_KEY, {
  auth: { persistSession: false },
});
const { error: loginError } = await signed.auth.signInWithPassword(
  accounts.manager,
);
if (loginError) throw new Error("Local sign-in failed: " + loginError.message);
const { data: existing } = await signed
  .schema("band_finance")
  .from("gigs")
  .select("id")
  .eq("id", state.gig);
if (!existing?.length) {
  const draft = {
    title: "Rehearsal room sessions · test gig",
    performanceDate: "2026-10-23",
    payday: "2026-10-26",
    basis: "net",
    receipts: [
      {
        id: randomUUID(),
        label: "Venue settlement · synthetic",
        amount: 240000,
      },
    ],
    expenses: [
      {
        id: randomUUID(),
        label: "Promotion · synthetic",
        amount: 18000,
        paidBy: "person",
        personId: state.managerPerson,
        reimbursed: false,
      },
      {
        id: randomUUID(),
        label: "Venue deduction already withheld",
        amount: 20000,
        paidBy: "venue",
        personId: null,
        reimbursed: false,
      },
    ],
    savings: { mode: "percent", amount: 1000 },
    taxReserve: 10000,
    engagements: [
      {
        id: randomUUID(),
        personId: state.player,
        name: "Alex · test musician",
        role: "Vocals",
        category: "musician",
        allocation: "fixed",
        weight: 100,
        amount: 35000,
        hire: 0,
        mode: "exclusive",
        gst: "none",
        classification: "adult_eligible_contractor",
        agreementEvidence:
          "Synthetic fixture: $350 excluding super, agreed before performance.",
        hireEvidence: "",
      },
      {
        id: randomUUID(),
        personId: state.player2,
        name: "Sam · test crew",
        role: "Sound engineer",
        category: "crew",
        allocation: "fixed",
        weight: 100,
        amount: 30000,
        hire: 0,
        mode: "exclusive",
        gst: "uniform",
        classification: "adult_eligible_contractor",
        agreementEvidence:
          "Synthetic fixture: $300 plus GST and employer super.",
        hireEvidence: "",
      },
    ],
    drawings: [
      {
        id: randomUUID(),
        personId: state.managerPerson,
        name: "Test partner",
        allocation: "share",
        amount: 0,
        weight: 100,
      },
    ],
  };
  const { error } = await signed
    .schema("band_finance")
    .rpc("save_draft", {
      w: state.workspace,
      gig: state.gig,
      expected_version: 0,
      payload: draft,
    });
  if (error) throw new Error(`Seed failed: ${error.message}`);
}
console.log(
  "Isolated local accounts and synthetic gig are ready. Secrets saved only to ignored files with mode 0600.",
);
