
const TIMER_ACTIONS = {
  START_TIMER: 'start-timer',
  PAUSE_TIMER: 'pause-timer',
  RESUME_TIMER: 'resume-timer',
  STEP_TIMER: 'step-timer',
  END_TIMER: 'end-timer',
};

const SESSION_STATES = {
  IDLE: 'idle',
  RUNNING: 'running',
  PAUSED: 'paused',
};

const SESSION_TOGGLE_LABELS = {
  [SESSION_STATES.IDLE]: 'Start',
  [SESSION_STATES.RUNNING]: 'Pause',
  [SESSION_STATES.PAUSED]: 'Resume',
};

const TIMER_TYPES = {
  WORK_TIMER: 'work-timer',
  BREAK_TIMER: 'break-timer',
};


let workDuration = 25;
function setWorkDuration(value) {
  const number = toPositiveInteger(value);
  if (!number) return;
  workDuration = number;
  localStorage.setItem('workDuration', number);
  renderSessionSummary();
  renderTimerReadout();
}

let workTimes = 3;
function setWorkTimes(value) {
  const number = toPositiveInteger(value);
  if (!number) return;
  workTimes = number;
  localStorage.setItem('workTimes', number);
  renderSessionSummary();
  renderTimerReadout();
}

let breakDuration = 5;
function setBreakDuration(value) {
  const number = toPositiveInteger(value);
  if (!number) return;
  breakDuration = number;
  localStorage.setItem('breakDuration', number);
  renderSessionSummary();
  renderTimerReadout();
}


let tomatoSessionTimes = null;
let sessionState = SESSION_STATES.IDLE;
let sessionToggleButton = null;
let analogTimerWrapper = null;

let analogTimerCircle = null;
let analogTimerNeedle = null;
let analogTimerNeedleDegRotation = 0;
let analogTimerCompletion = null;
let analogTimerCompletionDegPosition = 0;
let analogTimerWorkPhasesStepSize = null;
let analogTimerBreakPhasesStepSize = null;
let analogTimerPhasesSeparators = [];

let timerTimeLabel = null;
let timerPhaseLabel = null;
let sessionSummaryLabel = null;
// What the label under the clock says: the timer running and the seconds it has left.
let currentTimerType = null;
let currentTimerRemaining = 0;

let notificationSound = null;

let settingsDialogContent = null;
let settingsDialogClosedContent = null;

let timerWorker = null;
// Settles the timer that is running, with `false` when it was aborted, so the
// session loop can stop instead of waiting forever on a terminated worker.
let settleCurrentTimer = null;


function toggleTomatoSession() {
  switch (sessionState) {
    case SESSION_STATES.IDLE:
      startTomatoSession();
      break;
    case SESSION_STATES.RUNNING:
      pauseTomatoSession();
      break;
    case SESSION_STATES.PAUSED:
      resumeTomatoSession();
  }
}

function setSessionState(state) {
  sessionState = state;
  sessionToggleButton.textContent = SESSION_TOGGLE_LABELS[state];
  analogTimerWrapper.classList.toggle('paused', state === SESSION_STATES.PAUSED);
  if (state === SESSION_STATES.IDLE) currentTimerType = null;
  renderTimerReadout();
}

async function startTomatoSession() {
  requestNotificationsPermission();
  setSessionState(SESSION_STATES.RUNNING);
  tomatoSessionTimes = workTimes;
  setupAnalogTimerPhases();
  while (tomatoSessionTimes !== 0) {
    tomatoSessionTimes -= 1;
    if (!await startTimer(TIMER_TYPES.WORK_TIMER)) return;
    recordCompletedPhase(TIMER_TYPES.WORK_TIMER);
    notificationSound.play();
    new Notification('Time to have a break!');
    if (tomatoSessionTimes !== 0) {
      if (!await startTimer(TIMER_TYPES.BREAK_TIMER)) return;
      recordCompletedPhase(TIMER_TYPES.BREAK_TIMER);
      notificationSound.play();
      if (tomatoSessionTimes === 0) {
        new Notification ('Good job, you finished your pomodoro!')
      } else {
        new Notification ('Let\'s get back to work.')
      }
    }
  }
  stopTomatoSession();
}

function pauseTomatoSession() {
  if (!timerWorker) return;
  timerWorker.postMessage({ action: TIMER_ACTIONS.PAUSE_TIMER });
  setSessionState(SESSION_STATES.PAUSED);
}

function resumeTomatoSession() {
  if (!timerWorker) return;
  timerWorker.postMessage({ action: TIMER_ACTIONS.RESUME_TIMER });
  setSessionState(SESSION_STATES.RUNNING);
}

function stopTomatoSession() {
  stopTimer();
  setSessionState(SESSION_STATES.IDLE);
  resetAnalogTimerNeedle();
  resetAnalogTimerCompletion();
  cleanupAnalogTimerPhases();
}


async function startTimer(timerType) {
  let timerSeconds = 0;
  switch(timerType) {
    case TIMER_TYPES.WORK_TIMER:
      timerSeconds = workDuration * 60;
      break;
    case TIMER_TYPES.BREAK_TIMER:
      timerSeconds = breakDuration * 60;
  }

  currentTimerType = timerType;
  currentTimerRemaining = timerSeconds;
  renderTimerReadout();

  return new Promise((resolve) => {
    settleCurrentTimer = resolve;
    timerWorker = new Worker('timerWorker.js');
    timerWorker.postMessage({ action: TIMER_ACTIONS.START_TIMER, timerSeconds });
    timerWorker.onmessage = (event) => {
      switch (event.data.action) {
        case TIMER_ACTIONS.STEP_TIMER:
          rotateAnalogTimerNeedle();
          rotateAnalogTimerCompletion(timerType);
          currentTimerRemaining = Math.max(currentTimerRemaining - 1, 0);
          renderTimerReadout();
          break;
        case TIMER_ACTIONS.END_TIMER:
          resetAnalogTimerNeedle();
          settleCurrentTimer = null;
          stopTimer();
          resolve(true);
      }
    };
  })
}

function stopTimer() {
  if (timerWorker) {
    timerWorker.terminate();
    timerWorker = null;
  }
  if (settleCurrentTimer) {
    settleCurrentTimer(false);
    settleCurrentTimer = null;
  }
}


function rotateAnalogTimerNeedle(degRotation = null) {
  if (degRotation != null) {
    analogTimerNeedleDegRotation = 0;
  } else {
    analogTimerNeedleDegRotation = (analogTimerNeedleDegRotation + 6) % 360;
  }
  analogTimerNeedle.style.transform = `rotate(${analogTimerNeedleDegRotation}deg)`;
}

function resetAnalogTimerNeedle() {
  rotateAnalogTimerNeedle(0)
}


function setupAnalogTimerPhases() {
  const numberOfPhases = (workTimes * 2) - 1;
  const totalMinutes = (workDuration * workTimes) + (breakDuration * (workTimes - 1));
  const workPhasesSize = (workDuration * 360) / totalMinutes;
  const breakPhasesSize = (breakDuration * 360) / totalMinutes
  analogTimerWorkPhasesStepSize = workPhasesSize / (workDuration * 60);
  analogTimerBreakPhasesStepSize = breakPhasesSize / (breakDuration * 60);

  let rotation = workPhasesSize;
  for (let i = 0; i < numberOfPhases; i += 1) {
    analogTimerPhasesSeparators[i] = document.createElement('div');
    analogTimerPhasesSeparators[i].className = 'analog-timer-phase-separator';
    analogTimerPhasesSeparators[i].style.transform = `rotate(${rotation}deg)`;
    analogTimerCircle.appendChild(analogTimerPhasesSeparators[i]);
    if (i % 2 === 0) {
      rotation += breakPhasesSize;
    } else {
      rotation += workPhasesSize;
    }
  }
}

function cleanupAnalogTimerPhases() {
  analogTimerPhasesSeparators.forEach((element) => { element.remove(); });
  analogTimerPhasesSeparators = [];
}


function rotateAnalogTimerCompletion(timerType) {
  switch(timerType) {
    case TIMER_TYPES.WORK_TIMER:
      analogTimerCompletionDegPosition += analogTimerWorkPhasesStepSize;
      break;
    case TIMER_TYPES.BREAK_TIMER:
      analogTimerCompletionDegPosition += analogTimerBreakPhasesStepSize;
  }
  analogTimerCompletion.style.background = `conic-gradient(var(--soft-grey), ${analogTimerCompletionDegPosition}deg, transparent ${analogTimerCompletionDegPosition}deg 360deg)`;
}

function resetAnalogTimerCompletion() {
  analogTimerCompletionDegPosition = 0;
  analogTimerWorkPhasesStepSize = null;
  analogTimerBreakPhasesStepSize = null;
  analogTimerCompletion.style.background = `conic-gradient(var(--soft-grey), 0deg, transparent 0deg 360deg)`;
}


function formatClock(seconds) {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function renderTimerReadout() {
  if (!currentTimerType) {
    analogTimerWrapper.dataset.phase = 'idle';
    timerTimeLabel.textContent = formatClock(workDuration * 60);
    timerPhaseLabel.textContent = 'Ready';
    document.title = 'Tomato timer';
    return;
  }

  const isWork = currentTimerType === TIMER_TYPES.WORK_TIMER;
  const clock = formatClock(currentTimerRemaining);
  let phase = isWork ? `Focus ${workTimes - tomatoSessionTimes} of ${workTimes}` : 'Break';
  if (sessionState === SESSION_STATES.PAUSED) phase += ' · paused';
  analogTimerWrapper.dataset.phase = isWork ? 'work' : 'break';
  timerTimeLabel.textContent = clock;
  timerPhaseLabel.textContent = phase;
  document.title = `${clock} · ${isWork ? 'Focus' : 'Break'}`;
}

function renderSessionSummary() {
  const times = workTimes > 1 ? `${workTimes} × ${workDuration} min` : `${workDuration} min`;
  const breaks = workTimes > 1 ? ` · ${breakDuration} min breaks` : '';
  sessionSummaryLabel.textContent = times + breaks;
}


function confirmSettingsForm() {
  settingsDialogContent.style.display = 'none';
  settingsDialogClosedContent.style.display = 'flex';
}

function showSettingsForm() {
  settingsDialogContent.style.display = 'block';
  settingsDialogClosedContent.style.display = 'none';
}

function loadLocalSettings() {
  workDuration = readPositiveSetting('workDuration', workDuration);
  workTimes = readPositiveSetting('workTimes', workTimes);
  breakDuration = readPositiveSetting('breakDuration', breakDuration);
}

// The inputs hand back strings, and an empty or zero one would leave the clock with no phases.
function toPositiveInteger(value) {
  const number = Math.round(Number(value));
  return number > 0 ? number : null;
}

function readPositiveSetting(key, fallback) {
  return toPositiveInteger(localStorage.getItem(key)) || fallback;
}

function bindSettingsToForm() {
  const workDurationInput = document.getElementById('work-duration-input');
  workDurationInput.value = workDuration;
  workDurationInput.onchange = (event) => { setWorkDuration(event.target.value); event.target.value = workDuration; };

  const workTimesInput = document.getElementById('work-times-input');
  workTimesInput.value = workTimes;
  workTimesInput.onchange = (event) => { setWorkTimes(event.target.value); event.target.value = workTimes; };

  const breakDurationInput = document.getElementById('break-duration-input');
  breakDurationInput.value = breakDuration;
  breakDurationInput.onchange = (event) => { setBreakDuration(event.target.value); event.target.value = breakDuration; };
}

function getAnalogTimerRefs() {
  analogTimerWrapper = document.querySelector('.analog-timer-wrapper');
  analogTimerCircle = document.getElementById('analog-timer-circle');
  analogTimerNeedle = document.getElementById('analog-timer-needle');
  analogTimerCompletion = document.getElementById('analog-timer-completion');
  timerTimeLabel = document.getElementById('timer-time');
  timerPhaseLabel = document.getElementById('timer-phase');
  sessionSummaryLabel = document.getElementById('session-summary');
}

function getSettingsDialogSectionsRef() {
  settingsDialogContent = document.getElementById('settings-dialog-content');
  settingsDialogClosedContent = document.getElementById('settings-dialog-closed-content');
}

function getSessionControlsRefs() {
  sessionToggleButton = document.getElementById('session-toggle-button');
}

function loadNotificationSound() {
  notificationSound = new Audio('./ding.mp3');
  notificationSound.volume = 0.50;
}

function requestNotificationsPermission() {
  if (Notification.permission === 'granted') return;
  if (Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

// --------------------------------------------------------------------------
// The magic forest: every focus that runs to the end plants a tree, every
// break that runs to the end leaves something magic in the grass. Aborted
// phases do not count. The rule lives in `forestGrowth`; the history behind
// it stays in this browser.
// --------------------------------------------------------------------------

const FOREST_STORAGE_KEY = 'forest';
const FOREST_SIDE_MAX = 5;
const FOREST_FIREFLIES_MAX = 40;
const FOREST_STARS_MAX = 36;
const FOREST_JOURNAL_SIZE = 5;
const COS30 = Math.cos(Math.PI / 6);

let forestHistory = { focuses: [], breaks: [] };
let focusDescriptionInput = null;
let forestScene = null;
let forestSummaryLabel = null;
let forestJournal = null;

function loadForestHistory() {
  try {
    const stored = JSON.parse(localStorage.getItem(FOREST_STORAGE_KEY));
    if (stored && Array.isArray(stored.focuses) && Array.isArray(stored.breaks)) {
      forestHistory = stored;
    }
  } catch (error) {
    // A broken history starts a new forest rather than breaking the timer.
  }
}

function saveForestHistory() {
  try {
    localStorage.setItem(FOREST_STORAGE_KEY, JSON.stringify(forestHistory));
  } catch (error) {
    // Out of storage: the forest still grows for this visit.
  }
}

function recordCompletedPhase(timerType) {
  const at = new Date().toISOString();
  if (timerType === TIMER_TYPES.WORK_TIMER) {
    forestHistory.focuses.push({ at, minutes: workDuration, description: focusDescriptionInput.value.trim() });
  } else {
    forestHistory.breaks.push({ at, minutes: breakDuration });
  }
  saveForestHistory();
  renderForest(timerType);
}

function bindFocusDescription() {
  focusDescriptionInput = document.getElementById('focus-description');
  focusDescriptionInput.value = localStorage.getItem('focusDescription') || '';
  focusDescriptionInput.oninput = () => {
    localStorage.setItem('focusDescription', focusDescriptionInput.value);
  };
  forestScene = document.getElementById('forest-scene');
  forestSummaryLabel = document.getElementById('forest-summary');
  forestJournal = document.getElementById('forest-journal');
}

/*
 * The growth rule, in one place. From the focuses and the breaks completed:
 * - the island is the smallest square of tiles that holds every tree, up to
 *   5x5, and it gets wider as it fills;
 * - every focus plants a tree on the free tile nearest the middle; trees grow
 *   up as newer ones are planted after them;
 * - past 25 trees the forest does not freeze: each further focus enchants a
 *   tree, oldest first, and it starts to glow;
 * - every break leaves a mushroom, a flower or a crystal by a tree, two per
 *   tile; past that, breaks turn into fireflies;
 * - the sky gets a star for every phase completed.
 */
function forestGrowth(focuses, breaks) {
  const side = Math.min(FOREST_SIDE_MAX, Math.max(1, Math.ceil(Math.sqrt(focuses))));
  const tiles = side * side;
  const trees = Math.min(focuses, tiles);
  const enchanted = Math.min(trees, Math.max(0, focuses - tiles));
  const decorations = Math.min(breaks, tiles * 2);
  const fireflies = Math.min(FOREST_FIREFLIES_MAX, breaks - decorations + enchanted * 2);
  const stars = Math.min(FOREST_STARS_MAX, focuses + breaks);
  return { side, tiles, trees, enchanted, decorations, fireflies, stars };
}

// How tall the n-th tree is: the newest is a sapling, the older ones have had
// the time of the focuses planted after them to grow.
function treeLevel(index, trees) {
  const age = trees - 1 - index;
  if (age < 1) return 0;
  if (age < 3) return 1;
  if (age < 8) return 2;
  return 3;
}

// Tiles from the middle of the island outwards, so the forest grows from its heart.
function forestPlantingOrder(side) {
  const middle = (side - 1) / 2;
  const cells = [];
  for (let row = 0; row < side; row += 1) {
    for (let col = 0; col < side; col += 1) {
      cells.push({ col, row, distance: Math.hypot(col - middle, row - middle), angle: Math.atan2(row - middle, col - middle) });
    }
  }
  return cells.sort((a, b) => (a.distance - b.distance) || (a.angle - b.angle));
}

// A small deterministic random, so the same history always draws the same forest.
function forestRandom(seed) {
  let value = seed * 9301 + 49297;
  return () => {
    value = (value * 9301 + 49297) % 233280;
    return value / 233280;
  };
}

function escapeXml(text) {
  return String(text).replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

function shade(hex, factor) {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const mixed = channels.map((c) => Math.round(factor >= 1 ? c + (255 - c) * (factor - 1) : c * factor));
  return `#${mixed.map((c) => Math.min(255, c).toString(16).padStart(2, '0')).join('')}`;
}

function isoPoint(x, y, z, origin) {
  return [origin.x + (x - y) * COS30, origin.y + (x + y) * 0.5 - z];
}

function polygon(points, fill, extra = '') {
  return `<polygon points="${points.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')}" fill="${fill}"${extra}/>`;
}

const TREE_KINDS = ['round', 'pine', 'blossom', 'pine', 'round', 'willow'];
const DECORATION_KINDS = ['mushroom', 'flowers', 'crystal', 'flowers', 'glowshroom'];
const LEAF_COLORS = { round: '#3FA34D', pine: '#24785A', blossom: '#4DB36A', willow: '#2F9A8A' };

function drawTree(kind, level, enchanted) {
  const size = [0.45, 0.7, 0.88, 1.05][level];
  const leaf = LEAF_COLORS[kind];
  const trunk = '#8A5A3C';
  let body = '';
  if (enchanted) {
    body += `<circle cx="0" cy="-30" r="30" fill="url(#forest-glow)"/>`;
  }
  body += `<rect x="-2.6" y="-14" width="5.2" height="14" rx="2" fill="${trunk}"/>`;
  switch (kind) {
    case 'pine':
      body += polygon([[-15, -10], [15, -10], [0, -34]], shade(leaf, 0.85));
      body += polygon([[-12, -22], [12, -22], [0, -44]], leaf);
      body += polygon([[-8, -33], [8, -33], [0, -52]], shade(leaf, 1.2));
      break;
    case 'willow':
      body += `<ellipse cx="0" cy="-30" rx="17" ry="15" fill="${leaf}"/>`;
      body += `<path d="M-14 -26 q-3 10 -1 18 M-6 -22 q-2 9 0 16 M6 -22 q2 9 0 16 M14 -26 q3 10 1 18" stroke="${shade(leaf, 1.25)}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
      body += `<ellipse cx="-4" cy="-36" rx="8" ry="6" fill="${shade(leaf, 1.22)}"/>`;
      break;
    default:
      body += `<circle cx="-7" cy="-22" r="10" fill="${shade(leaf, 0.85)}"/>`;
      body += `<circle cx="7" cy="-23" r="10" fill="${shade(leaf, 0.92)}"/>`;
      body += `<circle cx="0" cy="-33" r="12" fill="${leaf}"/>`;
      body += `<circle cx="-4" cy="-37" r="5" fill="${shade(leaf, 1.25)}"/>`;
      if (kind === 'blossom') {
        body += [[-9, -25], [6, -31], [-2, -40], [9, -21], [-5, -32]]
          .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.3" fill="#FF8FB8"/>`).join('');
      }
  }
  if (enchanted) {
    body += [[-10, -30], [9, -38], [2, -22], [-4, -46], [12, -26]]
      .map(([x, y], i) => `<circle class="forest-twinkle" style="animation-delay:${i * 0.4}s" cx="${x}" cy="${y}" r="1.7" fill="#FFF3A6"/>`).join('');
  }
  return { body, size };
}

function drawDecoration(kind) {
  switch (kind) {
    case 'mushroom':
      return `<rect x="-1.6" y="-5" width="3.2" height="5" rx="1" fill="#FFF4E0"/>`
        + `<path d="M-5.5 -4.5 Q0 -12 5.5 -4.5 Z" fill="#E9483F"/>`
        + `<circle cx="-2" cy="-7" r="1" fill="white"/><circle cx="2" cy="-6" r="0.9" fill="white"/>`;
    case 'glowshroom':
      return `<circle cx="0" cy="-6" r="8" fill="url(#forest-glow)"/>`
        + `<rect x="-1.4" y="-5" width="2.8" height="5" rx="1" fill="#E8FBFF"/>`
        + `<path d="M-5 -4.5 Q0 -11 5 -4.5 Z" fill="#4FD8E8"/>`;
    case 'crystal':
      return polygon([[-3, 0], [-4, -6], [-1, -12], [2, -6], [1, 0]], '#B58CF0')
        + polygon([[1, 0], [2, -6], [5, -9], [6, -3], [4, 0]], '#D3B8FA');
    default:
      return [[-4, '#FFD23F'], [0, '#FF6FA5'], [4, '#FFFFFF']]
        .map(([x, color], i) => `<path d="M${x} 0 V${-6 - i}" stroke="#3FA34D" stroke-width="1.2"/><circle cx="${x}" cy="${-7 - i}" r="2.2" fill="${color}"/>`)
        .join('');
  }
}

function forestScene3d(growth, newest) {
  const footprint = 100 + growth.side * 14;
  const tile = footprint / growth.side;
  const half = footprint / 2;
  const depth = 16;
  const rock = half * 0.45;
  // Centred on the island and its rock, leaving room above for the tallest trees.
  const origin = { x: 180, y: 160 - (0.45 * half - 44) / 2 };
  const scale = Math.min(1.25, Math.max(0.7, tile / 34));
  const parts = [];

  // The night sky, with a star for every phase completed.
  const random = forestRandom(7);
  for (let i = 0; i < growth.stars; i += 1) {
    const x = 12 + random() * 336;
    const y = 10 + random() * 70;
    const r = 0.8 + random() * 1.2;
    parts.push(`<circle class="forest-twinkle" style="animation-delay:${(random() * 3).toFixed(2)}s" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="#FFF7D6"/>`);
  }
  parts.push('<path d="M306 22 A18 18 0 1 0 324 46 A15 15 0 1 1 306 22 Z" fill="#FFF3C4"/>');

  // The island: a block of earth with a checkered lawn on top.
  const corner = (x, y, z) => isoPoint(x, y, z, origin);
  // A floating island: the rock it was torn from hangs underneath, with a few roots.
  const rockRandom = forestRandom(growth.side);
  const steps = 8;
  const hang = (t) => rock * (0.15 + 0.85 * t) * (0.55 + 0.45 * rockRandom());
  const leftEdge = [];
  const rightEdge = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const drop = i === 0 ? 0 : (i === steps ? rock : hang(t));
    leftEdge.push(corner(-half + t * footprint, half, -depth - drop));
    rightEdge.push(corner(half, -half + t * footprint, -depth - (i === 0 ? 0 : (i === steps ? rock : hang(t)))));
  }
  parts.push(polygon([corner(-half, half, -depth), corner(half, half, -depth), ...leftEdge.reverse()], '#5E4A5C'));
  parts.push(polygon([corner(half, -half, -depth), corner(half, half, -depth), ...rightEdge.reverse()], '#7A6274'));
  [[-0.5, 0.5], [0.1, 0.5], [0.5, 0.2], [0.5, -0.35]].forEach(([u, v], i) => {
    const [x, y] = corner(u * half, v * half, -depth);
    parts.push(`<path d="M${x.toFixed(1)} ${y.toFixed(1)} q${i % 2 ? 3 : -3} 8 0 ${14 + i * 3}" stroke="#8A5A3C" stroke-width="1.6" fill="none" stroke-linecap="round"/>`);
  });
  parts.push(polygon([corner(-half, half, 0), corner(half, half, 0), corner(half, half, -depth), corner(-half, half, -depth)], '#7A4B37'));
  parts.push(polygon([corner(half, -half, 0), corner(half, half, 0), corner(half, half, -depth), corner(half, -half, -depth)], '#94604A'));
  parts.push(polygon([corner(-half, half, 0), corner(half, half, 0), corner(half, half, -4), corner(-half, half, -4)], '#4E9F45'));
  parts.push(polygon([corner(half, -half, 0), corner(half, half, 0), corner(half, half, -4), corner(half, -half, -4)], '#5DB352'));
  for (let row = 0; row < growth.side; row += 1) {
    for (let col = 0; col < growth.side; col += 1) {
      const x = -half + col * tile;
      const y = -half + row * tile;
      const fill = (row + col) % 2 ? '#7BD06A' : '#86D874';
      parts.push(polygon([corner(x, y, 0), corner(x + tile, y, 0), corner(x + tile, y + tile, 0), corner(x, y + tile, 0)], fill));
    }
  }

  // What stands on the island, back to front so the near things cover the far ones.
  const order = forestPlantingOrder(growth.side);
  const things = [];
  const focuses = forestHistory.focuses;
  order.slice(0, growth.trees).forEach((cell, index) => {
    const focus = focuses[index] || {};
    const x = -half + (cell.col + 0.5) * tile;
    const y = -half + (cell.row + 0.5) * tile;
    const enchanted = index < growth.enchanted;
    const { body, size } = drawTree(TREE_KINDS[index % TREE_KINDS.length], treeLevel(index, growth.trees), enchanted);
    const when = focus.at ? new Date(focus.at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
    const title = `${focus.description || 'Focus'} · ${focus.minutes || '?'} min${when ? ` · ${when}` : ''}${enchanted ? ' · enchanted' : ''}`;
    const isNewest = newest === TIMER_TYPES.WORK_TIMER && index === growth.trees - 1;
    things.push({ depth: x + y, svg: placed(corner(x, y, 0), size * scale, body, `forest-tree${isNewest ? ' forest-sprouting' : ''}`, title) });
  });

  const slots = [[0.22, 0.78], [0.8, 0.26]];
  for (let index = 0; index < growth.decorations; index += 1) {
    const cell = order[Math.floor(index / 2) % order.length];
    const [dx, dy] = slots[index % 2];
    const x = -half + (cell.col + dx) * tile;
    const y = -half + (cell.row + dy) * tile;
    const isNewest = newest === TIMER_TYPES.BREAK_TIMER && index === growth.decorations - 1;
    things.push({ depth: x + y, svg: placed(corner(x, y, 0), scale, drawDecoration(DECORATION_KINDS[index % DECORATION_KINDS.length]), `forest-decoration${isNewest ? ' forest-sprouting' : ''}`) });
  }
  things.sort((a, b) => a.depth - b.depth).forEach((thing) => parts.push(thing.svg));

  // Fireflies drift over the island once there is no more room in the grass.
  const fireflyRandom = forestRandom(growth.fireflies + 3);
  for (let i = 0; i < growth.fireflies; i += 1) {
    const [x, y] = corner(-half + fireflyRandom() * footprint, -half + fireflyRandom() * footprint, 14 + fireflyRandom() * 40);
    parts.push(`<circle class="forest-firefly" style="animation-delay:${(fireflyRandom() * 4).toFixed(2)}s" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.8" fill="#FFF07A"/>`);
  }
  return parts.join('');
}

function placed(point, size, body, className, title) {
  const tooltip = title ? `<title>${escapeXml(title)}</title>` : '';
  return `<g transform="translate(${point[0].toFixed(1)} ${point[1].toFixed(1)}) scale(${size.toFixed(3)})"><g class="${className}">${tooltip}${body}</g></g>`;
}

function renderForest(newest = null) {
  const focuses = forestHistory.focuses.length;
  const breaks = forestHistory.breaks.length;
  const growth = forestGrowth(focuses, breaks);
  forestScene.innerHTML = `<defs>
      <radialGradient id="forest-glow"><stop offset="0" stop-color="#FFF3A6" stop-opacity="0.75"/><stop offset="1" stop-color="#FFF3A6" stop-opacity="0"/></radialGradient>
    </defs>${forestScene3d(growth, newest)}`;

  const trees = `${focuses} ${focuses === 1 ? 'tree' : 'trees'}`;
  forestSummaryLabel.textContent = focuses || breaks
    ? `${trees} · ${breaks} ${breaks === 1 ? 'break' : 'breaks'}${growth.enchanted ? ` · ${growth.enchanted} enchanted` : ''}`
    : 'Finish a focus to plant your first tree';
  renderForestJournal();
}

function renderForestJournal() {
  forestJournal.replaceChildren();
  forestHistory.focuses.slice(-FOREST_JOURNAL_SIZE).reverse().forEach((focus) => {
    const item = document.createElement('li');
    const description = document.createElement('span');
    description.className = 'journal-description';
    description.textContent = focus.description || 'Focus';
    const meta = document.createElement('span');
    meta.className = 'journal-meta';
    meta.textContent = `${focus.minutes} min · ${new Date(focus.at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`;
    item.append(description, meta);
    forestJournal.appendChild(item);
  });
}


function appInit() {
  loadLocalSettings();
  bindSettingsToForm();
  getAnalogTimerRefs();
  getSettingsDialogSectionsRef();
  getSessionControlsRefs();
  loadNotificationSound();
  renderSessionSummary();
  renderTimerReadout();
  bindFocusDescription();
  loadForestHistory();
  renderForest();
}

document.addEventListener('DOMContentLoaded', appInit, false);