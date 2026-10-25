import { NextResponse } from "next/server";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { requireOrigin, errorResponse } from "@/lib/http";
import { readFile } from "node:fs/promises";
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const input = await request.json();
    const client = await supabase();
    if (input.action === "signout") {
      await client.auth.signOut({ scope: "local" });
      return NextResponse.json({ ok: true });
    }
    if (String(input.action).startsWith("mfa_")) {
      const {
        data: { user },
      } = await client.auth.getUser();
      if (!user) throw new Error("unauthorised");
      if (input.action === "mfa_status") {
        const { data: assurance, error } =
          await client.auth.mfa.getAuthenticatorAssuranceLevel();
        const { data: factors } = await client.auth.mfa.listFactors();
        if (error) throw new Error("unauthorised");
        return NextResponse.json({
          data: {
            aal: assurance.currentLevel,
            factors:
              factors?.totp
                .filter((f) => f.status === "verified")
                .map((f) => ({ id: f.id, friendly_name: f.friendly_name })) ??
              [],
          },
        });
      }
      if (input.action === "mfa_enroll") {
        const { data, error } = await client.auth.mfa.enroll({
          factorType: "totp",
          friendlyName: "Band Payments authenticator",
        });
        if (error) throw new Error("mfa_setup_failed");
        return NextResponse.json({
          data: { qr: data.totp.qr_code, factorId: data.id },
        });
      }
      if (input.action === "mfa_verify") {
        const { error } = await client.auth.mfa.challengeAndVerify({
          factorId: z.string().uuid().parse(input.factorId),
          code: z
            .string()
            .regex(/^[0-9]{6}$/)
            .parse(input.code),
        });
        if (error) throw new Error("mfa_code_invalid");
        return NextResponse.json({ data: { verified: true } });
      }
      throw new Error("unsupported_command");
    }
    let email: string, password: string;
    if (input.action === "local") {
      if (
        process.env.APP_ENV !== "local" ||
        process.env.NODE_ENV === "production" ||
        !["localhost", "127.0.0.1"].includes(
          new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname,
        )
      )
        throw new Error("forbidden");
      const role = z.enum(["manager", "player", "reviewer"]).parse(input.role);
      const local = JSON.parse(await readFile(".local/accounts.json", "utf8"));
      ({ email, password } = local[role]);
    } else {
      ({ email, password } = z
        .object({ email: z.email(), password: z.string().min(1).max(300) })
        .parse(input));
    }
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw new Error("unauthorised");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
