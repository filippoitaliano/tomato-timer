
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
  workDuration = value;
  localStorage.setItem('workDuration', value);
}

let workTimes = 3;
function setWorkTimes(value) {
  workTimes = value;
  localStorage.setItem('workTimes', value);
}

let breakDuration = 5;
function setBreakDuration(value) {
  breakDuration = value;
  localStorage.setItem('breakDuration', value);
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

  return new Promise((resolve) => {
    settleCurrentTimer = resolve;
    timerWorker = new Worker('timerWorker.js');
    timerWorker.postMessage({ action: TIMER_ACTIONS.START_TIMER, timerSeconds });
    timerWorker.onmessage = (event) => {
      switch (event.data.action) {
        case TIMER_ACTIONS.STEP_TIMER:
          rotateAnalogTimerNeedle();
          rotateAnalogTimerCompletion(timerType);
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


function confirmSettingsForm() {
  settingsDialogContent.style.display = 'none';
  settingsDialogClosedContent.style.display = 'flex';
}

function showSettingsForm() {
  settingsDialogContent.style.display = 'block';
  settingsDialogClosedContent.style.display = 'none';
}

function loadLocalSettings() {
  const localWorkDuration = localStorage.getItem('workDuration');
  if (localWorkDuration) {
    workDuration = localWorkDuration;
  }
  const localWorkTimes = localStorage.getItem('workTimes');
  if (localWorkTimes) {
    workTimes = localWorkTimes;
  }
  const localBreakDuration = localStorage.getItem('breakDuration');
  if (localBreakDuration) {
    breakDuration = localBreakDuration;
  }
}

function bindSettingsToForm() {
  const workDurationInput = document.getElementById('work-duration-input');
  workDurationInput.value = workDuration;
  workDurationInput.onchange = (event) => { setWorkDuration(event.target.value); };

  const workTimesInput = document.getElementById('work-times-input');
  workTimesInput.value = workTimes;
  workTimesInput.onchange = (event) => { setWorkTimes(event.target.value); };

  const breakDurationInput = document.getElementById('break-duration-input');
  breakDurationInput.value = breakDuration;
  breakDurationInput.onchange = (event) => { setBreakDuration(event.target.value); };
}

function getAnalogTimerRefs() {
  analogTimerWrapper = document.querySelector('.analog-timer-wrapper');
  analogTimerCircle = document.getElementById('analog-timer-circle');
  analogTimerNeedle = document.getElementById('analog-timer-needle');
  analogTimerCompletion = document.getElementById('analog-timer-completion');
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
}

document.addEventListener('DOMContentLoaded', appInit, false);