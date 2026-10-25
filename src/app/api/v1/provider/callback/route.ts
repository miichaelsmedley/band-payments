import { NextResponse } from "next/server";
// No provider is approved. Do not parse, log or trust unsolicited callback payloads.
export async function POST() {
  return NextResponse.json(
    {
      error: {
        code: "provider_unavailable",
        message: "No callback integration is configured.",
      },
    },
    { status: 503 },
  );
}
