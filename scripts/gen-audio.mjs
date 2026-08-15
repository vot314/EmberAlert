/**
 * Renders the scripted calls to WAV with the macOS `say` command.
 *
 * Run once, commit the output. Audio is NEVER generated during the demo — this
 * script exists so the call set is reproducible, not so it runs on stage.
 *
 *   node scripts/gen-audio.mjs
 */
import { execFileSync } from "node:child_process";
import { readFileSync, mkdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = process.argv[2] ?? "data/calls.json";
const manifest = JSON.parse(readFileSync(join(root, manifestPath), "utf8"));

if (process.platform !== "darwin") {
  console.error("`say` is macOS-only. Supply your own WAVs in public/calls/ instead.");
  process.exit(1);
}

const installed = new Set(
  execFileSync("say", ["-v", "?"], { encoding: "utf8" })
    .split("\n")
    .map((line) => line.trim().split(/\s{2,}|\s(?=[a-z]{2}_)/)[0])
    .filter(Boolean),
);

mkdirSync(join(root, "public/calls"), { recursive: true });

for (const call of manifest.calls) {
  const out = join(root, "public", call.audio.replace(/^\//, ""));
  const args = [];

  if (call.voice && installed.has(call.voice)) {
    args.push("-v", call.voice);
  } else if (call.voice) {
    console.warn(`  voice "${call.voice}" not installed for ${call.id}, using system default`);
  }
  if (call.rate) args.push("-r", String(call.rate));
  args.push("-o", out, "--data-format=LEI16@22050", call.script);

  execFileSync("say", args);
  const kb = (statSync(out).size / 1024).toFixed(0);
  console.log(`  ${call.id}  ${kb.padStart(5)} KB  ${call.voice ?? "default"}  ${call.callerLabel}`);
}

console.log(`\nRendered ${manifest.calls.length} calls to public/calls/`);
