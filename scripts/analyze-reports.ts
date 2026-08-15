/**
 * Runs every report audio through the live pipeline, writes the result as a committed
 * fixture (fallback when there is no key), and prints the ranked fire list. Run after
 * changing the prompt, the audios, or the ranking.
 *
 *   npx tsx scripts/analyze-reports.ts
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { analyzeReport, rankFires, type AnalyzedReport } from "../lib/fires";

const root = process.cwd();

// Load .env.local (standalone scripts do not get Next's env loading).
const envPath = join(root, ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

async function main() {
  const { resolveExtraction, DEFAULT_MODEL } = await import("../lib/cache");
  const manifest = JSON.parse(readFileSync(join(root, "data/reports.json"), "utf8"));
  const all = [...manifest.reports, ...manifest.heldReports];

  console.log(`model: ${DEFAULT_MODEL}\n`);
  mkdirSync(join(root, "fixtures/extractions"), { recursive: true });

  const analyzed: AnalyzedReport[] = [];
  for (const rec of all) {
    const audioPath = join(root, "public", rec.audio.replace(/^\//, ""));
    const r = await resolveExtraction(rec.id, audioPath);

    // Persist as a fixture so the demo has a no-key fallback.
    writeFileSync(
      join(root, `fixtures/extractions/${rec.id}.json`),
      JSON.stringify(r.extraction, null, 2),
    );

    const a = analyzeReport(rec.id, rec.label, r.extraction);
    analyzed.push(a);
    console.log(
      `${rec.id.padEnd(18)} ${r.source.padEnd(7)} sev=${String(r.extraction.severity_score).padStart(3)} ` +
        `place="${a.place}" coords=${a.coords ? `${a.coords.lat.toFixed(3)},${a.coords.lng.toFixed(3)}` : "NONE"}` +
        (r.liveError ? `  [live failed: ${r.liveError}]` : ""),
    );
    console.log(`   "${r.extraction.transcript}"`);
  }

  // Rank the ACTIVE reports only (matches the initial webpage state).
  const activeIds = new Set(manifest.reports.map((r: { id: string }) => r.id));
  const active = analyzed.filter((a) => activeIds.has(a.id));
  const { fires, unlocatable } = rankFires(active);

  console.log("\nranked fires (active reports)\n" + "-".repeat(60));
  for (const f of fires) {
    console.log(
      `#${f.rank}  ${f.place.padEnd(22)} severity ${String(f.severity).padStart(3)}  ` +
        `${f.callCount} call(s)  ${[
          f.lives && "lives",
          f.structures && "structures",
          f.evacuation && "evac",
          f.outOfControl && "out-of-control",
        ]
          .filter(Boolean)
          .join(", ") || "no acute threat flags"}`,
    );
    console.log(`     ${f.reason}`);
  }
  if (unlocatable.length) console.log(`\nunlocatable: ${unlocatable.map((r) => r.id).join(", ")}`);
  console.log("");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
