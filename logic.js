
let timerDuration = 25;
let breakDuration = 5;
let timerTimes = 3;

let timerIntervalId = null;

let analogTimerNeedle = null;
let analogTimerDegRotation = 0;

function startTimer() {
  let timerSeconds = timerDuration * 60;
  timerIntervalId = setInterval(() => {
    if (timerSeconds === 0) {
      clearInterval(timerIntervalId);
      timerIntervalId = null;
      resetAnalogTimerNeedle()
    } else {
      timerSeconds -= 1;
      rotateAnalogTimerNeedle();
    }
  }, 1000);
}

function abortTimer() {
  clearInterval(timerIntervalId);
  timerIntervalId = null;
  resetAnalogTimerNeedle();
}

function rotateAnalogTimerNeedle(degRotation = null) {
  if (degRotation != null) {
    analogTimerDegRotation = 0;
  } else {
    analogTimerDegRotation = (analogTimerDegRotation + 6) % 360;
  }
  analogTimerNeedle.style.transform = `rotate(${analogTimerDegRotation}deg)`;
}

function resetAnalogTimerNeedle() {
  rotateAnalogTimerNeedle(0)
}

function bindSettingsToForm() {
  const timerDurationInput = document.getElementById('timer-duration-input');
  timerDurationInput.value = timerDuration;
  timerDurationInput.onchange = (event) => { timerDuration = event.target.value; };

  const breakDurationInput = document.getElementById('break-duration-input');
  breakDurationInput.value = breakDuration;
  breakDurationInput.onchange = (event) => { breakDuration = event.target.value; };

  const timerTimesInput = document.getElementById('timer-times-input');
  timerTimesInput.value = timerTimes;
  timerTimesInput.onchange = (event) => { timerTimes = event.target.value; };
}

function getAnalogTimerNeedleRef() {
  analogTimerNeedle = document.getElementById('analog-timer-needle');
}

function appInit() {
  bindSettingsToForm();
  getAnalogTimerNeedleRef();
}

document.addEventListener('DOMContentLoaded', appInit, false);