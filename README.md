# SpaceRoam

A real-time, fully procedural Solar System flight sim in the browser. It's one self-contained React component
(`src/SpaceRoam.jsx`) with a pure-WebGPU engine. It uses no 3D or physics libraries and loads no texture,
model or audio files.

**Play in the browser:** https://kmatiq.github.io/spaceroam/ (desktop Chrome, deployed from `main` by `.github/workflows/pages.yml`)

**Share as one file:** download https://kmatiq.github.io/spaceroam/spaceroam.html (or run `npm run single`). That one ~233 KB HTML file contains everything: send it to anyone and they double-click it. They need desktop Chrome or Edge, or another browser with WebGPU.

```bash
npm install
npm run dev        # open the printed URL in Chrome (WebGPU)
npm run size       # writes dist/SpaceRoam.min.js and prints the size table
```

```jsx
import SpaceRoam, { registerStarSystem, STAR_SYSTEMS } from './SpaceRoam.jsx';
<SpaceRoam systemId="sol" onReady={(api) => api.startBenchmark()} />
```

## Controls

| Key | Action |
| --- | --- |
| `W` / `S` | forward / reverse thrust |
| `A` / `D` | strafe |
| `Space` / `X` | up / down |
| `Q` / `E` | roll |
| Mouse (click to lock pointer), or arrow keys | pitch / yaw |
| `Shift` | boost (×8) |
| `/` | search places and fly there |
| `N` | live system map |
| Click a planet / label, or `T` | choose target (`T` opens the target list) |
| `Tab` / `Shift+Tab` | cycle target |
| `F` | Supercruise to target: auto-aligns, accelerates exponentially, decelerates automatically, drops out on arrival. `F` or `S` cancels |
| `V` | third-person view (raymarched ship) |
| `B` | 60 s benchmark |
| `J` | switch star system (Sol ↔ Kestrel V2 demo) |
| `[` / `]` | exposure |
| `P` | photo mode: hides all HUD text, labels, orbit lines and buttons; a button saves a PNG |
| `G` | performance stats (CPU/GPU ms) |
| `H` | hide help |

### Gameplay

- **Exploration log:** fly close to a planet, moon, station or comet to discover it. You get a toast with a
  fun fact and the log count. Uncharted bodies have amber markers. Progress is saved per system in your
  browser (localStorage).
- **Supercruise:** `F` charges for 1.2 s (the ship auto-aligns to the target), then jumps with a flash.
  Cruise flies in the target's own moving frame, so fast movers (orbiting stations, the comet) can't outrun you.
  On arrival you enter the target's reference frame and stay with it. While you ride along with a station or comet, the HUD shows
  **RIDING** with its speed, and space dust streams past at that speed, so the shared motion stays visible.
  Drop-out on arrival also flashes. Pressing `F` while charging cancels.
- **Sound:** fully procedural (WebAudio). You hear an engine rumble and thrust hiss, a boost roar, a charge
  whine, jump and drop whooshes, discovery chimes and a quiet ambient drone. `M` mutes.
- **Sense of speed:** space-dust streaks in normal flight, and the field of view widens with boost and
  Supercruise.

### Fly to the surface (real satellite data for Earth and the Moon)

- **Flight near surfaces:** top speed is tied to altitude: about 120 m/s at 1 km, 1.2 km/s at 10 km, and a
  30 m/s minimum. Boost is ×4 near the ground. Arriving faster than the limit bleeds off through drag within a
  second or two, and letting go of the controls brakes to a full stop. Below about 4 % of the body's radius the
  controls blend into plane-like flight: yaw turns around the local vertical and the wings level themselves
  (roll with Q/E still works), with strafe and up/down unchanged.
- **Landing:** fly down into the atmosphere and land anywhere on a rocky world. A compute shader probes the
  exact terrain height under the ship every frame. The view always stays a clearance above the ground: 25 m,
  plus more when you're fast. A soft cushion limits your descent rate as you get close, so you settle gently
  instead of crashing or clipping through. Boost is capped near the ground. Near a solid body the ship
  co-rotates with it, so the ground doesn't slide under you.
- **Atmospheric entry:** dive into an atmosphere fast and you get a plasma sheath. Flames stream around the
  screen edges, with heat-haze refraction, buffeting camera shake and a re-entry roar. Banners announce
  entering and leaving the atmosphere, approaching an airless surface, and touching down (with a jolt and a
  thump).
- **Flight HUD:** near a surface the HUD switches to an artificial horizon with a pitch ladder (dashed below
  the horizon). Large ALT, V/S, SPD and PITCH readouts flank the reticle. Orbit lines and labels of bodies
  hidden behind the planet are removed.
- **Real maps:** as you approach Earth or the Moon, real map tiles stream in and replace the procedural
  surface. Higher-resolution tiles load as you descend.
  - Earth imagery: [Sentinel-2 cloudless](https://s2maps.eu) by EOX IT Services GmbH (contains modified
    Copernicus Sentinel data 2023, CC BY-NC-SA 4.0). It's a cloud-free 10 m/px global mosaic, streamed up to
    zoom 13, so cities, rivers, fields and coastlines are visible from low altitude.
  - Earth elevation: [AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) (Mapzen Terrarium,
    up to zoom 12). Real mountains are shown with 2.5× vertical relief, and real coastlines drive the ocean
    glint.
  - Moon imagery: [NASA Moon Trek](https://trek.nasa.gov/moon/) LRO WAC global mosaic (up to zoom 8).
  - Procedural micro-detail is blended in where the imagery runs out of resolution.
  - Real mountains use 3.5× relative relief.
  - Credits are shown in the HUD whenever the imagery is visible.
- **Offline:** everything else stays procedural, and if the tile servers can't be reached (offline, or the
  single-file build without network) the generated surface is used instead.
- **API:** `api.flyTo('earth', lat, lon, altitudeMetres, pitchDeg)` jumps to a real place, e.g.
  `flyTo('earth', 45.8, 6.9, 9000, -12)` for Mont Blanc.

### Landmarks and search

- **Landmarks:** about 190 named places are built in (`PLACES` in `SpaceRoam.jsx`). On Earth: European capitals
  and each country's largest cities, major world cities, famous peaks, oceans and seas. On the Moon: the Apollo
  sites, major craters and maria. On Mars: Olympus Mons, Valles Marineris and the rover sites. Labels fade in by
  importance as you descend, are hidden behind the horizon, and never overlap.
- **Search:** the **FIND** button (or `/`) opens a search box over all places and bodies. **GO** on a place
  starts the autopilot. It supercruises to the planet if needed, then flies a guided descent to a viewpoint
  beside the place, looking at it. Any thrust input takes back control.
- **Mars imagery:** Mars now streams NASA/USGS Viking MDIM 2.1 colour mosaic tiles (Mars Trek, up to zoom 7).

### Stars and warp

- **Real stars:** about 30 real stars (Proxima and Alpha Centauri, Sirius, Vega, TRAPPIST-1, Betelgeuse, Rigel,
  Deneb and others) sit in the sky at their true directions, computed from RA/Dec and distance. They show as soft
  coloured glows, with their name and distance near the crosshair. Their positions shift with parallax once you
  leave Sol.
- **Warp:** tap a star (or find it in **FIND**) and press **WARP**. The trip takes about 13 s whatever the
  distance:
  1. **Spool:** the ship turns to the star. The sky aberrates, blueshifting ahead and redshifting behind, and
     stars start to stretch.
  2. **Jump:** the stars become long streaks rushing past as the field of view widens, then they flash into a
     swirling, flowing tunnel of light. The ship shakes and a deep roar plays, with a light-year countdown.
  3. **Exit:** the tunnel collapses and the streaks retract to points as you glide in to a planet.
- **Destinations:** stars with confirmed planets use those real planets (Proxima b/d, TRAPPIST-1 b-h, Ross 128 b,
  Gliese 581, Epsilon Eridani b, 51 Pegasi b, Kepler-452 b). Other systems are generated from the star's name, so
  they're the same on every visit. Warp to **Sol** to go home.

### Real sky (accuracy)

- **Planets:** positions come from NASA/JPL's "Approximate Positions of the Planets" orbital elements, for
  today's date: the real ellipse shape, tilt and position along each orbit. The direction from the Sun is exact,
  and only the distance is compressed (by the system's `au()` law, as before). Orbit lines show the real
  ellipses.
- **Clock:** time starts at the real current date. ☰ → **Orbits** switches between *fast* (1 game second =
  6 hours) and *real time*. In real time, Earth's real axis tilt and sidereal rotation make the day/night line
  match reality, and the Moon shows its real phase. Checked: Earth at heliocentric longitude 54° and the
  subsolar point at -18.8°, -72° on 16 Nov 2026 16:31 UTC.
- **Galaxies:** the galaxy frame is tied to the solar system with the standard galactic-to-equatorial
  rotation. The Milky Way band in the sky follows the real galactic plane, galaxies appear in their true sky
  directions, and Andromeda, Triangulum and the Magellanic Clouds have their real position angles and
  inclinations.

### Moon and Mars relief, real size ratios

- **Moon and Mars relief:** heights come from NASA Trek's colour-shaded laser altimetry: LRO LOLA for the Moon
  (to zoom 5) and MGS MOLA for Mars (to zoom 6). The colour ramp (blue low, then cyan, green and yellow, up to
  red or white high) is decoded back into height in the shader, and shadowed or grey pixels are skipped. Relief
  is shown at 1.5× on top of the photo mosaics, so Tycho, Theophilus, Olympus Mons and Valles Marineris are real
  3D terrain for landing, collision and the horizon march.
- **Collision:** the ground probe now samples the finest available map tiles, the same terrain that is drawn.
- **Size ratios:** planet, moon and star radii now use real ratios (Jupiter 11× Earth, Sun 109×), while orbit
  distances stay compressed. Generated star systems follow the same rule.

### Galaxy view and intergalactic jumps

- **GALAXY** (in the system map) flies the camera out from your star to the whole Milky
  Way, then further to the Local Group: the Large and Small Magellanic Clouds, Andromeda and Triangulum.
  They sit at their real positions (galactic l/b + distance) and sizes. The Sun sits 26,000 ly from the centre.
- **Rendering:** each galaxy is a procedural thin disk plus bulge: log-spiral arms, dust lanes, pink
  star-forming knots, or clumpy irregulars for the Magellanic Clouds. The camera orbits each galaxy relative to
  its own disk, and from your ship the other galaxies show as faint smudges in the sky.
- **Interaction:** drag to rotate, and pinch, scroll or use − / + to zoom. Zoom in on the Sun to see and pick the
  nearby catalogue stars. Tap a galaxy for **JUMP** (a longer, 20 s warp to a generated star system inside it) or
  **ZOOM IN**. Warp to **Sol** to come home.

### System map (3D)

The **MAP** button (or `N`) flies the real camera out of the ship to an orbiting view high above the system, then
back in when you close it. The flight follows an exponential-distance path, so it feels like one continuous zoom
across scales. Everything stays live and rendered: orbits are drawn brightly, and planets get coloured markers
and labels. Overlapping labels are hidden until you zoom in, and your ship shows as an arrow along its heading.
Drag to rotate, and pinch or scroll to zoom. Tap a body for its card: **CRUISE HERE** closes the map, locks the
target and starts supercruise. **TARGET** just selects it. **MOONS** flies the camera over to that planet's own
system, for example Saturn with its rings, Titan and Cassini Hub. Ship controls are paused while the map is out.

### Touch (phones / tablets)

Play in landscape; the **FULL** button hides the browser bars.

- **Left side:** a floating thumbstick appears wherever your thumb lands. Up/down is forward/reverse thrust,
  left/right is strafe, and throttle is analog.
- **Right side:** drag anywhere to pitch and yaw.
- **Targeting:** tap any planet, moon or label to select it, or tap the **TARGET** chip (top right) for a list
  of every body, grouped by planet, with distances. The selected target gets a lock-on animation and a chime.
- **Buttons:** icon buttons by your right thumb: CRUISE (it changes to STOP / CANCEL, and is dimmed when you're too
  close), BOOST, UP and DOWN (hold). ROLL buttons sit at the bottom centre. Sound, camera, fullscreen, controls help,
  stats, star system and benchmark live in the ☰ menu.
- **Resolution:** touch devices render at one pixel per CSS pixel and use a lighter quality preset (fewer
  atmosphere samples, cloud octaves and terrain-march octaves). On every device, **adaptive resolution**
  lowers the render scale down to 50 % when frames get slower than about 40 fps, and raises it again when
  there's headroom. A fixed `<SpaceRoam renderScale={…} />` turns adaptation off.
- **Browser support:** WebGPU is needed: Chrome on Android 12+, or Safari on iOS/iPadOS 26+.

## Architecture

**Precision (no jitter from 1 m to 26 Gm).** All positions are simulated in Float64 on the CPU. Each frame,
every object's position is taken relative to the camera in f64, then converted to f32 for upload, so the GPU
never sees large absolute coordinates. Spheres are ray-traced in the fragment shader rather than tessellated.
The CPU also sends each body's camera altitude (`|c| − R`) computed in f64. The shader uses it in the stable
quadratic form `t = (alt·(d+R)) / (−b + √disc)`, so a surface 1 m away doesn't suffer cancellation. Depth is
**reversed-Z with an infinite far plane** (`depth32float`, clear 0, compare `greater`), and ray-traced hits
write `frag_depth = near / viewZ`. The ship is stored relative to a reference body (sphere-of-influence frame
switching), so hovering above a planet that orbits at tens of Mm/s stays perfectly stable.

**6DoF.** The ship's orientation is a quaternion, integrated from a smoothed local angular-velocity vector
(`q ← q · Δq(ω·dt)`). The camera basis, supercruise alignment (`slerp` to a look-rotation) and the benchmark
camera are all quaternions. No Euler angles exist anywhere, so there is no gimbal lock.

**Data-driven star systems.** `registerStarSystem({ id, name, scale, star, spawn, bodies[] })`. Body types are
`planet | moon | station | belt | comet`. The `surface`, `atmosphere` and `rings` blocks are pure uniform data.
`switchStarSystem(id)` is available on the engine API and also runs when the `systemId` prop changes. It
recompiles the registry entry and rewrites the static uniform blocks without recreating any GPU resources. The
second system, `kestrel`, is a working example of a V2 system.

**One spherical-body uber-shader** (`vsB`/`fsB`) renders every star, planet and moon from 16 `vec4`s per body:
- Solid bodies: fbm terrain with analytic-derivative value noise and bump normals, cellular craters,
  oceans, polar caps, ridged cracks (Europa) and volcanic blotches with emission (Io).
- Close to the ground, a heightfield raymarch gives real mountain and crater silhouettes on the horizon.
- Gas giants: bands with differential rotation and turbulence, plus an elliptical swirling storm (Great Red
  Spot, Neptune's dark spot).
- Stars: granulation, sunspots, limb darkening, and a volumetric (ray-integrated) corona with streamers.
- Single-scattering Rayleigh and Mie atmosphere (12×4 samples) with sunlight transmittance onto the
  ground, which gives reddened terminators, rim halos and blue/butterscotch/orange skies from per-body
  coefficients.
- A cloud shell with cast shadows, a night side with city lights, and a GGX ocean glint whose roughness
  depends on pixel footprint.
- Rings use ray–plane intersection. The planet shadows the rings, the rings shadow the planet, and the
  unlit side is back-lit.
- Pixel-footprint LOD throughout: octave counts follow the pixel footprint, silhouettes are analytically
  antialiased, and sub-pixel bodies render as dots.

**One SDF uber-shader** (`vsS`/`fsS`) raymarches instanced bounding boxes: rotating torus stations with
spokes, hub, solar arrays, lit windows, blinking nav lights and soft self-shadows; noise-displaced tumbling
asteroids; the comet nucleus; and the player ship. Sub-pixel asteroids fall back to an impostor dot. The comet
tail is the same instanced-box framework with an additive volumetric entry point (`fsT`).

The asteroid belt has two layers:
- 2,000 orbiting asteroids whose elements are kept in f64 and positioned on the CPU each frame.
- A procedural cell-grid field of up to about 1,800 rocks that appears around you inside the belt.

**UI overlay.** The buttons, the target chip and list, the ☰ menu and the controls help are a small React/DOM
layer over the canvas. It polls the engine about 5 times a second, so it never touches the render loop. The 3D
HUD stays in WebGPU.

**Post and HUD.** A spiral-tap bloom, a depth-occlusion-tested analytic sun glare, warp streaks, the re-entry
plasma and ACES tone mapping. The HUD is drawn with WebGPU from instanced antialiased line segments, filled or
outlined circles, and glyphs from an atlas rasterised once at startup from the system monospace font. Glyphs
get a dark outline in the shader so text stays readable over bright planets. It scales from the CSS size of the
screen, so it's readable on phones and on 4K screens. It shows a telemetry panel, target brackets, off-screen
arrows, distance, closing velocity, orbit paths, banners and the surface flight HUD.

**Per-frame allocations.** All CPU mirrors (`Float32Array` for globals, bodies, instances and HUD, plus the
f64 state) and all GPU buffers are preallocated. Pass descriptors and the submit array are reused. Numbers are
formatted into a `Uint8Array` with no string building. The only per-frame objects are the ones the WebGPU API
itself returns: the command encoder, pass encoders, command buffer and swapchain view. Separately, the HUD's
GPU-time readback (`mapAsync`) runs about twice a second.

## Benchmark

Press `B` (or call `api.startBenchmark()`). It flies a scripted 60 s tour:
1. Earth: approach to a 140 km limb pass.
2. Sun: corona close pass.
3. Saturn: skimming about 0.02 R above the ring plane.
4. Gateway Station: orbit.

Every frame's GPU time is recorded with `timestamp-query`, written to a per-frame slot of a preallocated
resolve buffer and read back once at the end, alongside the CPU frame interval. Results are printed with
`console.table` and shown in the HUD:

```
frames, cpuAvg, cpuP99, gpuAvg, gpuP50, gpuP99, gpuMax, resolution
```

In Chrome, enable `chrome://flags/#enable-webgpu-developer-features` if timestamp queries are unavailable.

## Size

`npm run size` minifies with esbuild (React external) and strips WGSL comments and whitespace. The minified
build was run end to end, including the full benchmark.

| | |
| --- | --- |
| Source `SpaceRoam.jsx` | 118.2 KB |
| Minified | **89.5 KB** |
| Minified + gzip | **36.7 KB** |
| Minified + brotli | 32.5 KB |
| …of which WGSL (all shaders) | 25.5 KB |

## Verification status

- **Tested here:** headless Chromium with SwiftShader (a software WebGPU renderer). That covers:
  - Every shader compiles with zero validation errors, in both the source and minified builds.
  - Visual checks of each body type, the rings, the corona, the station, the ship, the comet and the
    Kestrel system switch.
  - The full 60 s benchmark ran and produced its report.
- **Not measured: the 11 ms GPU target.** No RTX-class GPU was available, so it needs a run of `B` on the
  target machine. SwiftShader's timings are about 100× slower and are not meaningful. Octave counts in the
  heightfield march (7), clouds (11) and asteroids (7) are capped to stay inside the budget.
- **Testing hook:** `?headless` in the dev harness renders to an offscreen texture instead of the canvas,
  because this container's headless browser drops devices that present to a canvas. `api.capture()` returns
  a PNG of the next frame.

## Known limitations

- Earth imagery tops out at Sentinel-2's 10 m/px, so individual buildings aren't visible.
- Earth and the Moon use the game's reduced scale, so real places appear about 5× smaller than life.
- Real maps need network access; the single file falls back to the procedural surface offline.
- GPU cost near the surface (map lookups + heightfield march) is not yet measured on the target hardware.
- No moon-on-planet eclipses.
- Distant belt asteroids orbit far slower than Kepler speeds, so they stay approachable.

## Roadmap / reminders

- **Date & time control.** A settable clock (date + time picker, plus speed: pause / real time / fast /
  reverse) that drives the JPL planet positions, the Moon's phase and Earth's rotation, so you can see the
  sky on any date, e.g. a past eclipse or a planetary alignment. The engine already derives everything from
  one Julian date (`jd0` + `simT` × `TS`), so this is mostly UI.
- **Add more star systems.** The galaxy view feels empty with only ~30 catalogue stars. Add many more real stars
  (e.g. a few hundred of the brightest/nearest from the HYG catalogue) and a seeded field of procedural stars
  across the Milky Way's arms, so you can pick and warp to points anywhere in the galaxy.
- Proper 3D cities (buildings as their own geometry with roofs and window facades).

