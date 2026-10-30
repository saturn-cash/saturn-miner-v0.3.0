# Saturn Miner: "different planet" redesign

## What changed
- **One persistent 3D universe** (`components/cosmos/`) sits behind every screen. Each screen is a place:
  Mission control = Saturn orbit, Mining = the rings, Wallet = Titan, Network = deep space relay,
  Activity = Enceladus (with ice geysers), Diagnostics = the north-pole hexagon storm, Settings = high orbit.
  Switching screens flies the camera there, with hyperspace streaks and an arrival title card.
- **Launch sequence**: preflight checks, then the curtain drops and you warp in from 1.27 billion km out.
- **The miner drives the planet**: hashrate speeds up the planet spin, ring energy sweeps and polar aurora.
  Every accepted share fires a comet across the sky. Starting the miner kicks the ship.
  Finding a block triggers a full-screen supernova (preview it under Settings).
- **New look**: Unbounded display type, Sora body and JetBrains Mono for hashes/logs (all bundled locally via
  @fontsource, so the Tauri app works offline). Glass panels are lit from the same sun as Saturn.
  The hexagon motif comes from Saturn's real polar storm.
- **Bug fix**: shader uniforms were being copied by React Three Fiber, so the shader animations never ran
  (twinkle, ring pulses, energy). Materials now get their uniforms through constructor `args`.

## Round 2
- **Bloom**: rings, aurora, warp streaks, the reactor and the supernova glow (half-resolution, only when Cinematic flight is on).
  The canvas runs `flat linear` because the custom shaders already output display colour.
- **Sound** (`lib/audio/sound.ts`): fully synthesized with WebAudio — space drone that opens up with hashrate,
  warp whoosh, reactor ignition/power-down, share pings, block-found chord, arrival bell. Settings → Sound + Volume.
  Audio starts on the first click (browser rule); clicking the launch screen gives you the warp-in with sound.
- **Grab the universe**: drag any empty space to swing the camera around; it springs back when you let go.
- **Flight map** in the nav: top-down Saturn system with your ship's live position and trail.

## Round 3
- **Typefaces**: Oxanium + Inter by default. Settings → Typeface switches live between Oxanium + Inter,
  Orbitron + Exo 2, Rajdhani + Inter and Chakra Petch. Display sizes scale per face via `--ds` in globals.css.
  Settings now persist between launches (localStorage).
- **Every moon**: `lib/cosmos/moons.ts` has all 23 named ring/major/trojan moons on real orbit radii
  (true scale inside Titan, compressed beyond), each with its own terrain (Herschel on Mimas, two-tone
  Iapetus, sponge Hyperion, Odysseus + Ithaca Chasma on Tethys, Dione's cliffs…), plus a 270-moon swarm for the
  irregulars. They orbit (Kepler-style, sped up) and stay tidally locked. Moon destinations track their moon.
- **Hardware (Mimas)**: Bitaxe fleet control over the AxeOS local API — add by IP or scan the LAN,
  live hashrate/temps/power/efficiency, one-click "Point at Saturn" pool, Eco/Stock/Turbo clock presets
  from the device's own frequency/voltage options, auto/manual fan, rename, identify, restart.
  Desktop: implemented in `src-tauri/src/bitaxe.rs`. Browser preview: use the demo device.

## Round 4 — Apple liquid glass
- Dropped the game-panel skeleton: no sidebar, no chip bar, no hexagons, no gradient gamer type.
- Floating glass tab bar at the bottom (`components/shell/tab-bar.tsx`), large titles + one status capsule up top.
- `.glass` in globals.css is clear liquid glass: low tint + light dimming layer, blur, specular rim.
- Type is Inter only (stand-in for SF Pro, which can't ship on Windows); hero numbers are light weight.
- Fixed: the CSS minifier was keeping only `-webkit-backdrop-filter`, so Chromium/WebView2 never blurred
  anything. Don't add `-webkit-backdrop-filter` by hand; the build adds it for Safari.
- Fixed: page transitions animated `filter`, which also disables backdrop blur for everything inside.

## Respecting the machine
- "Cinematic flight" (Settings) off, or OS reduced-motion on → no warp, no flight; camera snaps and only redraws on navigation.
- The FPS cap (30/60) still applies to the 3D scene.

## Key files
- `components/cosmos/cosmos-scene.tsx` – scene, waypoints (`WAYPOINTS`), camera rig, warp, comets, moons
- `components/cosmos/shaders.ts` – Saturn + hexagon, aurora, rings, Titan, Enceladus, nebula, warp, shockwave
- `lib/cosmos/store.ts` – tiny bus: travel, warp kicks, comets, celebrations
- `components/shell/*` – launch, orbit nav, HUD topbar, arrival card, supernova
