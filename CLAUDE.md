# Teamcache1

A web app for a 2-point, 2-team teamwork-style geocache. Two players at two
different physical locations cooperate by clearing mini-games, exchanging
passwords by phone/message, and unlocking the final cache coordinates.

## Stack

- Cloudflare Workers (serves static assets via the `[assets]` binding and
  hosts the `/api/*` endpoints)
- Cloudflare KV for presence, session, game, and password state
- Vanilla HTML / CSS / JS (mobile-first, no framework)
- All UI text, comments, and error messages are in English

## Layout

```
teamcache1/
├── CLAUDE.md
├── README.md
├── package.json
├── wrangler.toml
├── public/
│   ├── index.html
│   ├── styles.css
│   ├── app.js          # CACHE_CONFIG (point coords, radius, TTLs) lives at the top
│   └── games/          # tap.js, memory.js, match.js, math.js, order.js
└── workers/
    └── api.js          # CACHE_CONFIG also lives at the top (server-side copy)
```

`CACHE_CONFIG` is duplicated in `public/app.js` and `workers/api.js`. Edit
both when changing coordinates, radii, or TTLs. The server-side copy is
authoritative for location checks and session timing; the client copy is
only used for display (final coordinates, formatting).

## Game flow

1. Player visits the site and enters the team secret word (exact match;
    case, spaces, full-width all distinguished). Not stored in the browser.
2. Browser fetches geolocation; client posts `/api/enter` with
    `{ secretWord, latitude, longitude, accuracy }`.
3. Server rejects if accuracy > 50 m or distance > 20 m from either point;
    otherwise assigns point 1 or 2 and marks `presence:{word}:pointN` with
    a 60 s TTL.
4. Client polls `/api/heartbeat` every 5 s to refresh presence and observe
    the partner. When both are present, the **Get Password** button enables.
5. First press of **Get Password** starts the 10-minute timer
    (`session:{word}:started_at`, 600 s TTL) and picks a random game for
    that point that differs from the partner's game.
6. On game clear, the client posts `/api/clear-game`; the server generates
    a 6-character A–Z0–9 password **for the partner** and stores it under
    `session:{word}:password_for_point{partner}`.
7. The two players read each other's passwords over phone/LINE/email.
8. Each player enters the password they received via `/api/submit-password`.
    On success, the server returns **half** of the final coordinates plus the
    hint. Point 1 receives only the latitude (`N D° MM.MMM`), point 2 only
    the longitude (`E D° MM.MMM`). The two players must read their halves to
    each other to assemble the full coordinate. There is no "Open in Google
    Maps" button — only "Copy" the visible half.

## Re-entry behaviour

When the secret word is re-submitted, `/api/enter` inspects KV and returns
one of:

- `waiting` — nothing started or partner not present yet
- `ready` — both present, no timer started yet
- `ingame` — timer running, this side hasn't cleared (resumes with the
    same game already assigned for this point if one exists; otherwise no
    game is picked until **Get Password**)
- `cleared` — this side cleared; if partner also cleared, password-input
    field is shown
- `final` — this side already submitted partner's password correctly
- `expired` — timer ran out; client is shown the expired message and
    returned to the waiting screen

## KV keys

```
presence:{word}:point1                  TTL 60
presence:{word}:point2                  TTL 60
session:{word}:started_at               TTL 600
session:{word}:point1_game              TTL 600
session:{word}:point2_game              TTL 600
session:{word}:point1_cleared           TTL 600
session:{word}:point2_cleared           TTL 600
session:{word}:password_for_point1      TTL 600
session:{word}:password_for_point2      TTL 600
session:{word}:point1_final             TTL 600  (set when point1 submits correct pwd)
session:{word}:point2_final             TTL 600
```

KV binding name: `TEAMCACHE_KV`.

## API

All POST, JSON in / JSON out.

| Path                  | Body                                                    | Response                                                                       |
|-----------------------|---------------------------------------------------------|--------------------------------------------------------------------------------|
| `/api/enter`          | `{secretWord, latitude, longitude, accuracy}`           | `{point, status, partner, timeLeft?, game?, passwordForPartner?, ...}`         |
| `/api/heartbeat`      | `{secretWord, point}`                                   | `{self, partner, status, timeLeft, game?, passwordForPartner?, partnerCleared}`|
| `/api/start-game`     | `{secretWord, point, latitude, longitude, accuracy}`    | `{game, timeLeft}`                                                             |
| `/api/change-game`    | `{secretWord, point}`                                   | `{game}`                                                                       |
| `/api/clear-game`     | `{secretWord, point}`                                   | `{passwordForPartner}`                                                         |
| `/api/submit-password`| `{secretWord, point, password, latitude, longitude, accuracy}` | `{correct, final?: {lat, lon, gpsFormat, hint}}`                        |

## Games

`public/games/{tap,memory,match,math,order}.js` each export a `start(root, onClear)`
function. `app.js` loads them dynamically and renders inside `#game-area`.
Each game is designed to take ~1–2 minutes.

## Deployment

Deployed as a single Worker with the `[assets]` binding pointing at
`public/`. Requires a KV namespace bound as `TEAMCACHE_KV`. See README.md
for the wrangler commands.
