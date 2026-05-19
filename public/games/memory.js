// Memory Game (Simon-style): repeat the lit sequence.
export function start(root, onClear) {
  const LENGTH = 5 + Math.floor(Math.random() * 3); // 5-7

  root.innerHTML = `
    <div class="game-header">
      <span>Watch and repeat</span>
      <span id="memory-progress">0 / ${LENGTH}</span>
    </div>
    <p id="memory-msg" class="game-message">Watch carefully...</p>
    <div class="memory-grid">
      <div class="memory-pad c0" data-i="0"></div>
      <div class="memory-pad c1" data-i="1"></div>
      <div class="memory-pad c2" data-i="2"></div>
      <div class="memory-pad c3" data-i="3"></div>
    </div>
  `;

  const sequence = [];
  for (let i = 0; i < LENGTH; i++) sequence.push(Math.floor(Math.random() * 4));

  const pads = Array.from(root.querySelectorAll(".memory-pad"));
  const msg = root.querySelector("#memory-msg");
  const progress = root.querySelector("#memory-progress");

  let inputIndex = 0;
  let accepting = false;

  function flash(idx) {
    return new Promise((resolve) => {
      const pad = pads[idx];
      pad.classList.add("lit");
      setTimeout(() => {
        pad.classList.remove("lit");
        setTimeout(resolve, 180);
      }, 450);
    });
  }

  async function playSequence() {
    accepting = false;
    msg.textContent = "Watch carefully...";
    await new Promise((r) => setTimeout(r, 500));
    for (const idx of sequence) {
      await flash(idx);
    }
    msg.textContent = "Your turn!";
    accepting = true;
    inputIndex = 0;
    progress.textContent = `0 / ${LENGTH}`;
  }

  pads.forEach((pad) => {
    pad.addEventListener("pointerdown", async () => {
      if (!accepting) return;
      const i = Number(pad.dataset.i);
      pad.classList.add("lit");
      setTimeout(() => pad.classList.remove("lit"), 180);
      if (sequence[inputIndex] === i) {
        inputIndex += 1;
        progress.textContent = `${inputIndex} / ${LENGTH}`;
        if (inputIndex === sequence.length) {
          accepting = false;
          msg.textContent = "Cleared!";
          setTimeout(() => onClear(), 400);
        }
      } else {
        accepting = false;
        msg.textContent = "Oops — try again";
        setTimeout(playSequence, 800);
      }
    });
  });

  playSequence();
}
