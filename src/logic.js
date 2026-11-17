
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
    notificationSound.play();
    new Notification('Time to have a break!');
    if (tomatoSessionTimes !== 0) {
      if (!await startTimer(TIMER_TYPES.BREAK_TIMER)) return;
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

function appInit() {
  loadLocalSettings();
  bindSettingsToForm();
  getAnalogTimerRefs();
  getSettingsDialogSectionsRef();
  getSessionControlsRefs();
  loadNotificationSound();
  renderSessionSummary();
  renderTimerReadout();
}

document.addEventListener('DOMContentLoaded', appInit, false);