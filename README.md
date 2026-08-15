# EmberAlert


Forest fires are bad and can be overwhelming, especially with multiple at once!
The solution? EmberAlert!!
Our program collects calls and analyzes them using Gemini API for factors such as the location, the size, the amount of people affected, how fast it grows, etc. and also the amount of calls from the same location. 
Then we rank the severity of the wildfires based on these factors, allowing firefighters to approach situations with a more objective plan.

---

## Implementation status

What is built and working in this repo is the **location** half of the above: turning
several vague verbal reports into one triangulated coordinate with a confidence score.
Callers describe smoke by landmark and bearing — *"a column behind the ridge past the
reservoir"* — and crews cannot launch on a sentence. Each caller's own position is
known, so each report yields a bearing and a rough range. Intersect the wedges and you
have a fix.

**Severity ranking is not implemented**, and it is worth a team decision before it is.
See "A note on what this does not do" at the end of this file — ranking whose emergency
matters most has real bias and liability problems, and the location problem turned out
to be the one nobody has solved.

## Setup

```bash
npm install
npm run dev        # http://localhost:3000 — click "Run demo"
```

That's it. No API key is required: committed fixture extractions drive the demo. To run
the live Gemini pipeline instead, copy `.env.example` to `.env.local` and add a key.

## How it works

**Gemini handles language, code handles geometry.** The model extracts only what the
caller said — landmarks, direction words, distance cues, smoke description — as
structured JSON. Every bearing, wedge and intersection is computed by Turf.js. The model
never produces a coordinate, so the fix is deterministic and auditable.

Extractions resolve through three tiers: `.cache/` (real model output from a previous
run, keyed by audio hash), then `fixtures/extractions/` (committed, hand-authored), then
a live API call. `DEMO_MODE=replay` stops at tier two and never touches the network.

Fusion is outlier-tolerant. A naive fold returns nothing the moment one wedge misses, so
each wedge is scored by how many others it agrees with, folded most-supported first, and
flagged rather than fatal when it cannot be reconciled. Call 5 in the scripted set is a
deliberate outlier and gets isolated.

## Commands

```bash
npm run verify        # offline check that the scenario converges, no key needed
npm run demo          # DEMO_MODE=replay — fixtures only, never calls the network
npm run gen:audio     # re-render the call WAVs (macOS `say`)
```

`node scripts/prefetch-tiles.mjs` refreshes the offline basemap in `public/tiles/`
(committed, ~11 MB). `NEXT_PUBLIC_OFFLINE=1` drops the live tile layer so you can
rehearse the offline demo without pulling the network down.

## Scenario

Six calls reporting one fire west of Okanagan Lake, BC. Five converge; the sixth is a
separate low white plume near the airport that the fusion step isolates.

| extractions | search area | error vs ignition | confidence |
|---|---|---|---|
| authored fixtures | 8.97 km² | 123 m | HIGH |
| live `gemini-3.5-flash` | 13.66 km² | 111 m | MEDIUM |

The live run lands at MEDIUM because a wider search area is the honest read on five
voice reports where only one gave a distance — and it is nonetheless accurate to 111 m.

`npx tsx scripts/compare-live.ts` re-runs the live model and diffs every field against
the fixtures. `npx tsx scripts/collapse-curve.ts` prints how the area shrinks per call.
A second scenario in `data/calls-gta.json` covers Rouge Park in the GTA; pass any
manifest path to those scripts to run it.

## A note on what this does not do

`description_specificity` measures how geometrically precise a caller's description was.
It is never a measure of how urgent, distressed or articulate they sounded. Scoring
emergency calls on how well somebody speaks under stress would systematically penalise
elderly callers, panicked callers, and callers speaking a second language. This system
resolves location only — it does not rank urgency and must not be used to decide whose
emergency matters more.

Confidence bands are set by what voice reports can physically support. A spoken 16-point
compass bearing is quantised to 22.5° sectors, so no verbal report constrains a direction
better than about ±11°; at a typical 7 km reporting range that alone puts a ~3 km floor
on the cross-range width of any fix. Sub-2 km² fixes are not reachable from voice and are
not claimed.
