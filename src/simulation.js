// 50x100 Fire Simulation Engine with Light/Dark Gray Tile States & Increased Lateral Spread

export const ROWS = 50;
export const COLS = 100;

// Cell Fire States
export const STATE_NO_FIRE = 0;      // Gray tile (unburned / burnt out ash)
export const STATE_FIRE_HEAD = 1;    // Yellow tile (head front - fast spread)
export const STATE_FIRE_SIDE = 2;    // Orange tile (body / sides - normal)
export const STATE_FIRE_HEEL = 3;    // Red tile (keel / trailing edge - dying ember)

export class FireSimulation {
  constructor() {
    this.rows = ROWS;
    this.cols = COLS;
    
    this.grid = new Int8Array(this.rows * this.cols);       // Current state
    this.fuel = new Uint8Array(this.rows * this.cols);       // Remaining fuel per tile
    this.maxFuel = new Uint8Array(this.rows * this.cols);    // Initial max fuel per tile
    this.burnt = new Uint8Array(this.rows * this.cols);     // 1 if tile is fully burnt out
    
    this.originIndex = -1;
    this.baseWindAngleDeg = 0; // 0 = East, 90 = South, 180 = West, 270 = North
    this.windAngleDeg = 0;     // Current dynamic wind angle
    this.dynamicWind = true;   // Dynamic wind gusts enabled by default
    
    this.ticks = 0;
    this.isRunning = false;
    this.speedMs = 200;

    // Head and Heel tile indices
    this.headIndex = -1;
    this.heelIndex = -1;

    // Set default origin near left-center of 50x100 grid
    this.setOrigin(Math.floor(this.rows / 2), 15);
  }

  getIndex(r, c) {
    return r * this.cols + c;
  }

  setOrigin(r, c) {
    this.reset();
    const idx = this.getIndex(r, c);
    this.originIndex = idx;
    
    // Ignite origin cluster (3x3 starting fire)
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < this.rows && nc >= 0 && nc < this.cols) {
          const nIdx = this.getIndex(nr, nc);
          this.grid[nIdx] = STATE_FIRE_HEAD;
          this.fuel[nIdx] = this.maxFuel[nIdx];
          this.burnt[nIdx] = 0;
        }
      }
    }
    
    this.updateHeadAndHeel();
  }

  reset() {
    this.grid.fill(STATE_NO_FIRE);
    this.burnt.fill(0);
    this.ticks = 0;

    // Initialize randomized fuel capacity strictly from 25 to 30 for every tile
    for (let i = 0; i < this.fuel.length; i++) {
      const fuelVal = Math.floor(25 + Math.random() * 6); // Integer from 25 to 30
      this.maxFuel[i] = fuelVal;
      this.fuel[i] = fuelVal;
    }

    if (this.originIndex >= 0) {
      const r = Math.floor(this.originIndex / this.cols);
      const c = this.originIndex % this.cols;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr >= 0 && nr < this.rows && nc >= 0 && nc < this.cols) {
            const nIdx = this.getIndex(nr, nc);
            this.grid[nIdx] = STATE_FIRE_HEAD;
            this.fuel[nIdx] = this.maxFuel[nIdx];
          }
        }
      }
    }
    
    this.updateHeadAndHeel();
  }

  setWindDirection(angleDeg) {
    this.baseWindAngleDeg = (angleDeg % 360 + 360) % 360;
    this.windAngleDeg = this.baseWindAngleDeg;
  }

  // Calculate dynamic Head (furthest downwind) and Heel (furthest upwind)
  updateHeadAndHeel() {
    const rad = (this.windAngleDeg * Math.PI) / 180;
    const wx = Math.cos(rad);
    const wy = Math.sin(rad);

    let maxProj = -Infinity;
    let minProj = Infinity;
    let headIdx = -1;
    let heelIdx = -1;

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const idx = this.getIndex(r, c);
        if (this.grid[idx] !== STATE_NO_FIRE) {
          const proj = c * wx + r * wy;

          if (proj > maxProj) {
            maxProj = proj;
            headIdx = idx;
          }
          if (proj < minProj) {
            minProj = proj;
            heelIdx = idx;
          }
        }
      }
    }

    this.headIndex = headIdx;
    this.heelIndex = heelIdx;
  }

  step() {
    this.ticks++;

    // Dynamic Wind Gusting (smooth sine + random fluctuation)
    if (this.dynamicWind) {
      const gustOffset = Math.sin(this.ticks * 0.12) * 22 + (Math.random() * 8 - 4);
      this.windAngleDeg = (this.baseWindAngleDeg + gustOffset + 360) % 360;
    } else {
      this.windAngleDeg = this.baseWindAngleDeg;
    }

    const newGrid = new Int8Array(this.grid);
    const newFuel = new Uint8Array(this.fuel);
    const newBurnt = new Uint8Array(this.burnt);

    // Wind direction unit vector
    const rad = (this.windAngleDeg * Math.PI) / 180;
    const wx = Math.cos(rad);
    const wy = Math.sin(rad);

    // 8-neighbor directions
    const neighbors = [
      { dr: -1, dc: 0 },  // North
      { dr: -1, dc: 1 },  // NE
      { dr: 0,  dc: 1 },  // East
      { dr: 1,  dc: 1 },  // SE
      { dr: 1,  dc: 0 },  // South
      { dr: 1,  dc: -1 }, // SW
      { dr: 0,  dc: -1 }, // West
      { dr: -1, dc: -1 }  // NW
    ];

    // Current Head & Heel positions (row, col)
    let headR = 0, headC = 0;
    if (this.headIndex >= 0) {
      headR = Math.floor(this.headIndex / this.cols);
      headC = this.headIndex % this.cols;
    }

    let heelR = 0, heelC = 0;
    if (this.heelIndex >= 0) {
      heelR = Math.floor(this.heelIndex / this.cols);
      heelC = this.heelIndex % this.cols;
    }

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const idx = this.getIndex(r, c);
        const currentState = this.grid[idx];

        if (currentState !== STATE_NO_FIRE) {
          // Trailing edge fuel consumption to push Heel forward
          const distFromHeel = Math.hypot(c - heelC, r - heelR);
          const burnRate = (distFromHeel < 4) ? 1.5 : 1.0;

          const currentFuel = this.fuel[idx];

          if (currentFuel <= burnRate) {
            newFuel[idx] = 0;
            newGrid[idx] = STATE_NO_FIRE;
            newBurnt[idx] = 1; // Mark tile as permanently burnt out dead
            continue;
          }

          const updatedFuel = currentFuel - burnRate;
          newFuel[idx] = updatedFuel;

          // State colors based on fuel ratio
          const maxF = this.maxFuel[idx];
          const fuelRatio = updatedFuel / maxF;

          if (fuelRatio > 0.55) {
            newGrid[idx] = STATE_FIRE_HEAD;   // Yellow
          } else if (fuelRatio > 0.20) {
            newGrid[idx] = STATE_FIRE_SIDE;   // Orange
          } else {
            newGrid[idx] = STATE_FIRE_HEEL;   // Red
          }

          // Proximity factor to Head or Heel
          const distToHead = Math.hypot(c - headC, r - headR);
          const distToHeel = Math.hypot(c - heelC, r - heelR);
          const minDistToKeyNodes = Math.min(distToHead, distToHeel);

          let proximityFactor = 1.0;
          if (minDistToKeyNodes > 4.5) {
            proximityFactor = Math.exp(-0.25 * (minDistToKeyNodes - 4.5));
          }

          // 2. Spread fire to unburned adjacent gray tiles
          for (const n of neighbors) {
            const nr = r + n.dr;
            const nc = c + n.dc;

            if (nr >= 0 && nr < this.rows && nc >= 0 && nc < this.cols) {
              const nIdx = this.getIndex(nr, nc);

              if (this.burnt[nIdx] === 0 && this.grid[nIdx] === STATE_NO_FIRE && newGrid[nIdx] === STATE_NO_FIRE) {
                const dx = n.dc;
                const dy = n.dr;
                const dist = Math.hypot(dx, dy);

                // Alignment cosine with wind vector (-1.0 to +1.0)
                const dot = (dx * wx + dy * wy) / dist;

                let baseSpreadChance = 0;

                if (dot > 0.55) {
                  // Direct Head / Downwind spread (88%)
                  baseSpreadChance = 0.88;
                } else if (Math.abs(dot) <= 0.35) {
                  // INCREASED Lateral (Perpendicular Crosswind) Spread (38%)
                  baseSpreadChance = 0.38;
                } else if (dot > 0.35 && dot <= 0.55) {
                  // UNTOUCHED Diagonal Lateral Spread (4%)
                  baseSpreadChance = 0.04;
                } else {
                  // Backing Spread (0.5%)
                  baseSpreadChance = 0.005;
                }

                const finalSpreadChance = baseSpreadChance * proximityFactor;

                if (Math.random() < finalSpreadChance) {
                  newGrid[nIdx] = STATE_FIRE_HEAD;
                  newFuel[nIdx] = this.maxFuel[nIdx];
                }
              }
            }
          }
        }
      }
    }

    this.grid = newGrid;
    this.fuel = newFuel;
    this.burnt = newBurnt;

    this.updateHeadAndHeel();
  }

  getStats() {
    let fireCount = 0;
    let headCount = 0;
    let sideCount = 0;
    let heelCount = 0;
    let grayUnburned = 0;
    let grayBurnt = 0;

    for (let i = 0; i < this.grid.length; i++) {
      const s = this.grid[i];
      if (s === STATE_NO_FIRE) {
        if (this.burnt[i] === 1) grayBurnt++;
        else grayUnburned++;
      } else {
        fireCount++;
        if (s === STATE_FIRE_HEAD) headCount++;
        else if (s === STATE_FIRE_SIDE) sideCount++;
        else if (s === STATE_FIRE_HEEL) heelCount++;
      }
    }

    return {
      ticks: this.ticks,
      totalTiles: this.grid.length,
      grayUnburned,
      grayBurnt,
      grayCount: grayUnburned + grayBurnt,
      fireCount,
      headCount,
      sideCount,
      heelCount,
      currentWindAngle: Math.round(this.windAngleDeg)
    };
  }
}
