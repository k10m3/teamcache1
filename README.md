# Teamcache1

A 2-point, 2-team teamwork-style geocache helper. Two players at two
different physical spots cooperate by clearing mini-games, swapping
passwords by phone/message, and finally exchanging halves of the final
coordinates (point 1 holds the latitude, point 2 holds the longitude).

See `CLAUDE.md` for the full spec.

## Editing the cache configuration

Coordinates, radii, the hint, and the timer length live at the top of
two files. Edit both — the server uses its copy to enforce location and
timing, the client uses its copy to format the final display.

- `public/app.js` (client copy)
- `workers/api.js` (server copy, authoritative)

```js
const CACHE_CONFIG = {
  point1: { latitude: 34.0700, longitude: 134.5500, radiusMeters: 20, label: "Point 1" },
  point2: { latitude: 34.0750, longitude: 134.5550, radiusMeters: 20, label: "Point 2" },
  final:  { latitude: 34.0800, longitude: 134.5600, hint: "Look behind the large tree near the bench." },
  sessionDurationSeconds: 600,
  passwordTTLSeconds: 600,
  gpsAccuracyMaxMeters: 50,
};
```

## Deployment

This is deployed as a single Cloudflare Worker that serves the static
files in `public/` via the `[assets]` binding and handles `/api/*`
routes.

1. Create a KV namespace:

   ```sh
   npx wrangler kv namespace create TEAMCACHE_KV
   ```

   Paste the returned `id` into `wrangler.toml` under the
   `[[kv_namespaces]]` block.

2. Deploy:

   ```sh
   npx wrangler deploy
   ```

Local dev:

```sh
npx wrangler dev
```

Wrangler will spin up a local KV namespace by default.

## GitHub Actions

Set `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as repository
secrets. The workflow at `.github/workflows/deploy.yml` runs
`wrangler deploy` on pushes to `main`.
