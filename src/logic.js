
let workDuration = 25;
let workTimes = 3;
let breakDuration = 5;

function setWorkDuration(value) {
  workDuration = value;
  localStorage.setItem('workDuration', value);
}

function setWorkTimes(value) {
  workTimes = value;
  localStorage.setItem('workTimes', value);
}

function setBreakDuration(value) {
  breakDuration = value;
  localStorage.setItem('breakDuration', value);
}

let currentTimerIntervalId = null;

let tomatoSessionTimes = null;

let analogTimerNeedle = null;
let analogTimerNeedleDegRotation = 0;

let analogTimerCompletion = null;
let analogTimerCompletionStepSize = null;
let analogTimerCompletionDegPosition = 0;

let notificationSound = null;

let settingsDialogContent = null;
let settingsDialogClosedContent = null;

async function startTomatoSession() {
  tomatoSessionTimes = workTimes;
  while (tomatoSessionTimes !== 0) {
    tomatoSessionTimes -= 1;
    setupAnalogTimerCurrentPhaseCompletion(workDuration);
    await startTimer(workDuration);
    notificationSound.play();
    if (tomatoSessionTimes !== 0) {
      setupAnalogTimerCurrentPhaseCompletion(breakDuration);
      await startTimer(breakDuration);
      notificationSound.play();
    }
  }
}

function abortTomatoSession() {
  clearInterval(currentTimerIntervalId);
  currentTimerIntervalId = null;
  resetAnalogTimerNeedle();
  resetAnalogTimerCompletion();
}

async function startTimer(currentTimerDuration) {
  return new Promise((resolve) => {
    let timerSeconds = currentTimerDuration * 60;
    currentTimerIntervalId = setInterval(() => {
      if (timerSeconds === 0) {
        clearInterval(currentTimerIntervalId);
        currentTimerIntervalId = null;
        resetAnalogTimerNeedle()
        resolve();
      } else {
        timerSeconds -= 1;
        rotateAnalogTimerNeedle();
        rotateAnalogTimerCompletion();
      }
    }, 1000);
  })
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

function setupAnalogTimerCurrentPhaseCompletion(currentTimerDuration) {
  let timerSeconds = currentTimerDuration * 60;
  const analogTimerCompletionPhaseSize = 360 / ((workTimes * 2) - 1);
  analogTimerCompletionStepSize = analogTimerCompletionPhaseSize / timerSeconds;
}

function rotateAnalogTimerCompletion() {
  analogTimerCompletionDegPosition += analogTimerCompletionStepSize;
  analogTimerCompletion.style.background = `conic-gradient(var(--soft-grey), ${analogTimerCompletionDegPosition}deg, transparent ${analogTimerCompletionDegPosition}deg 360deg)`;
}

function resetAnalogTimerCompletion() {
  analogTimerCompletionDegPosition = 0;
  analogTimerCompletionStepSize = null;
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

function appInit() {
  loadLocalSettings();
  bindSettingsToForm();
  getAnalogTimerRefs();
  getSettingsDialogSectionsRef();
  loadNotificationSound();
}

document.addEventListener('DOMContentLoaded', appInit, false);