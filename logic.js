
function startTimerNeedleMovement(timerMinutes = 1) {
  let timerSeconds = timerMinutes * 60;
  const needles = document.getElementsByClassName('analog-timer-needle');
  let timerDegRotation = 0;
  const intervalId = setInterval(() => {
    if (timerSeconds === 0) {
      clearInterval(intervalId);
      timerDegRotation = 0;
    } else {
      timerSeconds -= 1;
      timerDegRotation = (timerDegRotation + 6) % 360;
      needles[0].style.transform = `rotate(${timerDegRotation}deg)`;
    }
  }, 1000);
}
