
let workDuration = 25;
let workTimes = 3;
let breakDuration = 5;

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
  setupAnalogTimerCompletion();
  while (tomatoSessionTimes !== 0) {
    tomatoSessionTimes -= 1;
    await startTimer(workDuration);
    notificationSound.play();
    advanceAnalogTimerCompletion();
    if (tomatoSessionTimes !== 0) {
      await startTimer(breakDuration);
      notificationSound.play();
    }
  }
}

function abortTomatoSession() {
  clearInterval(currentTimerIntervalId);
  currentTimerIntervalId = null;
  resetAnalogTimerNeedle();
  resetTomatoTimerCompletion();
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

function setupAnalogTimerCompletion() {
  analogTimerCompletionStepSize = 360 / workTimes;
  console.log({ analogTimerCompletionStepSize })
}

function advanceAnalogTimerCompletion() {
  analogTimerCompletionDegPosition += analogTimerCompletionStepSize;
  analogTimerCompletion.style.background = `conic-gradient(var(--soft-grey), ${analogTimerCompletionDegPosition}deg, transparent ${analogTimerCompletionDegPosition}deg 360deg)`;
}

function resetTomatoTimerCompletion() {
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

function bindSettingsToForm() {
  const workDurationInput = document.getElementById('work-duration-input');
  workDurationInput.value = workDuration;
  workDurationInput.onchange = (event) => { workDuration = event.target.value; };

  const breakDurationInput = document.getElementById('break-duration-input');
  breakDurationInput.value = breakDuration;
  breakDurationInput.onchange = (event) => { breakDuration = event.target.value; };

  const workTimesInput = document.getElementById('work-times-input');
  workTimesInput.value = workTimes;
  workTimesInput.onchange = (event) => { workTimes = event.target.value; };
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
  bindSettingsToForm();
  getAnalogTimerRefs();
  getSettingsDialogSectionsRef();
  loadNotificationSound();
}

document.addEventListener('DOMContentLoaded', appInit, false);