import { NextResponse } from "next/server";
import manifest from "@/data/calls.json";
import { resolveExtractionFromBytes } from "@/lib/cache";

// Reads audio bytes and calls Gemini, so it cannot run on the edge runtime.
export const runtime = "nodejs";
// Live Gemini extraction has been observed to take 8–58s. Give it the longest
// window Vercel Hobby allows; on Pro this can go higher.
export const maxDuration = 60;

type CallRecord = { id: string; audio: string };

function mimeFor(path: string): string {
  const p = path.toLowerCase();
  if (p.endsWith(".mp3")) return "audio/mpeg";
  if (p.endsWith(".m4a")) return "audio/m4a";
  if (p.endsWith(".mp4")) return "video/mp4";
  return "audio/wav";
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

  const call = (manifest.calls as CallRecord[]).find((c) => c.id === callId);
  if (!call) {
    return NextResponse.json({ error: `unknown call ${callId}` }, { status: 404 });
  }

  // Audio lives in public/ and is served statically. Fetch it by absolute URL rather
  // than reading the filesystem: public/ files are present on the local dev server's
  // disk but NOT on Vercel's serverless function filesystem, whereas the static URL
  // works identically in both. `new URL(path, request.url)` resolves "/calls/x.wav"
  // against the current origin (localhost in dev, the deployment domain on Vercel).
  let audioBytes: Buffer;
  try {
    const audioUrl = new URL(call.audio, request.url);
    const res = await fetch(audioUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    audioBytes = Buffer.from(await res.arrayBuffer());
  } catch (err) {
    return NextResponse.json(
      {
        error: `could not load audio ${call.audio}: ${
          err instanceof Error ? err.message : "fetch failed"
        }`,
      },
      { status: 502 },
    );
  }

  try {
    const resolved = await resolveExtractionFromBytes(callId, audioBytes, mimeFor(call.audio));
    return NextResponse.json(resolved);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "extraction failed" },
      { status: 500 },
    );
  }
}
