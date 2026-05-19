// ============================================
// CACHE CONFIGURATION (edit here only)
// ============================================
// Client-side copy. Keep in sync with workers/api.js.
const CACHE_CONFIG = {
  point1: {
    latitude: 34.0700,
    longitude: 134.5500,
    radiusMeters: 20,
    label: "Point 1",
  },
  point2: {
    latitude: 34.0750,
    longitude: 134.5550,
    radiusMeters: 20,
    label: "Point 2",
  },
  // Single shared final coordinate. Point 1 sees only the latitude,
  // Point 2 sees only the longitude.
  final: {
    latitude: 34.0800,
    longitude: 134.5600,
    hint: "Look behind the large tree near the bench.",
  },
  sessionDurationSeconds: 600,
  passwordTTLSeconds: 600,
  gpsAccuracyMaxMeters: 50,
};

// ============================================
// State
// ============================================

const state = {
  secretWord: null,
  point: null, // 1 | 2
  status: null,
  game: null,
  passwordForPartner: null,
  partnerHasPasswordReady: false,
  partnerCleared: false,
  timeLeft: null,
  pollInterval: null,
  countdownInterval: null,
};

const SCREENS = ["enter", "lobby", "game", "cleared", "final", "expired"];

const ERROR_MESSAGES = {
  accuracy: "GPS accuracy is too low. Please try again.",
  too_far: "You are too far from the point. Please get closer.",
  location_missing: "Please allow location access to continue.",
  geolocation_denied: "Please allow location access to continue.",
  geolocation_unavailable: "Could not get your location. Please try again.",
  geolocation_timeout: "Location request timed out. Please try again.",
  partner_not_ready: "Your partner is not present yet.",
  not_started: "Session has not started yet.",
  already_cleared: "You have already cleared the game.",
  expired: "Session expired. Please start over.",
  wrong_point: "You moved away from your point.",
  no_password_yet: "Wait for your partner to clear their game first.",
  invalid_input: "Invalid request.",
  server_error: "Server error. Please retry.",
};

// ============================================
// Utilities
// ============================================

function showScreen(name) {
  for (const id of SCREENS) {
    const el = document.getElementById("screen-" + id);
    if (el) el.hidden = id !== name;
  }
}

function setError(elId, errKey, customMessage) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (!errKey && !customMessage) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  el.textContent = customMessage || ERROR_MESSAGES[errKey] || errKey || "Error";
}

function formatTime(seconds) {
  if (seconds == null) return "";
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

function updateTimerDisplay() {
  const el = document.getElementById("timer");
  if (state.timeLeft == null || state.status === "final") {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.textContent = "Time left: " + formatTime(state.timeLeft);
  if (state.timeLeft <= 60) el.classList.add("warn");
  else el.classList.remove("warn");
}

function startCountdown() {
  stopCountdown();
  state.countdownInterval = setInterval(() => {
    if (state.timeLeft != null && state.timeLeft > 0) {
      state.timeLeft -= 1;
      updateTimerDisplay();
      if (state.timeLeft === 0) {
        handleExpired();
      }
    }
  }, 1000);
}

function stopCountdown() {
  if (state.countdownInterval) {
    clearInterval(state.countdownInterval);
    state.countdownInterval = null;
  }
}

function startPolling() {
  stopPolling();
  state.pollInterval = setInterval(pollHeartbeat, 5000);
}

function stopPolling() {
  if (state.pollInterval) {
    clearInterval(state.pollInterval);
    state.pollInterval = null;
  }
}

async function api(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = { error: "server_error" };
  }
  return { ok: res.ok, status: res.status, data };
}

function getGeolocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ error: "geolocation_unavailable" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
      (err) => {
        if (err.code === 1) resolve({ error: "geolocation_denied" });
        else if (err.code === 2) resolve({ error: "geolocation_unavailable" });
        else if (err.code === 3) resolve({ error: "geolocation_timeout" });
        else resolve({ error: "geolocation_unavailable" });
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

// Decimal degrees to "D° MM.MMM" minutes form.
function toGpsMinutes(decimal) {
  const sign = decimal >= 0 ? 1 : -1;
  const abs = Math.abs(decimal);
  const deg = Math.floor(abs);
  const minutes = (abs - deg) * 60;
  return { sign, deg, minutes };
}

function formatLatitude(lat) {
  const { sign, deg, minutes } = toGpsMinutes(lat);
  const hemi = sign >= 0 ? "N" : "S";
  return `${hemi} ${deg}° ${minutes.toFixed(3).padStart(6, "0")}`;
}

function formatLongitude(lon) {
  const { sign, deg, minutes } = toGpsMinutes(lon);
  const hemi = sign >= 0 ? "E" : "W";
  return `${hemi} ${deg}° ${minutes.toFixed(3).padStart(6, "0")}`;
}

// ============================================
// Flow handlers
// ============================================

function applyStatus(data) {
  state.point = data.point ?? state.point;
  state.status = data.status;
  state.timeLeft = data.timeLeft ?? null;
  state.game = data.game ?? state.game;
  state.passwordForPartner = data.passwordForPartner ?? state.passwordForPartner;
  state.partnerHasPasswordReady = !!data.partnerHasPasswordReady;
  state.partnerCleared = !!data.partnerCleared;
  updateTimerDisplay();
  routeScreenForStatus();
}

function routeScreenForStatus() {
  if (!state.status) return;
  switch (state.status) {
    case "waiting":
    case "ready":
      renderLobby();
      showScreen("lobby");
      break;
    case "ingame":
      renderIngame();
      break;
    case "cleared":
      renderCleared();
      showScreen("cleared");
      break;
    case "final":
      // We don't have the final payload in heartbeat; if we already showed
      // it earlier we'll have left it on screen. If we just resumed and the
      // server says final, treat as "you already won".
      showScreen("final");
      break;
    case "expired":
      handleExpired();
      break;
  }
}

function renderLobby() {
  document.getElementById("self-point-label").textContent =
    state.point === 1 ? CACHE_CONFIG.point1.label : CACHE_CONFIG.point2.label;
  const partnerBadge = document.getElementById("partner-badge");
  const partnerStatus = document.getElementById("partner-status");
  const btn = document.getElementById("get-password-btn");
  if (state.status === "ready") {
    partnerBadge.className = "badge ok";
    partnerBadge.textContent = "Partner";
    partnerStatus.innerHTML = "Both teams are ready!";
    btn.disabled = false;
  } else {
    partnerBadge.className = "badge wait";
    partnerBadge.textContent = "Partner";
    partnerStatus.innerHTML =
      "Waiting for the other team... <br /><span class='muted small'>Please make sure they use the same secret word.</span>";
    btn.disabled = true;
  }
}

function renderIngame() {
  showScreen("game");
  if (state.game) {
    loadGame(state.game);
  } else {
    // No game assigned yet -- shouldn't normally hit this; fall back to lobby.
    showScreen("lobby");
  }
}

function renderCleared() {
  document.getElementById("my-password").textContent = state.passwordForPartner || "";
  const passwordForm = document.getElementById("password-form");
  const partnerWait = document.getElementById("partner-wait");
  // Show password input only when partner has cleared (i.e. server has a
  // password waiting for me).
  if (state.partnerHasPasswordReady) {
    passwordForm.hidden = false;
    partnerWait.hidden = true;
  } else {
    passwordForm.hidden = true;
    partnerWait.hidden = false;
  }
}

function handleExpired() {
  stopPolling();
  stopCountdown();
  state.timeLeft = null;
  updateTimerDisplay();
  showScreen("expired");
}

// ============================================
// Network actions
// ============================================

async function doEnter() {
  setError("enter-error", null);
  const secret = document.getElementById("secret-input").value;
  if (!secret) return;
  const statusEl = document.getElementById("enter-status");
  statusEl.hidden = false;
  statusEl.textContent = "Getting your location...";

  const loc = await getGeolocation();
  if (loc.error) {
    statusEl.hidden = true;
    setError("enter-error", loc.error);
    return;
  }
  statusEl.textContent = "Checking the cache point...";

  const { ok, data } = await api("/api/enter", {
    secretWord: secret,
    latitude: loc.latitude,
    longitude: loc.longitude,
    accuracy: loc.accuracy,
  });
  statusEl.hidden = true;
  if (!ok || data.error) {
    setError("enter-error", data && data.error);
    return;
  }

  state.secretWord = secret;
  applyStatus(data);
  startPolling();
  if (state.timeLeft != null && state.timeLeft > 0) startCountdown();
}

async function pollHeartbeat() {
  if (!state.secretWord || !state.point) return;
  const { ok, data } = await api("/api/heartbeat", {
    secretWord: state.secretWord,
    point: state.point,
  });
  if (!ok || data.error) return;
  applyStatus(data);
  if (
    state.timeLeft != null &&
    state.timeLeft > 0 &&
    state.status !== "final" &&
    !state.countdownInterval
  ) {
    startCountdown();
  }
}

async function doGetPassword() {
  setError("lobby-error", null);
  const btn = document.getElementById("get-password-btn");
  btn.disabled = true;
  const loc = await getGeolocation();
  if (loc.error) {
    setError("lobby-error", loc.error);
    btn.disabled = false;
    return;
  }
  const { ok, data } = await api("/api/start-game", {
    secretWord: state.secretWord,
    point: state.point,
    latitude: loc.latitude,
    longitude: loc.longitude,
    accuracy: loc.accuracy,
  });
  if (!ok || data.error) {
    setError("lobby-error", data && data.error);
    btn.disabled = false;
    return;
  }
  state.game = data.game;
  state.status = "ingame";
  state.timeLeft = data.timeLeft;
  updateTimerDisplay();
  if (!state.countdownInterval) startCountdown();
  showScreen("game");
  loadGame(state.game);
}

async function doChangeGame() {
  setError("game-error", null);
  const { ok, data } = await api("/api/change-game", {
    secretWord: state.secretWord,
    point: state.point,
  });
  if (!ok || data.error) {
    setError("game-error", data && data.error);
    return;
  }
  state.game = data.game;
  loadGame(state.game);
}

async function doClearGame() {
  const { ok, data } = await api("/api/clear-game", {
    secretWord: state.secretWord,
    point: state.point,
  });
  if (!ok || data.error) {
    setError("game-error", data && data.error);
    return;
  }
  state.passwordForPartner = data.passwordForPartner;
  state.status = "cleared";
  renderCleared();
  showScreen("cleared");
  // Refresh state immediately to learn if partner already cleared.
  pollHeartbeat();
}

async function doSubmitPassword(e) {
  e.preventDefault();
  setError("password-error", null);
  const input = document.getElementById("password-input");
  const pwd = (input.value || "").trim().toUpperCase();
  if (pwd.length === 0) return;
  const loc = await getGeolocation();
  if (loc.error) {
    setError("password-error", loc.error);
    return;
  }
  const { ok, data } = await api("/api/submit-password", {
    secretWord: state.secretWord,
    point: state.point,
    password: pwd,
    latitude: loc.latitude,
    longitude: loc.longitude,
    accuracy: loc.accuracy,
  });
  if (!ok || data.error) {
    setError("password-error", data && data.error);
    return;
  }
  if (!data.correct) {
    setError("password-error", null, "Incorrect password. Try again.");
    return;
  }
  state.status = "final";
  stopPolling();
  renderFinal(data.final);
  showScreen("final");
}

function renderFinal(finalPayload) {
  const heading = document.getElementById("final-heading");
  const coords = document.getElementById("final-coords");
  const note = document.getElementById("final-share-note");
  const hintEl = document.getElementById("final-hint");

  if (state.point === 1) {
    heading.textContent = "Your part of the final coordinates (Latitude):";
    const lat = finalPayload && typeof finalPayload.lat === "number"
      ? finalPayload.lat
      : CACHE_CONFIG.final.latitude;
    coords.textContent = formatLatitude(lat);
    note.textContent = "Ask your partner for the longitude (East) part!";
  } else {
    heading.textContent = "Your part of the final coordinates (Longitude):";
    const lon = finalPayload && typeof finalPayload.lon === "number"
      ? finalPayload.lon
      : CACHE_CONFIG.final.longitude;
    coords.textContent = formatLongitude(lon);
    note.textContent = "Ask your partner for the latitude (North) part!";
  }

  hintEl.textContent = (finalPayload && finalPayload.hint) || CACHE_CONFIG.final.hint;
  // Hide the timer on the final screen.
  state.timeLeft = null;
  updateTimerDisplay();
}

async function copyCoords() {
  const text = document.getElementById("final-coords").textContent;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Fallback: ignore failures silently.
  }
  const fb = document.getElementById("copy-feedback");
  fb.hidden = false;
  setTimeout(() => {
    fb.hidden = true;
  }, 1500);
}

// ============================================
// Game loader
// ============================================

async function loadGame(name) {
  const root = document.getElementById("game-area");
  root.innerHTML = "";
  try {
    const mod = await import(`/games/${name}.js`);
    if (mod && typeof mod.start === "function") {
      mod.start(root, () => doClearGame());
    } else {
      root.textContent = "Game module failed to load.";
    }
  } catch (err) {
    root.textContent = "Failed to load game: " + (err && err.message);
  }
}

// ============================================
// Wire up
// ============================================

function init() {
  document.getElementById("enter-form").addEventListener("submit", (e) => {
    e.preventDefault();
    doEnter();
  });
  document.getElementById("get-password-btn").addEventListener("click", doGetPassword);
  document.getElementById("retry-btn").addEventListener("click", () => {
    if (state.game) loadGame(state.game);
  });
  document.getElementById("change-game-btn").addEventListener("click", doChangeGame);
  document.getElementById("password-form").addEventListener("submit", doSubmitPassword);
  document.getElementById("copy-coords-btn").addEventListener("click", copyCoords);
  document.getElementById("restart-btn").addEventListener("click", () => {
    location.reload();
  });
}

document.addEventListener("DOMContentLoaded", init);
