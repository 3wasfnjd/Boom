# Boom multiplayer server

The browser build, battle authority and all runtime assets are in this repository. Motri itself is not changed.

The account owner supplied `https://boom-multiplayer.3wasf-njd1.workers.dev` as the deployment origin. `multiplayer.json` now points GitHub Pages to this origin. Both URLs use the same rooms; use `?room=public` on both devices or share an in-game invitation. Append `?offline=1` for solo practice.

## Publish using the existing Cloudflare account

Connect the **existing** `3wasfnjd/Boom` repository to a new Cloudflare Worker:

| Setting | Value |
| --- | --- |
| Worker name | `boom-multiplayer` |
| Production branch | `main` |
| Root directory | `/` (repository root) |
| Build command | `npm run build && npm run package:site` |
| Deploy command | `npx wrangler@4 deploy` |

Let Cloudflare install the locked npm dependencies normally. Do not copy Motri's `SKIP_DEPENDENCY_INSTALL` setting. The root `wrangler.toml` defines the `BoomRoom` Durable Object, its initial SQLite migration and the static asset binding. A dry run with Wrangler 4.142.0 has been checked. Running workerd itself was blocked by this execution environment's network-interface enumeration restriction; see verification/worker-runtime-results.json. The shared battle logic and Node WebSocket adapter were exercised by the two-browser test. The subsequent public-server smoke test passed two browser joins, matching gun damage and shared rear crates; see verification/online-results.json.

The game automatically uses the WebSocket server at its own origin when served from `*.workers.dev`. The GitHub Pages URL uses `multiplayer.json` `serverUrl`, fetched without a browser cache. Update that field if the Worker moves to a different HTTPS origin.

No Cloudflare token is checked into this repository. GitHub Pages cannot execute a WebSocket server. Deployment needs the account owner to connect the Worker once, or an already authenticated Wrangler environment.

Official setup: https://developers.cloudflare.com/workers/ci-cd/builds/configuration/

## Local verification

```sh
npm ci
npm run build
npm run verify:multiplayer
node server/local.mjs
# Open the browser verifier in another process, or run its self-contained test:
node verification/multiplayer-browser.cjs
node verification/worker-runtime.mjs
```

The browser verifier starts its own local server; stop a manually launched server first. Use `BOOM_CHROMIUM` and `BOOM_CHROMIUM_ARGS` to supply an existing Playwright Chromium executable if necessary.

`node scripts/export-arena.cjs` regenerates `shared/arena-collision.json` from the actual rendered scene. Rebuild after regenerating it. The server uses those same ground heights, triangle diagonals, bridge and rotated wall bounds for projectile/cover checks.

## Rules and limits

- Six players per named room; player transforms submitted at 20 Hz; room snapshots at 20 Hz. Clients smooth remote vehicles with 80 ms interpolation and at most 120 ms extrapolation, adapted from Motri's snapshot interpolation.
- Server-owned health (100), projectile hits, weapon cadence, damage, kills, crate cooldowns and 5-second respawn. A 2-second spawn shield ends as soon as the player fires or drops a crate.
- Client vehicle poses remain client-simulated Rapier, as in Motri. Position speed/bounds/wall checks are basic validation, **not** a complete competitive anti-cheat system.
- Machinegun, cannon and rocket direct player damage are half their crate damage. Cannon/rocket splashes and cover are checked by the server.
- A rear crate has a 5-second drop cooldown, 650 ms arming time, 400 ms contact/hit fuse and 10-second lifetime. A player may have up to three live crates. Blasts can affect their owner too.
- Original stationary targets now trigger the same explosive effect and can chain to nearby crates. Their state/6-second respawn is shared.
- Original Motri radial/upward impulse is adapted to Boom's 2:1 physics scale. Damage does not come from a client-supplied victim/HP packet.
- Reconnect token is session-local; 30-second disconnect grace preserves HP, deaths and cooldowns. Manual recovery cannot heal. Rooms checkpoint state into Durable Object storage; in-flight bullets are transient across a Worker restart.
- This is an anonymous prototype without accounts or permanent scoreboards. Internet/mobile latency has not been measured. Two independent Chromium contexts exercised the local adapter and the public Worker connection, damage and crate replication.
