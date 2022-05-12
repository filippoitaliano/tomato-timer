
const TIMER_ACTIONS = {
  START_TIMER: 'start-timer',
  STEP_TIMER: 'step-timer',
  END_TIMER: 'end-timer',
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


async function startTomatoSession() {
  requestNotificationsPermission();
  tomatoSessionTimes = workTimes;
  setupAnalogTimerPhases();
  while (tomatoSessionTimes !== 0) {
    tomatoSessionTimes -= 1;
    await startTimer(TIMER_TYPES.WORK_TIMER);
    notificationSound.play();
    new Notification('Time to have a break!');
    if (tomatoSessionTimes !== 0) {
      await startTimer(TIMER_TYPES.BREAK_TIMER);
      notificationSound.play();
      if (tomatoSessionTimes === 0) {
        new Notification ('Good job, you finished your pomodoro!')
      } else {
        new Notification ('Let\'s get back to work.')
      }
    }
  }
}

function stopTomatoSession() {
  stopTimer();
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
          stopTimer();
          resolve();
      }
    };
  })
}

function stopTimer() {
  if (timerWorker) {
    timerWorker.terminate();
    timerWorker = null;
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
  analogTimerCircle = document.getElementById('analog-timer-circle');
  analogTimerNeedle = document.getElementById('analog-timer-needle');
  analogTimerCompletion = document.getElementById('analog-timer-completion');
}

function getSettingsDialogSectionsRef() {
  settingsDialogContent = document.getElementById('settings-dialog-content');
  settingsDialogClosedContent = document.getElementById('settings-dialog-closed-content');
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
  loadNotificationSound();
}

document.addEventListener('DOMContentLoaded', appInit, false);