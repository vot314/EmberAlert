# EmberAlert

Given the recent wildfire incidents in North America, we were inspired to explore potential ways to help firefighting and/or rescue efforts. More specifically, we wanted to focus on improving the communication and organization between firefighters, leading us to create EmberAlert

## What it does

When several wildfires are burning at once, dispatchers have to decide which one to send
crews to first. EmberAlert uses the Gemini API to listen to calls and analyze them through tone, location, urgency, and volume of calls, and displays them on a map in real time. We then pair it with wind speed data from Open-Meteo Weather API to rank incidents based on severity and distance.



## Quick start

```bash
npm install
npm run dev
```

Open [localhost:3000](http://localhost:3000) and click **Analyse all calls**. No API key
is needed; the repo ships with saved Gemini results so it works straight away.

## How it works

Each recording is sent to **Gemini** as audio, with no separate transcription step. The
model returns structured JSON: the place name, its coordinates, what is burning and what
is threatened, and a severity score from 0 to 100. Code then does all the maths — fires
within 25 km of each other are merged into one incident, and incidents are sorted by
severity with a bonus for extra corroborating calls. The model never calculates a
position or a ranking itself, so those results are predictable and easy to check.

## The calls

Five recordings from across British Columbia, in `public/reports/`.

| Call | Fire | Severity |
|---|---|---|
| whistler1 + whistler2 | Whistler — house burning, spreading fast | **100** Critical |
| kamloops | Kamloops — out of control | 55 High |
| silverstarvernon | Silver Star Park — smoke near a campground | 30 Moderate |
| vancouver | Vancouver — small street fire | 20 Low |

The two Whistler callers describe the same fire, so they merge into a single incident.

## Using a live API key

Copy `.env.example` to `.env.local` and add a `GEMINI_API_KEY` to analyse the audio live
instead of using the saved results. The free tier allows **20 requests per day per
model**, so if you run out, set `GEMINI_MODEL` to another one — `gemini-3.5-flash-lite`
and `gemini-flash-lite-latest` both work. Results are cached on disk, so repeat runs cost
nothing.

## Project layout

| Path | What it is |
|---|---|
| `app/page.tsx` | The dashboard |
| `app/api/extract/` | Sends a recording to Gemini |
| `lib/schema.ts` | What we ask Gemini for |
| `lib/fires.ts` | Merging and ranking |
| `lib/wind.ts` | Live wind fronts (Open-Meteo) |
| `components/MapView.tsx` | Leaflet map, markers and wind |
| `fixtures/extractions/` | Saved results, used when there is no key |
| `backend/` | Separate Python experiment |

## Commands

```bash
npm run dev       # start the app
npm run build     # production build
npm run analyze   # re-run Gemini on all recordings and refresh the saved results
npm run lint      # eslint
```

## A note on scoring

Severity scores the **fire**, not the caller. A panicking caller and a calm caller
reporting the same fire get the same score, because the ranking reflects danger rather
than how someone sounds under pressure.

## Built with

Next.js 16, React 19, TypeScript, Tailwind, Leaflet, Esri satellite tiles, Open-Meteo,
and the Gemini API.
