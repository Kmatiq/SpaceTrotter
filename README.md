# SpaceRoam

A real-time, fully procedural Solar System flight sim in the browser. It's one self-contained React component
(`src/SpaceRoam.jsx`) with a pure-WebGPU engine. It uses no 3D or physics libraries and loads no texture,
model or audio files.

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
| `H` | hide help |

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

**Post and HUD.** A spiral-tap bloom, a depth-occlusion-tested analytic sun glare, warp streaks and ACES tone
mapping. The HUD is drawn with WebGPU: instanced antialiased line segments, and glyphs from an atlas rasterised
once at startup from the system monospace font. It shows target brackets, off-screen arrows, distance,
closing velocity, orbit paths and telemetry.

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

See the `npm run size` output (minified with esbuild, React external, WGSL comments and whitespace stripped).
