const motion = matchMedia("(prefers-reduced-motion: reduce)");
const next = document.querySelector("#hero-video-next");
const phrase = document.querySelector("#hero-phrase");
const messages = ["เป็นช่วงเวลาที่พิเศษ", "สบายในแบบของคุณ", "เติมเต็มความสุขในทุกวัน"];
let index = 0;
let videoTimer;
let textTimer;
let transitionTimer;
let usingNext = false;
let generation = 0;
function stop() {
  generation++;
  clearInterval(videoTimer);
  clearInterval(textTimer);
  clearTimeout(transitionTimer);
  next.pause();
  next.classList.remove("is-active");
  phrase.classList.remove("is-changing");
  usingNext = false;
}
function start() {
  stop();
  if (motion.matches || document.hidden) return;
  const session = generation;
  videoTimer = setInterval(async () => {
    if (document.hidden || motion.matches || navigator.connection?.saveData) return;
    if (!usingNext) {
      try {
        await next.play();
      } catch {
        return;
      }
      if (session !== generation || motion.matches || document.hidden) {
        next.pause();
        return;
      }
      next.classList.add("is-active");
      usingNext = true;
    } else {
      next.classList.remove("is-active");
      usingNext = false;
      setTimeout(() => {
        if (!usingNext) next.pause();
      }, 1800);
    }
  }, 13000);
  textTimer = setInterval(() => {
    phrase.classList.add("is-changing");
    transitionTimer = setTimeout(() => {
      if (motion.matches || document.hidden) return;
      index = (index + 1) % messages.length;
      phrase.textContent = messages[index];
      phrase.classList.remove("is-changing");
    }, 400);
  }, 6500);
}
motion.addEventListener("change", start);
document.addEventListener("visibilitychange", start);
start();
