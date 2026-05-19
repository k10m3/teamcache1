// Math Quiz: 5 mental-arithmetic questions.
import { createTimer, showGameOver, startCountdown } from "./_common.js";

const TIME_LIMIT = 60;
const COUNTDOWN_SECONDS = 5;

export function start(root, onClear) {
  const TOTAL = 5;

  function makeQuestion() {
    const ops = ["+", "-", "x"];
    const op = ops[Math.floor(Math.random() * ops.length)];
    let a, b, ans, text;
    if (op === "+") {
      a = 10 + Math.floor(Math.random() * 80);
      b = 10 + Math.floor(Math.random() * 80);
      ans = a + b;
    } else if (op === "-") {
      a = 30 + Math.floor(Math.random() * 70);
      b = 10 + Math.floor(Math.random() * (a - 10));
      ans = a - b;
    } else {
      a = 2 + Math.floor(Math.random() * 11);
      b = 2 + Math.floor(Math.random() * 11);
      ans = a * b;
    }
    text = `${a} ${op} ${b} = ?`;
    return { text, ans };
  }

  let idx = 0;
  let q = makeQuestion();
  let finished = false;
  let timer = null;

  root.innerHTML = `
    <div class="game-header">
      <span>Mental math</span>
      <span class="math-progress" id="math-progress">${idx + 1} / ${TOTAL}</span>
    </div>
    <div class="math-question" id="math-q">${q.text}</div>
    <form id="math-form">
      <input
        id="math-input"
        class="math-input"
        type="text"
        inputmode="numeric"
        pattern="-?[0-9]*"
        placeholder="answer"
        autocomplete="off"
        required
        disabled
      />
      <button type="submit">Answer</button>
    </form>
    <p id="math-msg" class="game-message"></p>
  `;

  const qEl = root.querySelector("#math-q");
  const input = root.querySelector("#math-input");
  const msg = root.querySelector("#math-msg");
  const progressEl = root.querySelector("#math-progress");

  root.querySelector("#math-form").addEventListener("submit", (e) => {
    e.preventDefault();
    if (finished) return;
    const v = parseInt(input.value, 10);
    if (Number.isNaN(v)) return;
    if (v === q.ans) {
      idx += 1;
      if (idx >= TOTAL) {
        finished = true;
        if (timer) timer.stop();
        msg.textContent = "Cleared!";
        setTimeout(() => onClear(), 300);
        return;
      }
      q = makeQuestion();
      qEl.textContent = q.text;
      progressEl.textContent = `${idx + 1} / ${TOTAL}`;
      input.value = "";
      msg.textContent = "";
      input.focus();
    } else {
      msg.textContent = "Wrong — try again";
      input.value = "";
      input.focus();
    }
  });

  startCountdown(root, COUNTDOWN_SECONDS, () => {
    timer = createTimer(root, TIME_LIMIT, () => {
      if (finished) return;
      finished = true;
      input.disabled = true;
      input.blur();
      showGameOver(root, "Time up!");
    });
    input.disabled = false;
    input.focus();
  });
}
