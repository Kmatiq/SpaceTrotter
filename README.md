# SpaceRoam

A real-time, fully procedural Solar System flight sim in the browser. It's one self-contained React component
(`src/SpaceRoam.jsx`) with a pure-WebGPU engine. It uses no 3D or physics libraries and loads no texture,
model or audio files.

**Play in the browser:** https://kmatiq.github.io/spaceroam/ (desktop Chrome, deployed from `main` by `.github/workflows/pages.yml`)

**Share as one file:** download https://kmatiq.github.io/spaceroam/spaceroam.html (or run `npm run single`). That one ~223 KB HTML file contains everything: send it to anyone and they double-click it. They need desktop Chrome or Edge, or another browser with WebGPU.

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
| `Tab` / `Shift+Tab` | cycle target |
| `F` | Supercruise to target: auto-aligns, accelerates exponentially, decelerates automatically, drops out on arrival. `F` or `S` cancels |
| `V` | third-person view (raymarched ship) |
| `B` | 60 s benchmark |
| `J` | switch star system (Sol ↔ Kestrel V2 demo) |
| `[` / `]` | exposure |
| `G` | performance stats (CPU/GPU ms) |
| `H` | hide help |

### Gameplay

- **Exploration log:** fly close to a planet, moon, station or comet to discover it. You get a toast with a
  fun fact and the log count. Uncharted bodies have amber markers. Progress is saved per system in your
  browser (localStorage).
- **Supercruise:** `F` charges for 1.2 s (the ship auto-aligns to the target), then jumps with a flash.
  Drop-out on arrival also flashes. Pressing `F` while charging cancels.
- **Sound:** fully procedural (WebAudio). You hear an engine rumble and thrust hiss, a boost roar, a charge
  whine, jump and drop whooshes, discovery chimes and a quiet ambient drone. `M` mutes.
- **Sense of speed:** space-dust streaks in normal flight, and the field of view widens with boost and
  Supercruise.

### Fly to the surface (real satellite data for Earth and the Moon)

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
  - Earth imagery: [NASA GIBS](https://earthdata.nasa.gov/gibs) Blue Marble Next Generation (Web-Mercator,
    up to zoom 8).
  - Earth elevation: [AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) (Mapzen Terrarium,
    up to zoom 10). Real mountains are shown with 2.5× vertical relief, and real coastlines drive the ocean
    glint.
  - Moon imagery: [NASA Moon Trek](https://trek.nasa.gov/moon/) LRO WAC global mosaic (up to zoom 8).
  - Procedural micro-detail is blended in where the imagery runs out of resolution.
  - Credits are shown in the HUD whenever the imagery is visible.
- **Offline:** everything else stays procedural, and if the tile servers can't be reached (offline, or the
  single-file build without network) the generated surface is used instead.
- **API:** `api.flyTo('earth', lat, lon, altitudeMetres, pitchDeg)` jumps to a real place, e.g.
  `flyTo('earth', 45.8, 6.9, 9000, -12)` for Mont Blanc.

### Touch (phones / tablets)

Play in landscape; the **FULL** button hides the browser bars.

- **Left side:** a floating thumbstick appears wherever your thumb lands. Up/down is forward/reverse thrust,
  left/right is strafe, and throttle is analog.
- **Right side:** drag anywhere to pitch and yaw.
- **Buttons:** CRUISE (Supercruise), BOOST (hold), UP/DOWN (hold), ROLL< / ROLL> (hold), <TGT / TGT> (cycle
  target), CAM (third person), FULL (fullscreen), SND (mute).
- **Resolution:** touch devices render at one pixel per CSS pixel to keep frame rates playable. Override it
  with `<SpaceRoam renderScale={…} />`.
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
| Minified | **80.2 KB** |
| Minified + gzip | **33.3 KB** |
| Minified + brotli | 29.5 KB |
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

- Earth imagery (Blue Marble, ~500 m/px) gets soft below about 2 km altitude; the Moon mosaic holds up better.
- Earth and the Moon use the game's reduced scale, so real places appear about 5× smaller than life.
- Real maps need network access; the single file falls back to the procedural surface offline.
- GPU cost near the surface (map lookups + heightfield march) is not yet measured on the target hardware.
- No moon-on-planet eclipses.
- Distant belt asteroids orbit far slower than Kepler speeds, so they stay approachable.
