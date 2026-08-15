# BUILD TASK: SmokeFix — wildfire smoke-call triangulation demo

You are building a complete, working hackathon demo in one session. Read this entire
brief before writing any code. Follow the "Known failure modes" section literally —
each item there is a real bug that will otherwise cost hours.

> **This brief has been built once. See "Corrections from the actual build" at the
> end before starting — it supersedes the stack in section 4 and adds six failure
> modes that section 5 did not anticipate, including one that makes the originally
> specified map library unusable.**

---

## 1. What this is

Wildfire dispatch has a location problem. People phoning in a smoke sighting describe
it by landmark and direction — "there's a column behind the ridge past the golf course"
— and initial attack crews cannot launch on a sentence. SmokeFix turns several vague
verbal reports into one triangulated coordinate with a confidence score.

Each caller's own position is known (that's how 911 works). Each call yields a bearing
and a rough distance toward the smoke. Two or more callers in different places give you
intersecting wedges. The intersection is the fire.

The demo's single visual idea: **watch the search area collapse as calls come in.**
Every build decision serves that 90 seconds.

## 2. Core architectural rule — do not violate this

**Gemini handles language. Code handles geometry.**

Gemini extracts what the caller said: landmarks, direction words, distance cues, smoke
description. Turf.js computes every bearing, every wedge, every intersection. Never ask
the model to do trigonometry or to output coordinates.

Reasons: the math becomes deterministic and correct, the map updates instantly instead
of waiting on a model round-trip, and the demo can answer "how do you know that location
is right?" with "it's geometry, not a guess."

## 3. Non-goals — do not build these

No authentication. No database (JSON files and React state only). No deployment
(localhost only — conference wifi is unreliable and a deployed URL is a liability).
No mobile layout. No test suite beyond one smoke test. No user accounts, no upload UI,
no settings page. Resist all scope creep; the demo is the product.

## 4. Stack

- Next.js (App Router) + TypeScript + Tailwind
- `@google/genai` — the Gemini SDK
- `maplibre-gl` — map rendering, no API key needed
- `@turf/turf` — geospatial math
- Esri World Imagery raster tiles — satellite basemap, no key needed
- Node filesystem for the response cache

Scaffold with:

    npx create-next-app@latest smokefix --typescript --tailwind --app

Then:

    npm install @google/genai maplibre-gl @turf/turf

## 5. Known failure modes — handle these explicitly

**5.1 Turf v7 changed the `intersect` signature.** In v6 it was
`intersect(polyA, polyB)`. In v7 it takes a FeatureCollection:
`intersect(featureCollection([polyA, polyB]))`. Check the installed version in
`package.json` and use the matching form. Same applies to `union`.

**5.2 MapLibre cannot server-side render.** It touches `window` at import time. Put the
map in a `"use client"` component and load it with
`dynamic(() => import("./MapView"), { ssr: false })`. Import
`"maplibre-gl/dist/maplibre-gl.css"` or the map renders as a blank grey box with no error.

**5.3 The Esri tile URL is `{z}/{y}/{x}`, not `{z}/{x}/{y}`.** Getting this backwards
produces a map that looks plausible but is scrambled. Use exactly:

    https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}

Add an `attribution` field crediting Esri on the raster source.

**5.4 Do not normalize sector bearings into [0, 360).** `turf.bearing` returns
-180 to 180. Pass `center - spread` and `center + spread` to `turf.sector` directly,
even when negative. Normalizing into [0, 360) creates cases where the start bearing
exceeds the end bearing and the sector is drawn the long way around the compass.

**5.5 Verify the Gemini SDK surface and model ID before writing against them.** Model
names change often. Check https://ai.google.dev/gemini-api/docs/models and pick the
current Flash model (Flash is correct here — do not use Pro, you need latency, not depth).
Confirm the SDK call shape against the installed package's TypeScript types rather than
from memory. As of writing, the shape is:

    import { GoogleGenAI } from "@google/genai";
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const res = await ai.models.generateContent({
      model: MODEL_ID,
      contents: [{ role: "user", parts: [
        { text: promptText },
        { inlineData: { mimeType: "audio/wav", data: base64Audio } }
      ]}],
      config: { responseMimeType: "application/json", responseSchema: SCHEMA }
    });

If the installed types disagree with this, trust the types.

**5.6 N-way intersection returns null if any single wedge misses.** Do not fold blindly.
See section 8.3 for the required outlier-tolerant approach.

**5.7 API routes that read files need the Node runtime.** Add
`export const runtime = "nodejs";` to the extraction route.

## 6. File structure

    app/
      page.tsx                    # demo shell, call timeline, fix readout
      api/extract/route.ts        # audio -> structured JSON via Gemini
    components/
      MapView.tsx                 # "use client", MapLibre, wedges + fix polygon
      CallTimeline.tsx            # list of calls, play buttons, per-call status
    lib/
      schema.ts                   # response schema + TS types
      geometry.ts                 # bearings, wedges, fusion, confidence
      cache.ts                    # disk cache + replay mode
      landmarks.ts                # pre-geocoded landmark fixtures
    data/
      calls.json                  # call metadata: id, audio path, caller lat/lng, t+offset
    public/calls/
      call-01.wav ... call-06.wav
    .cache/                       # gitignored, holds cached model responses

## 7. Demo data — build this before the AI integration

**Location:** the Okanagan Valley in British Columbia — real wildland-urban interface,
real fire history, dramatic terrain that reads well on satellite imagery. Work inside
roughly 49.70–49.95 N, 119.40–119.80 W (Peachland / West Kelowna / Kelowna).

Populate `lib/landmarks.ts` with 8–12 genuine landmarks from that area — highways, parks,
golf courses, marinas, named ridges — each with its real coordinate. Verify every
coordinate by eye against the satellite basemap before continuing; a landmark placed in
the middle of the lake will wreck the geometry and be invisible in code review.

**Six calls, scripted as a narrative:**

- Calls 1–4: four different callers, positioned on distinct sides of the target, all
  describing the same fire. Vary the quality deliberately — one gives a compass direction,
  one gives only a landmark, one is panicked and vague, one is a calm off-duty local who
  gives a good bearing and a distance.
- Call 5: an outlier. Someone reporting smoke that is actually a different thing, or
  mis-stating the landmark. This wedge must not intersect the others. It exists to prove
  the outlier handling works, and it is a strong demo moment.
- Call 6: a corroborating late call that tightens the fix.

Place one call's target at a specific coordinate you choose in advance, and write the
scripts so the geometry actually converges there. Record the ground-truth coordinate in
`data/calls.json` so the UI can display the error distance — showing "fix was 340 m from
truth" is far more persuasive than showing a polygon.

**Generate the audio on macOS:**

    say -o public/calls/call-01.wav --data-format=LEI16@22050 "script text here"

Use a different voice per call for realism (`say -v '?'` lists installed voices; fall
back to the default voice and vary `-r` for rate if a named voice is missing). Commit
the wav files. Never generate audio during the demo.

## 8. Implementation detail

### 8.1 Extraction schema (`lib/schema.ts`)

    {
      landmarks: [{ name: string, relation: "behind"|"near"|"past"|"left_of"|"right_of" }],
      direction: { compass: string | null, relative: string | null },
      distance_hint: { value: number | null, unit: "km"|"m"|"miles"|null,
                       vagueness: "precise"|"rough"|"none" },
      smoke: { color: string, volume: "wisp"|"column"|"wall", drift_direction: string | null },
      description_specificity: number,   // 0-1, see the warning below
      secondhand: boolean,
      notes: string
    }

**`description_specificity` measures how precise the caller's description was — never
how urgent or distressed they sounded.** Say this in the prompt to the model, put it in
a code comment, and say it out loud during the pitch. Scoring emergency priority by how
articulate a caller is would systematically penalise elderly, panicked, and
second-language callers. This project deliberately does not rank urgency; it only
resolves location.

### 8.2 One call to one wedge (`lib/geometry.ts`)

Derive the bearing in this priority order:

1. If a landmark is named and resolvable, `turf.bearing(callerPoint, landmarkPoint)`.
   For relation `"behind"` or `"past"`, keep the bearing and push the near edge of the
   range out past the landmark's distance.
2. Otherwise convert `direction.compass` ("northeast", "NNW") to degrees.
3. If neither is available, mark the call unusable and show it greyed out in the timeline.

Angular spread from `distance_hint.vagueness` and `description_specificity`: use about
15° for a precise description, 30° for rough, 45° for vague. Radial range: use the stated
distance ±40% when given, otherwise 2–15 km.

Build the wedge with `turf.sector(callerPoint, radiusKm, bearing - spread, bearing + spread)`
— remembering rule 5.4 about not normalizing.

### 8.3 Fusion — outlier tolerant (required)

Fold the wedges in sequence. When adding a wedge produces a null or empty intersection,
**skip that wedge, flag it as inconsistent, and continue with the rest.** Do not abort.

Surface the flagged call in the UI as "inconsistent — possible separate report." This
both prevents one bad caller from destroying the fix and gives you a genuinely impressive
moment in the demo.

Report the fix as: the intersection polygon, its centroid, its area in km², the count of
consistent calls, and — since you know the ground truth — the distance from centroid to
truth.

Confidence banding: HIGH when area is under 2 km² with 3 or more consistent calls;
MEDIUM when under 10 km² with 2 or more; LOW otherwise.

If you finish early, upgrade fusion to a probability grid: rasterize the area into ~200 m
cells, add weight per wedge covering each cell, take the peak region. It degrades more
gracefully than polygon intersection. Only attempt this once the wedge version works
end to end.

### 8.4 Replay cache (`lib/cache.ts`) — build this before polishing anything

Key each cache entry on a SHA-256 of the audio file bytes plus a prompt-version string.
Write responses as JSON under `.cache/`.

Support `DEMO_MODE=replay` in the environment: when set, serve exclusively from cache and
never touch the network. **The full demo must run start to finish with wifi switched off.**
Verify this by actually disabling wifi and running it — do not assume.

This is the highest-value hour in the build. Venue networks fail during judging.

### 8.5 UI (`app/page.tsx`, `components/`)

Left: the call timeline — each call with a play button, the caller's position, a status
chip (pending / extracted / inconsistent), and the extracted fields once available.
Right: the map, filling the viewport.

Behaviour: clicking a call plays its audio and, when extraction returns, animates its
wedge onto the map. The current fix polygon redraws after each call, along with a readout
panel showing area in km², confidence band, consistent call count, elapsed time since the
first call, and the distance from ground truth.

Add a "Run demo" button that plays all six calls in sequence with a short pause between —
so the operator can trigger the whole sequence and talk over it rather than clicking under
pressure.

Style it dark. Satellite imagery with a dark UI reads as an operations tool, which is the
impression you want.

## 9. Build order — follow this sequence

1. Scaffold, install, confirm the dev server runs.
2. Verify the Gemini SDK surface and current model ID (rule 5.5). Get one hardcoded audio
   file to structured JSON printed to the console. **Do not proceed until this works** —
   it is the only genuinely risky integration in the project.
3. Landmark fixtures and the six call scripts; generate the wav files.
4. Map rendering with the Esri basemap and static caller pins.
5. One wedge on the map from one real extraction.
6. Multi-wedge fusion with outlier handling.
7. The replay cache, then verify with wifi off.
8. Timeline UI, run-demo sequencing, readout panel.
9. Probability grid only if everything above is solid.

## 10. Definition of done

- `npm run dev` starts cleanly with no console errors and no hydration warnings.
- Clicking "Run demo" plays all six calls and converges to a fix without intervention.
- The outlier call is visibly flagged rather than silently dropped or fatal.
- The whole demo runs with `DEMO_MODE=replay` and wifi disabled.
- The readout shows area, confidence, call count, elapsed time, and error distance.
- `README.md` documents setup in under ten lines, including where to put the API key.
- No API key is committed. `.env.local` and `.cache/` are both gitignored.

## 11. When you are done

Report: what you verified about the SDK and model ID versus this brief, which Turf
version is installed and which `intersect` signature you used, the final error distance
of the fix from ground truth, and anything you deliberately left unfinished.

---

# Corrections from the actual build

Built 2026-08-15 against Next 16.3.1, React 19.2.8, @google/genai 2.17.1, Turf 7.4.0.
These supersede the sections above where they conflict.

## C1. The map library changed: Leaflet, not MapLibre

**MapLibre GL v6 cannot initialise under Turbopack at all.** It spawns a tile-decoding
web worker; Turbopack does not emit that worker as a loadable chunk, so the request
falls through to the app router, returns HTML, and the browser rejects it for a
non-JavaScript MIME type. The map then hangs before its style ever loads — `loaded()`
and `isStyleLoaded()` stay false, the stylesheet is never applied, and **nothing is
reported on the map's own `error` channel**. A minimal style with zero sources also
fails, which is how you can confirm it is not your code.

`setWorkerUrl()` pointed at a copy of the worker in `public/` does not fix it, even
though `getWorkerUrl()` then returns the right path and that URL constructs a module
worker fine by hand.

Use **Leaflet**. This demo is a raster basemap with GeoJSON polygons and HTML markers —
none of MapLibre's vector-tile machinery is used. Leaflet has no worker and no WebGL
requirement, so the entire failure class disappears. Use `divIcon` for every marker,
which also sidesteps Leaflet's broken default-icon paths under bundlers.

Replace section 4's map line with `leaflet` + `@types/leaflet`, and note:

- Leaflet paints `.leaflet-container` light grey by default — override it, or the map
  flashes white before tiles arrive and stays white if they never do.
- Leaflet panes sit at z-index 400 and controls at 800. **Overlay UI needs an explicit
  z-index above those** or it renders underneath the map and looks like it vanished.
- Leaflet measures its container on creation. Inside a flex layout that happens before
  the layout settles, so attach a `ResizeObserver` calling `map.invalidateSize()`.
  (MapLibre needed the same thing via `map.resize()`.)

## C2. A landmark the caller is standing at produces a garbage bearing

`turf.bearing` between two near-identical points is numerical noise — it returns 0,
silently pointing every such wedge due north. Callers naming their own location ("I'm
out by the airport") are completely normal, so skip any landmark closer than ~500 m to
the caller and fall through to the compass. Without this the outlier call in the
scripted set gets flagged for the wrong reason, which looks correct and is not.

## C3. Sub-2 km² confidence is not physically achievable — do not promise it

Section 8.3's "HIGH = under 2 km²" was wrong on the physics. A spoken 16-point compass
bearing is quantised to 22.5° sectors, so no verbal report constrains a direction better
than about ±11°. At a typical 7 km reporting range that alone puts a ~3 km floor on the
cross-range width of the fix, and therefore a few km² floor on its area. Tightening the
angular spread far enough to beat it makes realistic compass rounding fall outside the
wedge, and calls start missing.

Anchor the bands on something operational instead: a spotter aircraft sweeps on the order
of 10 km² per orbit, so HIGH = under 10 km² with 3+ consistent calls, MEDIUM = under
40 km² with 2+. Tighten the *radial* tolerance rather than the angular one when you need
a smaller area — a confident figure from a trained observer is worth ±25%, a hedged
"eight k maybe" is not.

Achieved on the authored scenario: **7.94 km², 533 m from ground truth, five of six
calls consistent, outlier isolated.**

## C4. Give distance-less reports a visibility-based range

Section 8.2's 2–15 km fallback is too short. A caller 15.7 km away reporting a big column
is realistic and their wedge simply will not reach the fire, so the scenario never
converges. Key the fallback range to smoke volume instead: wall 2–30 km, column 2–22 km,
wisp 1–10 km. It is physically motivated — a wall of smoke is visible much further than
a wisp — and it fixes the geometry.

## C5. `audio.play()` rejection hangs the run-demo sequence

If an autoplay policy rejects `play()`, **neither `onended` nor `onerror` fires**, so an
`await` on audio completion never resolves and the sequence wedges silently — in front of
an audience. Resolve the same promise from `onended`, `onerror`, `play().catch()` **and**
a timeout backstop.

## C6. Drop `next/font/google`

It fetches fonts at build time, which is one more thing to fail when the venue network
does. Use system font stacks; an operations tool looks right in them anyway.

## C7. Prefetch the basemap or "works offline" is not true

`DEMO_MODE=replay` removes the model from the network path, but satellite tiles are still
a live dependency and the map is most of the demo. Prefetch the scenario bbox (zoom 9–13
was 730 tiles / 11 MB) into `public/tiles/` and commit them. Layer the local tiles *over*
the live layer: offline the live layer fails and local carries it; online, anything
outside the prefetched box 404s locally and the live layer shows through. No branching.

Make the bbox wider than the callers — it must cover the `fitBounds` view *including
padding* at every stage, or an uncovered grey band appears at the edge offline.

Add a `NEXT_PUBLIC_OFFLINE=1` switch that drops the live layer, so the offline path can
be rehearsed and verified without actually taking the network down. Verify by asserting
`performance.getEntriesByType('resource')` contains zero cross-origin entries.

## C8. Verify the geometry before building any UI

The single highest-value step. `scripts/verify-geometry.ts` runs every fixture through
the real pipeline with no network and no key, prints each call's derived bearing against
the true bearing to ground truth, and asserts the scenario converges and the authored
outlier is flagged. It caught both C2 and C3 in seconds, before a line of UI existed.

## C9. Ship fixtures, not just a cache

Section 8.4's cache alone cannot run on a machine that has never had an API key. Commit
hand-authored extractions in `fixtures/extractions/<callId>.json` as a third tier below
the hash-keyed cache. The app then runs fully with no key at all, and the UI can badge
which tier each row came from — honest, and it makes the live/offline distinction visible
rather than hidden.
