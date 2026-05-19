// Tap Game: tap 10 moving targets.
export function start(root, onClear) {
  const TOTAL = 10;
  let remaining = TOTAL;

  root.innerHTML = `
    <div class="game-header">
      <span>Tap the green dot</span>
      <span><b id="tap-count">${TOTAL}</b> left</span>
    </div>
    <div class="tap-board" id="tap-board"></div>
  `;

  const board = root.querySelector("#tap-board");
  const counter = root.querySelector("#tap-count");

  function spawn() {
    if (remaining <= 0) return;
    const dot = document.createElement("div");
    dot.className = "tap-target";
    const rect = board.getBoundingClientRect();
    const maxX = Math.max(0, rect.width - 56);
    const maxY = Math.max(0, rect.height - 56);
    dot.style.left = Math.random() * maxX + "px";
    dot.style.top = Math.random() * maxY + "px";
    dot.textContent = remaining;

    const tap = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (dot.dataset.done === "1") return;
      dot.dataset.done = "1";
      dot.remove();
      remaining -= 1;
      counter.textContent = remaining;
      if (remaining === 0) {
        onClear();
      } else {
        spawn();
      }
    };
    dot.addEventListener("pointerdown", tap);
    board.appendChild(dot);
  }

  spawn();
}
