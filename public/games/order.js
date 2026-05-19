// Number Order: tap 1..9 in order. Numbers placed at random positions.
export function start(root, onClear) {
  const COUNT = 9;
  root.innerHTML = `
    <div class="game-header">
      <span>Tap 1 to ${COUNT} in order</span>
      <span>Next: <b id="order-next">1</b></span>
    </div>
    <div class="order-board" id="order-board"></div>
    <p id="order-msg" class="game-message"></p>
  `;

  const board = root.querySelector("#order-board");
  const nextEl = root.querySelector("#order-next");
  const msg = root.querySelector("#order-msg");
  let next = 1;

  function place() {
    board.innerHTML = "";
    const rect = board.getBoundingClientRect();
    const maxX = Math.max(0, rect.width - 64);
    const maxY = Math.max(0, rect.height - 64);
    const placed = [];
    const cells = [];
    for (let n = 1; n <= COUNT; n++) {
      let x = 0,
        y = 0;
      // Try to avoid overlap (up to 40 attempts per cell).
      for (let tries = 0; tries < 40; tries++) {
        x = Math.random() * maxX;
        y = Math.random() * maxY;
        let ok = true;
        for (const p of placed) {
          const dx = p.x - x;
          const dy = p.y - y;
          if (dx * dx + dy * dy < 70 * 70) {
            ok = false;
            break;
          }
        }
        if (ok) break;
      }
      placed.push({ x, y });
      const cell = document.createElement("div");
      cell.className = "order-cell";
      cell.textContent = n;
      cell.dataset.n = n;
      cell.style.left = x + "px";
      cell.style.top = y + "px";
      cell.addEventListener("pointerdown", () => {
        const v = Number(cell.dataset.n);
        if (v === next) {
          cell.classList.add("done");
          next += 1;
          nextEl.textContent = next <= COUNT ? next : "✓";
          if (next > COUNT) {
            msg.textContent = "Cleared!";
            setTimeout(() => onClear(), 350);
          }
        } else {
          msg.textContent = "Wrong order — start again";
          next = 1;
          nextEl.textContent = next;
          // Reset.
          for (const c of cells) c.classList.remove("done");
        }
      });
      cells.push(cell);
      board.appendChild(cell);
    }
  }

  place();
}
