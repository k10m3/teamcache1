// ============================================
// CACHE CONFIGURATION (edit here only)
// ============================================
// Server-side authoritative copy. Keep in sync with public/app.js.
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
  presenceTTLSeconds: 60,
};

const GAMES = ["tap", "memory", "match", "math", "order"];

// ============================================
// Helpers
// ============================================

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function locateAtPoint(lat, lon, accuracy) {
  if (typeof lat !== "number" || typeof lon !== "number" || typeof accuracy !== "number") {
    return { error: "location_missing" };
  }
  if (accuracy > CACHE_CONFIG.gpsAccuracyMaxMeters) {
    return { error: "accuracy" };
  }
  const d1 = haversineMeters(lat, lon, CACHE_CONFIG.point1.latitude, CACHE_CONFIG.point1.longitude);
  const d2 = haversineMeters(lat, lon, CACHE_CONFIG.point2.latitude, CACHE_CONFIG.point2.longitude);
  if (d1 <= CACHE_CONFIG.point1.radiusMeters) return { point: 1 };
  if (d2 <= CACHE_CONFIG.point2.radiusMeters) return { point: 2 };
  return { error: "too_far" };
}

function generatePassword() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let p = "";
  const buf = new Uint8Array(6);
  crypto.getRandomValues(buf);
  for (let i = 0; i < 6; i++) p += chars[buf[i] % chars.length];
  return p;
}

function pickGameDifferentFrom(excludeGame) {
  const pool = GAMES.filter((g) => g !== excludeGame);
  return pool[Math.floor(Math.random() * pool.length)];
}

function computeTimeLeft(startedAtIso) {
  if (!startedAtIso) return null;
  const start = new Date(startedAtIso).getTime();
  if (isNaN(start)) return null;
  const elapsed = (Date.now() - start) / 1000;
  const left = Math.floor(CACHE_CONFIG.sessionDurationSeconds - elapsed);
  return left > 0 ? left : 0;
}

function pointKey(word, point, suffix) {
  return `session:${word}:point${point}_${suffix}`;
}

function presenceKey(word, point) {
  return `presence:${word}:point${point}`;
}

async function readState(kv, word) {
  const [
    presence1,
    presence2,
    startedAt,
    p1game,
    p2game,
    p1cleared,
    p2cleared,
    pwd1,
    pwd2,
    p1final,
    p2final,
  ] = await Promise.all([
    kv.get(presenceKey(word, 1)),
    kv.get(presenceKey(word, 2)),
    kv.get(`session:${word}:started_at`),
    kv.get(pointKey(word, 1, "game")),
    kv.get(pointKey(word, 2, "game")),
    kv.get(pointKey(word, 1, "cleared")),
    kv.get(pointKey(word, 2, "cleared")),
    kv.get(`session:${word}:password_for_point1`),
    kv.get(`session:${word}:password_for_point2`),
    kv.get(pointKey(word, 1, "final")),
    kv.get(pointKey(word, 2, "final")),
  ]);
  return {
    presence1: presence1 === "true",
    presence2: presence2 === "true",
    startedAt,
    p1game,
    p2game,
    p1cleared: p1cleared === "true",
    p2cleared: p2cleared === "true",
    pwd1,
    pwd2,
    p1final: p1final === "true",
    p2final: p2final === "true",
  };
}

function partnerOf(point) {
  return point === 1 ? 2 : 1;
}

function buildStatus(state, point) {
  const timeLeft = computeTimeLeft(state.startedAt);
  const self = point === 1 ? state.presence1 : state.presence2;
  const partner = point === 1 ? state.presence2 : state.presence1;
  const selfCleared = point === 1 ? state.p1cleared : state.p2cleared;
  const partnerCleared = point === 1 ? state.p2cleared : state.p1cleared;
  const selfFinal = point === 1 ? state.p1final : state.p2final;
  const selfGame = point === 1 ? state.p1game : state.p2game;
  // Password the partner generated for ME (i.e. what I should type in).
  // Stored as session:{word}:password_for_point{ME}.
  const passwordForMe = point === 1 ? state.pwd1 : state.pwd2;
  // Password I generated for my partner.
  const passwordForPartner = point === 1 ? state.pwd2 : state.pwd1;

  let status;
  if (selfFinal) {
    status = "final";
  } else if (state.startedAt && timeLeft === 0) {
    status = "expired";
  } else if (selfCleared) {
    status = "cleared";
  } else if (state.startedAt) {
    status = "ingame";
  } else if (state.presence1 && state.presence2) {
    status = "ready";
  } else {
    status = "waiting";
  }

  return {
    self,
    partner,
    status,
    timeLeft,
    game: selfGame || null,
    passwordForPartner: passwordForPartner || null,
    partnerHasPasswordReady: !!passwordForMe,
    partnerCleared,
  };
}

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    status: init.status || 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      ...(init.headers || {}),
    },
  });
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function validateSecret(word) {
  return typeof word === "string" && word.length > 0 && word.length <= 200;
}

// ============================================
// Route handlers
// ============================================

async function handleEnter(request, env) {
  const body = await readJson(request);
  if (!body || !validateSecret(body.secretWord)) {
    return json({ error: "invalid_input" }, { status: 400 });
  }
  const loc = locateAtPoint(body.latitude, body.longitude, body.accuracy);
  if (loc.error) return json({ error: loc.error }, { status: 400 });

  const kv = env.TEAMCACHE_KV;
  const word = body.secretWord;
  const point = loc.point;

  // Refresh presence.
  await kv.put(presenceKey(word, point), "true", {
    expirationTtl: CACHE_CONFIG.presenceTTLSeconds,
  });

  const state = await readState(kv, word);
  // Patch our just-written presence in case of stale read.
  if (point === 1) state.presence1 = true;
  else state.presence2 = true;

  const info = buildStatus(state, point);
  return json({
    point,
    pointLabel: point === 1 ? CACHE_CONFIG.point1.label : CACHE_CONFIG.point2.label,
    ...info,
  });
}

async function handleHeartbeat(request, env) {
  const body = await readJson(request);
  if (!body || !validateSecret(body.secretWord)) {
    return json({ error: "invalid_input" }, { status: 400 });
  }
  const point = body.point;
  if (point !== 1 && point !== 2) {
    return json({ error: "invalid_input" }, { status: 400 });
  }
  const kv = env.TEAMCACHE_KV;
  const word = body.secretWord;
  await kv.put(presenceKey(word, point), "true", {
    expirationTtl: CACHE_CONFIG.presenceTTLSeconds,
  });
  const state = await readState(kv, word);
  if (point === 1) state.presence1 = true;
  else state.presence2 = true;
  const info = buildStatus(state, point);
  return json({ point, ...info });
}

async function handleStartGame(request, env) {
  const body = await readJson(request);
  if (!body || !validateSecret(body.secretWord) || (body.point !== 1 && body.point !== 2)) {
    return json({ error: "invalid_input" }, { status: 400 });
  }
  const loc = locateAtPoint(body.latitude, body.longitude, body.accuracy);
  if (loc.error) return json({ error: loc.error }, { status: 400 });
  if (loc.point !== body.point) return json({ error: "wrong_point" }, { status: 400 });

  const kv = env.TEAMCACHE_KV;
  const word = body.secretWord;
  const point = body.point;
  const partner = partnerOf(point);

  // Need both presences.
  const state = await readState(kv, word);
  if (point === 1 ? !state.presence2 : !state.presence1) {
    return json({ error: "partner_not_ready" }, { status: 400 });
  }

  // Start the shared timer if not already started.
  let startedAt = state.startedAt;
  if (!startedAt) {
    startedAt = new Date().toISOString();
    await kv.put(`session:${word}:started_at`, startedAt, {
      expirationTtl: CACHE_CONFIG.sessionDurationSeconds,
    });
  } else {
    const left = computeTimeLeft(startedAt);
    if (left === 0) {
      return json({ error: "expired" }, { status: 400 });
    }
  }

  // Pick a game for this point if one isn't already assigned.
  const myGameKey = pointKey(word, point, "game");
  const partnerGame = partner === 1 ? state.p1game : state.p2game;
  let myGame = point === 1 ? state.p1game : state.p2game;
  if (!myGame) {
    myGame = pickGameDifferentFrom(partnerGame);
    await kv.put(myGameKey, myGame, {
      expirationTtl: CACHE_CONFIG.sessionDurationSeconds,
    });
  }

  return json({ game: myGame, timeLeft: computeTimeLeft(startedAt) });
}

async function handleChangeGame(request, env) {
  const body = await readJson(request);
  if (!body || !validateSecret(body.secretWord) || (body.point !== 1 && body.point !== 2)) {
    return json({ error: "invalid_input" }, { status: 400 });
  }
  const kv = env.TEAMCACHE_KV;
  const word = body.secretWord;
  const point = body.point;
  const state = await readState(kv, word);
  if (!state.startedAt) return json({ error: "not_started" }, { status: 400 });
  if (computeTimeLeft(state.startedAt) === 0) {
    return json({ error: "expired" }, { status: 400 });
  }
  // Don't allow changing after you cleared.
  const selfCleared = point === 1 ? state.p1cleared : state.p2cleared;
  if (selfCleared) return json({ error: "already_cleared" }, { status: 400 });

  const currentGame = point === 1 ? state.p1game : state.p2game;
  const partnerGame = point === 1 ? state.p2game : state.p1game;
  // Pick a new game that differs from both current and partner.
  const pool = GAMES.filter((g) => g !== currentGame && g !== partnerGame);
  const next = pool[Math.floor(Math.random() * pool.length)];
  const ttl = computeTimeLeft(state.startedAt) || CACHE_CONFIG.sessionDurationSeconds;
  await kv.put(pointKey(word, point, "game"), next, { expirationTtl: ttl });
  return json({ game: next, timeLeft: computeTimeLeft(state.startedAt) });
}

async function handleClearGame(request, env) {
  const body = await readJson(request);
  if (!body || !validateSecret(body.secretWord) || (body.point !== 1 && body.point !== 2)) {
    return json({ error: "invalid_input" }, { status: 400 });
  }
  const kv = env.TEAMCACHE_KV;
  const word = body.secretWord;
  const point = body.point;
  const partner = partnerOf(point);

  const state = await readState(kv, word);
  if (!state.startedAt) return json({ error: "not_started" }, { status: 400 });
  if (computeTimeLeft(state.startedAt) === 0) {
    return json({ error: "expired" }, { status: 400 });
  }
  const ttl = computeTimeLeft(state.startedAt) || CACHE_CONFIG.passwordTTLSeconds;

  // Mark cleared.
  await kv.put(pointKey(word, point, "cleared"), "true", { expirationTtl: ttl });

  // Generate the password that the PARTNER will need to type in,
  // i.e. session:{word}:password_for_point{partner}.
  const partnerPasswordKey = `session:${word}:password_for_point${partner}`;
  let existing = await kv.get(partnerPasswordKey);
  if (!existing) {
    existing = generatePassword();
    await kv.put(partnerPasswordKey, existing, { expirationTtl: ttl });
  }

  return json({ passwordForPartner: existing, timeLeft: computeTimeLeft(state.startedAt) });
}

async function handleSubmitPassword(request, env) {
  const body = await readJson(request);
  if (
    !body ||
    !validateSecret(body.secretWord) ||
    (body.point !== 1 && body.point !== 2) ||
    typeof body.password !== "string"
  ) {
    return json({ error: "invalid_input" }, { status: 400 });
  }
  const loc = locateAtPoint(body.latitude, body.longitude, body.accuracy);
  if (loc.error) return json({ error: loc.error }, { status: 400 });
  if (loc.point !== body.point) return json({ error: "wrong_point" }, { status: 400 });

  const kv = env.TEAMCACHE_KV;
  const word = body.secretWord;
  const point = body.point;

  const state = await readState(kv, word);
  if (!state.startedAt) return json({ error: "not_started" }, { status: 400 });
  if (computeTimeLeft(state.startedAt) === 0) {
    return json({ error: "expired" }, { status: 400 });
  }
  // Both sides must have cleared so a password exists for me.
  const passwordForMe = point === 1 ? state.pwd1 : state.pwd2;
  if (!passwordForMe) {
    return json({ error: "no_password_yet" }, { status: 400 });
  }

  const submitted = body.password.trim().toUpperCase();
  if (submitted !== passwordForMe) {
    return json({ correct: false });
  }

  const ttl = computeTimeLeft(state.startedAt) || CACHE_CONFIG.passwordTTLSeconds;
  await kv.put(pointKey(word, point, "final"), "true", { expirationTtl: ttl });

  // Build the partial final payload: point 1 -> latitude only, point 2 -> longitude only.
  const final =
    point === 1
      ? { lat: CACHE_CONFIG.final.latitude, hint: CACHE_CONFIG.final.hint }
      : { lon: CACHE_CONFIG.final.longitude, hint: CACHE_CONFIG.final.hint };

  return json({ correct: true, final, timeLeft: computeTimeLeft(state.startedAt) });
}

// ============================================
// Worker entry
// ============================================

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "POST, OPTIONS",
            "access-control-allow-headers": "content-type",
            "access-control-max-age": "86400",
          },
        });
      }
      if (request.method !== "POST") {
        return json({ error: "method_not_allowed" }, { status: 405 });
      }

      try {
        switch (url.pathname) {
          case "/api/enter":
            return await handleEnter(request, env);
          case "/api/heartbeat":
            return await handleHeartbeat(request, env);
          case "/api/start-game":
            return await handleStartGame(request, env);
          case "/api/change-game":
            return await handleChangeGame(request, env);
          case "/api/clear-game":
            return await handleClearGame(request, env);
          case "/api/submit-password":
            return await handleSubmitPassword(request, env);
          default:
            return json({ error: "not_found" }, { status: 404 });
        }
      } catch (err) {
        return json({ error: "server_error", message: String(err && err.message) }, { status: 500 });
      }
    }

    // Anything else: hand off to the static asset binding.
    return env.ASSETS.fetch(request);
  },
};
