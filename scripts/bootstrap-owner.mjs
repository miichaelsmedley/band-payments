// One-off creation of a hosted workspace and its first owner. There is no public signup,
// so this is the controlled admin path. Run it in your own terminal: the password is typed
// at a hidden prompt and never passed on the command line, logged or written to disk.
//
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=... node scripts/bootstrap-owner.mjs
import { createInterface } from "node:readline";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL,
  key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key || new URL(url).protocol !== "https:")
  throw new Error("Set SUPABASE_URL (https) and SUPABASE_SERVICE_ROLE_KEY.");

function ask(question, hidden = false) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) rl._writeToOutput = (s) => rl.output.write(s.startsWith(question) ? s : "");
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer.trim());
    });
  });
}

const workspaceName = await ask("Workspace name (as players will see it): ");
const name = await ask("Your name: ");
const email = (await ask("Your sign-in email: ")).toLowerCase();
const password = await ask("New password (12+ characters, hidden): ", true);
if (password.length < 12) throw new Error("Password must be at least 12 characters.");
if ((await ask("Repeat password: ", true)) !== password) throw new Error("Passwords did not match.");

const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const db = admin.schema("band_finance");

const { data: created, error: userError } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});
if (userError) throw new Error(`Could not create the account: ${userError.code ?? userError.message}`);
const userId = created.user.id;

const { data: workspace, error: wError } = await db
  .from("workspaces")
  .insert({ name: workspaceName })
  .select("id")
  .single();
if (wError) throw new Error(`Could not create the workspace: ${wError.message}`);
const { data: person, error: pError } = await db
  .from("people")
  .insert({ workspace_id: workspace.id, auth_user_id: userId, name, email })
  .select("id")
  .single();
if (pError) throw new Error(`Could not create your person record: ${pError.message}`);
const { error: mError } = await db.from("memberships").insert({
  workspace_id: workspace.id,
  user_id: userId,
  role: "owner",
  can_approve: true,
  person_id: person.id,
});
if (mError) throw new Error(`Could not create your membership: ${mError.message}`);
await db.from("audit_events").insert({
  workspace_id: workspace.id,
  actor_id: userId,
  action: "workspace_bootstrapped",
  entity_id: workspace.id,
  metadata: { via: "bootstrap-owner" },
});
console.log(`Workspace "${workspaceName}" created with you as owner and approver.`);
console.log("Sign in, then enrol an authenticator app under Workspace setup before approving anything.");
