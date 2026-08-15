import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  const manifest = JSON.parse(
    await readFile(join(process.cwd(), "data", "calls.json"), "utf8"),
  );
  return NextResponse.json(manifest);
}

export async function POST() {
  return NextResponse.json({ message: "EmberAlert uses incident records directly." });
}
