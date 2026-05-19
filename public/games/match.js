// Memory Match: 4x3 = 12 cards (6 pairs).
export function start(root, onClear) {
  const SYMBOLS = ["🍎", "🍋", "🍇", "🍓", "🍊", "🍉"];
  const deck = [];
  for (const s of SYMBOLS) deck.push(s, s);
  // Fisher-Yates shuffle.
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  root.innerHTML = `
    <div class="game-header">
      <span>Find the pairs</span>
      <span id="match-progress">0 / ${SYMBOLS.length}</span>
    </div>
    <div class="match-grid" id="match-grid"></div>
  `;

  const grid = root.querySelector("#match-grid");
  const progressEl = root.querySelector("#match-progress");
  let first = null;
  let lock = false;
  let matched = 0;

  deck.forEach((sym, idx) => {
    const card = document.createElement("div");
    card.className = "match-card";
    card.dataset.symbol = sym;
    card.dataset.idx = idx;
    card.textContent = "?";
    card.addEventListener("pointerdown", () => {
      if (lock) return;
      if (card.classList.contains("matched")) return;
      if (card.classList.contains("revealed")) return;
      card.classList.add("revealed");
      card.textContent = sym;
      if (!first) {
        first = card;
        return;
      }
      // Comparing.
      if (first.dataset.symbol === card.dataset.symbol && first !== card) {
        first.classList.add("matched");
        card.classList.add("matched");
        first = null;
        matched += 1;
        progressEl.textContent = `${matched} / ${SYMBOLS.length}`;
        if (matched === SYMBOLS.length) {
          setTimeout(() => onClear(), 350);
        }
      } else {
        lock = true;
        const a = first;
        const b = card;
        setTimeout(() => {
          a.classList.remove("revealed");
          b.classList.remove("revealed");
          a.textContent = "?";
          b.textContent = "?";
          first = null;
          lock = false;
        }, 700);
      }
    });
    grid.appendChild(card);
  });
}
