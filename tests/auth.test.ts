import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { randomUUID, randomBytes, createHmac } from "node:crypto";
const local = existsSync(".local/test-config.json");
function settings() {
  const c = JSON.parse(readFileSync(".local/test-config.json", "utf8"));
  if (c.url !== "http://127.0.0.1:55431") throw Error("Local tests only");
  return c;
}
function totp(secret: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secret.replaceAll("=", "").toUpperCase())
    bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8)
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const mac = createHmac("sha1", Buffer.from(bytes)).update(counter).digest(),
    offset = mac[19] & 15;
  return ((mac.readUInt32BE(offset) & 0x7fffffff) % 1000000)
    .toString()
    .padStart(6, "0");
}
describe.skipIf(!local)("real Supabase session lifecycle", () => {
  it("revokes finance access immediately even while the old JWT has not expired", async () => {
    const cfg = settings(),
      a = JSON.parse(readFileSync(".local/accounts.json", "utf8"));
    const c = createClient(cfg.url, cfg.anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const login = await c.auth.signInWithPassword(a.manager);
    expect(login.error).toBeNull();
    const token = login.data.session!.access_token;
    const before = await c
      .schema("band_finance")
      .rpc("role_for", { w: cfg.workspace });
    expect(before.data).toBe("owner");
    await c.auth.signOut({ scope: "local" });
    const stale = createClient(cfg.url, cfg.anon, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const after = await stale
      .schema("band_finance")
      .rpc("role_for", { w: cfg.workspace });
    expect(after.data).toBeNull();
    const people = await stale
      .schema("band_finance")
      .from("people")
      .select("id");
    expect(people.data).toEqual([]);
  });
  it("enrols a synthetic authenticator and elevates only after a correct code", async () => {
    const cfg = settings(),
      admin = createClient(cfg.url, cfg.service, {
        auth: { persistSession: false },
      });
    const email = `mfa-${randomUUID()}@example.test`,
      password = randomBytes(24).toString("hex");
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (created.error) throw created.error;
    try {
      const c = createClient(cfg.url, cfg.anon, {
        auth: { persistSession: false },
      });
      await c.auth.signInWithPassword({ email, password });
      const before = await c.auth.mfa.getAuthenticatorAssuranceLevel();
      expect(before.data?.currentLevel).toBe("aal1");
      const enrolled = await c.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Disposable test authenticator",
      });
      expect(enrolled.error).toBeNull();
      if (!enrolled.data || enrolled.data.type !== "totp")
        throw Error("TOTP enrolment unavailable");
      const wrong = await c.auth.mfa.challengeAndVerify({
        factorId: enrolled.data.id,
        code: "not-a-code",
      });
      expect(wrong.error).not.toBeNull();
      const correct = await c.auth.mfa.challengeAndVerify({
        factorId: enrolled.data.id,
        code: totp(enrolled.data.totp.secret),
      });
      expect(correct.error).toBeNull();
      const after = await c.auth.mfa.getAuthenticatorAssuranceLevel();
      expect(after.data?.currentLevel).toBe("aal2");
    } finally {
      await admin.auth.admin.deleteUser(created.data.user.id);
    }
  });
});
