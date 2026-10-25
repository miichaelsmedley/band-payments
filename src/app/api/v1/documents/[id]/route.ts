import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { errorResponse, unwrap } from "@/lib/http";
import { z } from "zod";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const client = await supabase();
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user) throw new Error("unauthorised");
    const id = z
      .string()
      .uuid()
      .parse((await params).id);
    const doc = unwrap(
      await client
        .schema("band_finance")
        .from("documents")
        .select("path,mime,scan_status")
        .eq("id", id)
        .single(),
    );
    if (!doc) throw new Error("forbidden");
    if (doc.scan_status !== "clean") throw new Error("document_scan_required");
    const blob = unwrap(
      await client.storage.from("band-documents").download(doc.path),
    );
    return new NextResponse(blob, {
      headers: {
        "Content-Type": doc.mime,
        "Content-Disposition": 'attachment; filename="document"',
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
