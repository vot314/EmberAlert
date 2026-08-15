import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { NextResponse } from "next/server";
import { findReportPath } from "@/lib/reports";
import { resolveExtractionFromBytes } from "@/lib/cache";

// Reads audio bytes and calls Gemini, so it cannot run on the edge runtime.
export const runtime = "nodejs";
// Live Gemini extraction has been observed to take 8-58s.
export const maxDuration = 60;

function mimeFor(path: string): string {
  const ext = extname(path).toLowerCase();
  if (ext === ".mp3") return "audio/mpeg";
  if (ext === ".m4a") return "audio/m4a";
  if (ext === ".wav") return "audio/wav";
  return "audio/mpeg";
}

export async function POST(request: Request) {
  let callId: string;
  try {
    ({ callId } = await request.json());
  } catch {
    return NextResponse.json({ error: "malformed request body" }, { status: 400 });
  }

  if (!callId || typeof callId !== "string") {
    return NextResponse.json({ error: "callId is required" }, { status: 400 });
  }

  // Resolved against the live folder scan, so a file dropped in moments ago is
  // analysable immediately — no manifest entry, no restart.
  const hit = findReportPath(callId);
  if (!hit) {
    return NextResponse.json({ error: `unknown report ${callId}` }, { status: 404 });
  }

  try {
    const audioBytes = readFileSync(hit.path);
    const resolved = await resolveExtractionFromBytes(callId, audioBytes, mimeFor(hit.path));
    return NextResponse.json(resolved);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "extraction failed" },
      { status: 500 },
    );
  }
}
