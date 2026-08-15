import { join } from "node:path";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { resolveExtraction } from "@/lib/cache";

// Reads audio files off disk, so it must not run on the edge runtime.
export const runtime = "nodejs";

type CallRecord = { id: string; audio: string };

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

  const manifest = JSON.parse(
    await readFile(join(process.cwd(), "data", "calls.json"), "utf8"),
  ) as { calls: CallRecord[] };

  const call = manifest.calls.find((c) => c.id === callId);
  if (!call) {
    return NextResponse.json({ error: `unknown call ${callId}` }, { status: 404 });
  }

  const audioPath = join(process.cwd(), "public", call.audio.replace(/^\//, ""));
  if (!existsSync(audioPath)) {
    return NextResponse.json(
      { error: `audio missing at ${call.audio} — run: npm run gen:audio` },
      { status: 500 },
    );
  }

  try {
    const resolved = await resolveExtraction(callId, audioPath);
    return NextResponse.json(resolved);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "extraction failed" },
      { status: 500 },
    );
  }
}
