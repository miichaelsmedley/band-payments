import { NextResponse } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { parseMoney } from "@/lib/finance";
import { validateUpload } from "@/lib/uploads";
import { requireOrigin, errorResponse, unwrap } from "@/lib/http";
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    if (Number(request.headers.get("content-length") ?? 0) > 9 * 1024 * 1024)
      throw new Error("upload_invalid");
    const client = await supabase();
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user) throw new Error("unauthorised");
    const form = await request.formData();
    const w = z.string().uuid().parse(form.get("workspaceId"));
    const engagement = z.string().uuid().parse(form.get("engagementId"));
    const db = client.schema("band_finance");
    const record = unwrap(
      await db
        .from("engagements")
        .select("person_id")
        .eq("workspace_id", w)
        .eq("id", engagement)
        .single(),
    );
    if (!record) throw new Error("forbidden");
    const owner = unwrap(
      await db
        .from("people")
        .select("auth_user_id")
        .eq("workspace_id", w)
        .eq("id", record.person_id)
        .single(),
    );
    if (!owner || owner.auth_user_id !== user.id) throw new Error("forbidden");
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("upload_invalid");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mime = validateUpload(bytes, file.type);
    const document = randomUUID(),
      path = `${w}/${user.id}/${document}`;
    unwrap(
      await client.storage
        .from("band-documents")
        .upload(path, bytes, { contentType: mime, upsert: false }),
    );
    const invoice = unwrap(
      await db.rpc("submit_invoice", {
        w,
        engagement,
        document,
        object_path: path,
        mime_type: mime,
        size_bytes: bytes.length,
        file_hash: createHash("sha256").update(bytes).digest("hex"),
        number: z.string().min(1).max(100).parse(form.get("invoiceNumber")),
        amount: parseMoney(z.string().parse(form.get("amount"))),
      }),
    );
    return NextResponse.json({
      data: {
        invoiceId: invoice,
        status: "submitted",
        scanStatus: "pending_scan",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
