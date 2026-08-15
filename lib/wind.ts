export type WindData = {
  speedKmH: number;
  speedKnots: number;
  directionDeg: number; // direction wind is coming FROM
  directionCardinal: string;
  gustsKmH: number;
  gridPoints: WindGridPoint[];
  waveFronts: ContinuousWaveFront[];
};

export type WindGridPoint = {
  id: string;
  lat: number;
  lng: number;
  speedKmH: number;
  speedKnots: number;
  directionDeg: number;
};

export type ContinuousWaveFront = {
  id: string;
  speedKmH: number;
  directionDeg: number;
  color: string;
  latLngs: [number, number][];
};

const CARDINALS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

export function degreesToCardinal(deg: number): string {
  const index = Math.round(((deg % 360) + 360) % 360 / 22.5) % 16;
  return CARDINALS[index];
}

/**
 * Fetch real-time wind forecast data from Open-Meteo API with fallback
 * Doubled geographic coverage region size
 */
export async function fetchRealtimeWind(lat: number = 49.868, lng: number = -119.575): Promise<WindData> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=wind_speed_10m,wind_direction_10m,wind_gusts_10m`;
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const speedKmH = Math.round(data.current.wind_speed_10m ?? 24);
    const directionDeg = Math.round(data.current.wind_direction_10m ?? 295);
    const gustsKmH = Math.round(data.current.wind_gusts_10m ?? 38);
    const speedKnots = Math.round(speedKmH / 1.852);

    const gridPoints = generateDoubledGridPoints(lat, lng, speedKmH, directionDeg);
    const waveFronts = generateContinuousWaveFronts(lat, lng, speedKmH, directionDeg);

    return {
      speedKmH,
      speedKnots,
      directionDeg,
      directionCardinal: degreesToCardinal(directionDeg),
      gustsKmH,
      gridPoints,
      waveFronts,
    };
  } catch {
    // Fallback data if offline or timeout
    const speedKmH = 26;
    const directionDeg = 290; // WNW
    const speedKnots = Math.round(speedKmH / 1.852);

    const gridPoints = generateDoubledGridPoints(lat, lng, speedKmH, directionDeg);
    const waveFronts = generateContinuousWaveFronts(lat, lng, speedKmH, directionDeg);

    return {
      speedKmH,
      speedKnots,
      directionDeg,
      directionCardinal: degreesToCardinal(directionDeg),
      gustsKmH: 42,
      gridPoints,
      waveFronts,
    };
  }
}

/**
 * Generate 7x7 grid points spanning DOUBLED geographic area (~1.0° lat x 1.4° lng)
 */
function generateDoubledGridPoints(centerLat: number, centerLng: number, baseSpeedKmH: number, baseDirDeg: number): WindGridPoint[] {
  const points: WindGridPoint[] = [];
  const latStep = 0.14; // Doubled step size
  const lngStep = 0.20; // Doubled step size

  let idx = 0;
  for (let r = -3; r <= 3; r++) {
    for (let c = -3; c <= 3; c++) {
      const lat = centerLat + r * latStep;
      const lng = centerLng + c * lngStep;
      const localSpeed = Math.max(10, Math.round(baseSpeedKmH + (r * 3 - c * 2.5)));
      const localDir = (baseDirDeg + (r * 4 + c * 5) + 360) % 360;

      points.push({
        id: `grid-${idx++}`,
        lat,
        lng,
        speedKmH: localSpeed,
        speedKnots: Math.round(localSpeed / 1.852),
        directionDeg: localDir,
      });
    }
  }

  return points;
}

/**
 * Generate continuous wave front lines connecting regions of similar wind speed and magnitude across 2x area
 */
function generateContinuousWaveFronts(centerLat: number, centerLng: number, baseSpeedKmH: number, baseDirDeg: number): ContinuousWaveFront[] {
  const fronts: ContinuousWaveFront[] = [];
  const latStep = 0.14;
  const lngStep = 0.22;

  // Generate 6 continuous wave fronts traversing perpendicular to wind direction across expanded region
  const colors = ["#38bdf8", "#38bdf8", "#0ea5e9", "#f59e0b", "#f97316", "#ef4444"];
  const speedOffsets = [-6, -3, 0, 4, 8, 12];

  for (let f = -3; f <= 2; f++) {
    const frontIdx = f + 3;
    const waveSpeed = Math.max(12, Math.round(baseSpeedKmH + speedOffsets[frontIdx]));
    const color = colors[frontIdx] || "#38bdf8";

    // Build curved wave line across longitude span
    const latLngs: [number, number][] = [];
    const baseLat = centerLat + f * latStep;

    // Create 9 control points along the wave front with smooth undulating sine offset
    for (let col = -4; col <= 4; col++) {
      const lng = centerLng + col * lngStep;
      // Smooth continuous wave oscillation along the front
      const waveOffset = Math.sin(col * 0.8 + f * 1.2) * 0.045 + Math.cos(col * 0.5) * 0.025;
      const lat = baseLat + waveOffset;
      latLngs.push([lat, lng]);
    }

    fronts.push({
      id: `front-${frontIdx}`,
      speedKmH: waveSpeed,
      directionDeg: (baseDirDeg + f * 3 + 360) % 360,
      color,
      latLngs,
    });
  }

  return fronts;
}
