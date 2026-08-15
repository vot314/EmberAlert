import { NextResponse } from "next/server";
import { listReports, SCENARIO } from "@/lib/reports";

// Scans the audio folders on every request — this is what makes a dropped-in mp3
// show up without a restart, so it must never be statically cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ scenario: SCENARIO, reports: listReports() });
}
