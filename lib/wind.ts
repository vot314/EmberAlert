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
  directionDeg: number; // wind direction (deg coming FROM)
  flowAngleDeg: number; // direction wind is blowing TOWARD (directionDeg - 180 + 360) % 360
  color: string;
  latLngs: [number, number][];
};

const CARDINALS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

export function degreesToCardinal(deg: number): string {
  const index = Math.round(((deg % 360) + 360) % 360 / 22.5) % 16;
  return CARDINALS[index];
}

/**
 * Maps wind speed (10-45 km/h) to a gradient from light blue (#93c5fd) to dark blue (#1e3a8a)
 */
export function getWindSpeedBlueGradient(speedKmH: number): string {
  const minSpeed = 10;
  const maxSpeed = 40;
  const ratio = Math.min(1, Math.max(0, (speedKmH - minSpeed) / (maxSpeed - minSpeed)));

  // Color Stops: Light Sky Blue -> Vibrant Royal Blue -> Deep Dark Navy Blue
  if (ratio < 0.33) {
    // #93c5fd -> #3b82f6
    const t = ratio / 0.33;
    const r = Math.round(147 + (59 - 147) * t);
    const g = Math.round(197 + (130 - 197) * t);
    const b = Math.round(253 + (246 - 253) * t);
    return `rgb(${r}, ${g}, ${b})`;
  } else if (ratio < 0.66) {
    // #3b82f6 -> #1d4ed8
    const t = (ratio - 0.33) / 0.33;
    const r = Math.round(59 + (29 - 59) * t);
    const g = Math.round(130 + (78 - 130) * t);
    const b = Math.round(246 + (216 - 246) * t);
    return `rgb(${r}, ${g}, ${b})`;
  } else {
    // #1d4ed8 -> #172554
    const t = (ratio - 0.66) / 0.34;
    const r = Math.round(29 + (23 - 29) * t);
    const g = Math.round(78 + (37 - 78) * t);
    const b = Math.round(216 + (84 - 216) * t);
    return `rgb(${r}, ${g}, ${b})`;
  }
}

/**
 * Fetch real-time wind forecast data with 2x doubled geographic area
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
 * Generate 11x11 grid points spanning DOUBLED geographic area (~2.8° lat x 4.4° lng)
 */
function generateDoubledGridPoints(centerLat: number, centerLng: number, baseSpeedKmH: number, baseDirDeg: number): WindGridPoint[] {
  const points: WindGridPoint[] = [];
  const latStep = 0.28; // Doubled step size
  const lngStep = 0.44; // Doubled step size

  let idx = 0;
  for (let r = -5; r <= 5; r++) {
    for (let c = -5; c <= 5; c++) {
      const lat = centerLat + r * latStep;
      const lng = centerLng + c * lngStep;
      const localSpeed = Math.max(10, Math.round(baseSpeedKmH + (r * 2.5 - c * 2)));
      const localDir = (baseDirDeg + (r * 3 + c * 4) + 360) % 360;

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
 * Generate 14 continuous wave front lines across doubled region with blue speed gradient
 */
function generateContinuousWaveFronts(centerLat: number, centerLng: number, baseSpeedKmH: number, baseDirDeg: number): ContinuousWaveFront[] {
  const fronts: ContinuousWaveFront[] = [];
  const latStep = 0.16;
  const lngStep = 0.24;

  const speedOffsets = [-12, -10, -8, -6, -4, -2, 0, 2, 5, 8, 11, 14, 17, 20];

  let frontCounter = 0;
  for (let f = -7; f <= 6; f++) {
    const waveSpeed = Math.max(10, Math.round(baseSpeedKmH + speedOffsets[frontCounter]!));
    const color = getWindSpeedBlueGradient(waveSpeed);
    const localDir = (baseDirDeg + f * 2.5 + 360) % 360;
    const flowAngleDeg = (localDir + 180) % 360; // Direction wind is blowing TOWARD

    const latLngs: [number, number][] = [];
    const baseLat = centerLat + f * latStep;

    // Create 15 control points along each wave front curve spanning wide longitude
    for (let col = -7; col <= 7; col++) {
      const lng = centerLng + col * lngStep;
      const waveOffset = Math.sin(col * 0.6 + f * 1.1) * 0.055 + Math.cos(col * 0.4) * 0.03;
      const lat = baseLat + waveOffset;
      latLngs.push([lat, lng]);
    }

    fronts.push({
      id: `front-${frontCounter++}`,
      speedKmH: waveSpeed,
      directionDeg: localDir,
      flowAngleDeg,
      color,
      latLngs,
    });
  }

  return fronts;
}
