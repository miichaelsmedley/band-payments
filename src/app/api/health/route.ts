import { NextResponse } from "next/server";
export function GET() {
  return NextResponse.json({
    application: "band-payments",
    payments: "disabled",
    provider: "unconfigured",
  });
}
