import { 
  FireSimulation, 
  ROWS, 
  COLS, 
  STATE_NO_FIRE, 
  STATE_FIRE_HEAD, 
  STATE_FIRE_SIDE, 
  STATE_FIRE_HEEL 
} from './simulation.js';

const canvas = document.getElementById('fire-canvas');
const ctx = canvas.getContext('2d');

const sim = new FireSimulation();

let timerId = null;

// DOM Elements
const btnToggle = document.getElementById('btn-toggle');
const btnStep = document.getElementById('btn-step');
const btnReset = document.getElementById('btn-reset');
const windSelect = document.getElementById('wind-select');
const chkDynamicWind = document.getElementById('chk-dynamic-wind');
const speedRange = document.getElementById('speed-range');
const speedValText = document.getElementById('speed-val');

const statTicks = document.getElementById('stat-ticks');
const statWind = document.getElementById('stat-wind');
const statFire = document.getElementById('stat-fire');
const statHead = document.getElementById('stat-head');
const statSide = document.getElementById('stat-side');
const statHeel = document.getElementById('stat-heel');
const statGray = document.getElementById('stat-gray');

// Canvas dimensions and sizing (50x100 -> 10px per cell = 1000x500)
const CELL_SIZE = 10;

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const idx = sim.getIndex(r, c);
      const state = sim.grid[idx];

      let color = '#777777'; // Light Gray (Unburned tile)
      if (state === STATE_NO_FIRE) {
        if (sim.burnt[idx] === 1) {
          color = '#444444'; // Current Dark Gray (Burnt out dead tile)
        } else {
          color = '#777777'; // Light Gray (Unburned tile)
        }
      } else if (state === STATE_FIRE_HEAD) {
        color = '#ffea00'; // Yellow (Head)
      } else if (state === STATE_FIRE_SIDE) {
        color = '#ff9100'; // Orange (Side)
      } else if (state === STATE_FIRE_HEEL) {
        color = '#ff1744'; // Red (Heel / Origin)
      }

      ctx.fillStyle = color;
      ctx.fillRect(c * CELL_SIZE, r * CELL_SIZE, CELL_SIZE, CELL_SIZE);

      // Draw subtle grid outline
      ctx.strokeStyle = '#222222';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(c * CELL_SIZE, r * CELL_SIZE, CELL_SIZE, CELL_SIZE);

      // Draw dynamic Head marker (small black dot in center)
      if (idx === sim.headIndex && state !== STATE_NO_FIRE) {
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(c * CELL_SIZE + CELL_SIZE / 2, r * CELL_SIZE + CELL_SIZE / 2, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw dynamic Heel marker (small black dot in center)
      if (idx === sim.heelIndex && state !== STATE_NO_FIRE) {
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(c * CELL_SIZE + CELL_SIZE / 2, r * CELL_SIZE + CELL_SIZE / 2, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  updateStats();
}

function updateStats() {
  const stats = sim.getStats();
  statTicks.textContent = stats.ticks;
  if (statWind) statWind.textContent = `${stats.currentWindAngle}°`;
  statFire.textContent = stats.fireCount;
  statHead.textContent = stats.headCount;
  statSide.textContent = stats.sideCount;
  statHeel.textContent = stats.heelCount;
  statGray.textContent = stats.grayCount;
}

function stepSim() {
  sim.step();
  render();
}

function startSim() {
  if (sim.isRunning) return;
  sim.isRunning = true;
  btnToggle.textContent = 'Pause';
  timerId = setInterval(stepSim, sim.speedMs);
}

function stopSim() {
  sim.isRunning = false;
  btnToggle.textContent = 'Start';
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
}

// Event Listeners
btnToggle.addEventListener('click', () => {
  if (sim.isRunning) {
    stopSim();
  } else {
    startSim();
  }
});

btnStep.addEventListener('click', () => {
  stopSim();
  stepSim();
});

btnReset.addEventListener('click', () => {
  stopSim();
  sim.reset();
  render();
});

windSelect.addEventListener('change', (e) => {
  const angle = parseInt(e.target.value, 10);
  sim.setWindDirection(angle);
});

if (chkDynamicWind) {
  chkDynamicWind.addEventListener('change', (e) => {
    sim.dynamicWind = e.target.checked;
  });
}

speedRange.addEventListener('input', (e) => {
  const speed = parseInt(e.target.value, 10);
  sim.speedMs = speed;
  speedValText.textContent = `${speed}ms`;
  if (sim.isRunning) {
    stopSim();
    startSim();
  }
});

// Click on canvas to set Fire Origin
canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  const col = Math.floor(x / CELL_SIZE);
  const row = Math.floor(y / CELL_SIZE);

  if (row >= 0 && row < ROWS && col >= 0 && col < COLS) {
    stopSim();
    sim.setOrigin(row, col);
    render();
  }
});

// Initial render
render();
