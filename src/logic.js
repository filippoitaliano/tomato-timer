
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
  onSettingsChanged();
}

let workTimes = 3;
function setWorkTimes(value) {
  const number = toPositiveInteger(value);
  if (!number) return;
  workTimes = number;
  localStorage.setItem('workTimes', number);
  onSettingsChanged();
}

let breakDuration = 5;
function setBreakDuration(value) {
  const number = toPositiveInteger(value);
  if (!number) return;
  breakDuration = number;
  localStorage.setItem('breakDuration', number);
  onSettingsChanged();
}


let tomatoSessionTimes = null;
let sessionState = SESSION_STATES.IDLE;
let sessionToggleButton = null;
let analogTimerWrapper = null;

let timerSegmentsGroup = null;
let timerTimeLabel = null;
let timerPhaseLabel = null;
let sessionSummaryLabel = null;
// One entry per focus or break of the session, in order: what the ring draws.
let timerSegments = [];
let currentSegmentIndex = -1;
let currentSegmentElapsed = 0;

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
  renderTimerReadout();
}

async function startTomatoSession() {
  requestNotificationsPermission();
  setSessionState(SESSION_STATES.RUNNING);
  tomatoSessionTimes = workTimes;
  setupTimerSegments();
  let segmentIndex = 0;
  while (tomatoSessionTimes !== 0) {
    tomatoSessionTimes -= 1;
    if (!await startTimer(segmentIndex++)) return;
    notificationSound.play();
    new Notification('Time to have a break!');
    if (tomatoSessionTimes !== 0) {
      if (!await startTimer(segmentIndex++)) return;
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
  setupTimerSegments();
  setSessionState(SESSION_STATES.IDLE);
}


async function startTimer(segmentIndex) {
  const timerSeconds = timerSegments[segmentIndex].seconds;
  currentSegmentIndex = segmentIndex;
  currentSegmentElapsed = 0;
  renderTimer();

  return new Promise((resolve) => {
    settleCurrentTimer = resolve;
    timerWorker = new Worker('timerWorker.js');
    timerWorker.postMessage({ action: TIMER_ACTIONS.START_TIMER, timerSeconds });
    timerWorker.onmessage = (event) => {
      switch (event.data.action) {
        case TIMER_ACTIONS.STEP_TIMER:
          currentSegmentElapsed += 1;
          renderTimer();
          break;
        case TIMER_ACTIONS.END_TIMER:
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


function setupTimerSegments() {
  timerSegments = [];
  for (let i = 0; i < workTimes; i += 1) {
    if (i > 0) timerSegments.push({ type: TIMER_TYPES.BREAK_TIMER, seconds: breakDuration * 60 });
    timerSegments.push({ type: TIMER_TYPES.WORK_TIMER, seconds: workDuration * 60 });
  }
  currentSegmentIndex = -1;
  currentSegmentElapsed = 0;
  drawTimerSegments();
  renderTimer();
  renderSessionSummary();
}

const RING_CENTER = 150;
const RING_RADIUS = 128;
// Room between two segments, in degrees, so that each focus and break reads on its own.
const RING_GAP = 3;
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

function ringPoint(degrees) {
  const radians = (degrees * Math.PI) / 180;
  return `${RING_CENTER + RING_RADIUS * Math.sin(radians)} ${RING_CENTER - RING_RADIUS * Math.cos(radians)}`;
}

// A clockwise arc from `from` to `to`, in degrees from noon. A whole turn is two halves: a single
// arc whose ends meet draws nothing.
function ringArc(from, to) {
  if (to - from >= 359.99) {
    return `M ${ringPoint(0)} A ${RING_RADIUS} ${RING_RADIUS} 0 1 1 ${ringPoint(180)} A ${RING_RADIUS} ${RING_RADIUS} 0 1 1 ${ringPoint(360)}`;
  }
  const largeArc = to - from > 180 ? 1 : 0;
  return `M ${ringPoint(from)} A ${RING_RADIUS} ${RING_RADIUS} 0 ${largeArc} 1 ${ringPoint(to)}`;
}

function createRingPath(arc, className) {
  const path = document.createElementNS(SVG_NAMESPACE, 'path');
  path.setAttribute('d', arc);
  path.setAttribute('pathLength', '1');
  path.setAttribute('class', className);
  return path;
}

function drawTimerSegments() {
  timerSegmentsGroup.replaceChildren();
  const totalSeconds = timerSegments.reduce((sum, segment) => sum + segment.seconds, 0);
  if (!totalSeconds) return;
  const gap = timerSegments.length > 1 ? RING_GAP : 0;
  const available = 360 - gap * timerSegments.length;

  let from = gap / 2;
  timerSegments.forEach((segment) => {
    const to = from + (segment.seconds / totalSeconds) * available;
    const arc = ringArc(from, to);
    const kind = segment.type === TIMER_TYPES.WORK_TIMER ? 'work' : 'break';
    timerSegmentsGroup.appendChild(createRingPath(arc, `timer-segment timer-segment-track ${kind}`));
    segment.fill = createRingPath(arc, `timer-segment timer-segment-fill ${kind}`);
    timerSegmentsGroup.appendChild(segment.fill);
    from = to + gap;
  });
}

function segmentProgress(index) {
  if (index < currentSegmentIndex) return 1;
  if (index > currentSegmentIndex) return 0;
  return Math.min(currentSegmentElapsed / timerSegments[index].seconds, 1);
}

function renderTimer() {
  timerSegments.forEach((segment, index) => {
    const progress = segmentProgress(index);
    segment.fill.style.strokeDasharray = `${progress} 1`;
    segment.fill.classList.toggle('empty', progress === 0);
  });
  renderTimerReadout();
}

function formatClock(seconds) {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function renderTimerReadout() {
  const segment = timerSegments[currentSegmentIndex];
  if (sessionState === SESSION_STATES.IDLE || !segment) {
    analogTimerWrapper.dataset.phase = 'idle';
    timerTimeLabel.textContent = formatClock(workDuration * 60);
    timerPhaseLabel.textContent = 'Ready';
    document.title = 'Tomato timer';
    return;
  }

  const isWork = segment.type === TIMER_TYPES.WORK_TIMER;
  const clock = formatClock(Math.max(segment.seconds - currentSegmentElapsed, 0));
  let phase = isWork ? `Focus ${currentSegmentIndex / 2 + 1} of ${workTimes}` : 'Break';
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

function onSettingsChanged() {
  if (sessionState === SESSION_STATES.IDLE) {
    setupTimerSegments();
  } else {
    renderSessionSummary();
  }
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

// The inputs hand back strings, and an empty or zero one would leave the ring with nothing to draw.
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
  timerSegmentsGroup = document.getElementById('timer-segments');
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

function appInit() {
  loadLocalSettings();
  bindSettingsToForm();
  getAnalogTimerRefs();
  getSettingsDialogSectionsRef();
  getSessionControlsRefs();
  loadNotificationSound();
  setupTimerSegments();
}

document.addEventListener('DOMContentLoaded', appInit, false);