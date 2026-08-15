import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { NextResponse } from "next/server";
import { findReportPath } from "@/lib/reports";

// Streams audio from wherever the scanner found it (the gitignored `call audios/`
// folder is not under public/, so a static URL cannot serve it).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIME: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const hit = findReportPath(id);
  if (!hit) {
    return NextResponse.json({ error: `unknown report ${id}` }, { status: 404 });
  }

  const bytes = readFileSync(hit.path);
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": MIME[extname(hit.path).toLowerCase()] ?? "application/octet-stream",
      // The same id could be re-recorded between plays; always serve current bytes.
      "Cache-Control": "no-store",
    },
  });
}
