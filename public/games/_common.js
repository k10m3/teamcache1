// Shared helpers for per-game timers and game-over UI.

export function createTimer(root, seconds, onTimeout) {
  let timeLeft = seconds;

  const wrap = document.createElement("div");
  wrap.className = "game-timer";
  wrap.innerHTML = `Time: <b></b>s`;
  const valueEl = wrap.querySelector("b");
  valueEl.textContent = timeLeft;

  // Insert right after the .game-header so the timer sits near the progress.
  const header = root.querySelector(".game-header");
  if (header && header.parentNode === root) {
    root.insertBefore(wrap, header.nextSibling);
  } else {
    root.insertBefore(wrap, root.firstChild);
  }

  const interval = setInterval(() => {
    // If the game module was unloaded (root cleared), stop ticking.
    if (!wrap.isConnected) {
      clearInterval(interval);
      return;
    }
    timeLeft -= 1;
    valueEl.textContent = Math.max(0, timeLeft);
    if (timeLeft <= 5) wrap.classList.add("warn");
    if (timeLeft <= 0) {
      clearInterval(interval);
      onTimeout();
    }
  }, 1000);

  return {
    stop() {
      clearInterval(interval);
    },
  };
}

export function showGameOver(root, message) {
  root.classList.add("over");
  const overlay = document.createElement("div");
  overlay.className = "game-overlay-msg";
  overlay.textContent = message;
  root.appendChild(overlay);
}

// Shows a countdown overlay (e.g. 5, 4, 3, 2, 1, Go!) over the game while
// blocking interaction, then invokes onStart() to begin the actual game.
export function startCountdown(root, seconds, onStart) {
  root.classList.add("over");
  const overlay = document.createElement("div");
  overlay.className = "game-overlay-msg countdown";
  overlay.textContent = seconds;
  root.appendChild(overlay);

  let remaining = seconds;
  const interval = setInterval(() => {
    if (!overlay.isConnected) {
      clearInterval(interval);
      return;
    }
    remaining -= 1;
    if (remaining > 0) {
      overlay.textContent = remaining;
    } else if (remaining === 0) {
      overlay.textContent = "Go!";
    } else {
      clearInterval(interval);
      overlay.remove();
      root.classList.remove("over");
      onStart();
    }
  }, 1000);
}
