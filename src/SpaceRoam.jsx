// SpaceRoam — real-time procedural Solar System flight sim. Pure WebGPU, single React component.
// Floating origin (f64 CPU → camera-relative f32 GPU), reversed-Z infinite depth, quaternion 6DoF,
// one spherical-body uber-shader + one SDF uber-shader, zero per-frame JS allocations in engine code.
import { useEffect, useRef, useState } from 'react';

/* ============================== STAR SYSTEM REGISTRY ============================== */
// Declarative schema: { id, name, scale, star, spawn, bodies[] }.  Body types: planet | moon | station | belt | comet.
// radius: Earth radii (mapped through scale.radius*r^radiusExp); orbit.au (mapped au*au^auExp) or orbit.pr (parent radii).
// surface/atmosphere/rings are pure uniform data consumed by the uber-shader — no per-body shader code exists.
export const STAR_SYSTEMS = {};
export const registerStarSystem = (def) => (STAR_SYSTEMS[def.id] = def);

registerStarSystem({
  id: 'sol', name: 'Sol',
  scale: { radius: 1.2e6, radiusExp: 0.75, au: 4e9, auExp: 0.55, lightRef: 4e9, lightExp: 0.5 },
  star: { id: 'sun', name: 'Sun', radius: 109, color: [1, 0.85, 0.66], intensity: 40, corona: 1 },
  spawn: { near: 'earth', dist: 3.2 },
  bodies: [
    { id: 'mercury', name: 'Mercury', type: 'planet', radius: 0.383, orbit: { au: 0.39, period: 700, inc: 7, phase: 1.1 }, spin: { period: 900, tilt: 0.03 },
      surface: { c: [[0.45, 0.42, 0.39], [0.3, 0.29, 0.28], 0, 0, 0], scale: 2.2, height: 0.003, craters: 0.6, craterScale: 9, mix: 0.7, seed: 3 } },
    { id: 'venus', name: 'Venus', type: 'planet', radius: 0.95, orbit: { au: 0.72, period: 1100, inc: 3.4, phase: 2.6 }, spin: { period: -2000, tilt: 177 },
      surface: { gas: 1, c: [[0.9, 0.78, 0.52], [0.72, 0.6, 0.38], 0, [0.95, 0.9, 0.75], 0], bands: { amt: 0.35, freq: 7, turb: 4, speed: 0.004 } },
      atmosphere: { height: 0.05, rayleigh: [0.25, 0.2, 0.1], mie: 0.35, g: 0.7 } },
    { id: 'earth', name: 'Earth', type: 'planet', radius: 1, orbit: { au: 1, period: 1500, phase: 0.4 }, spin: { period: 600, tilt: 23.4 },
      surface: { c: [[0.07, 0.15, 0.04], [0.33, 0.26, 0.15], [0.004, 0.025, 0.08], [0.85, 0.88, 0.93], 0], ocean: 0.03, scale: 1.7, height: 0.006, mix: 0.9, caps: 0.86, lights: 1, specular: 1, seed: 7 },
      atmosphere: { height: 0.025, rayleigh: [0.058, 0.135, 0.33], mie: 0.025, g: 0.8, clouds: 0.55, cloudHeight: 0.0035, cloudSpeed: 0.02 } },
    { id: 'luna', name: 'Luna', type: 'moon', parent: 'earth', radius: 0.273, orbit: { pr: 14, period: 400, inc: 5, phase: 2 }, spin: { period: 400, tilt: 1.5 },
      surface: { c: [[0.44, 0.43, 0.42], [0.17, 0.17, 0.18], 0, 0, 0], scale: 1.6, height: 0.003, craters: 0.55, craterScale: 8, mix: 1.8, seed: 11 } },
    { id: 'gateway', name: 'Gateway Station', type: 'station', parent: 'earth', size: 1500, orbit: { pr: 1.45, period: 900, inc: 12, phase: 0.2 } },
    { id: 'mars', name: 'Mars', type: 'planet', radius: 0.532, orbit: { au: 1.52, period: 2100, inc: 1.8, phase: 4.1 }, spin: { period: 620, tilt: 25 },
      surface: { c: [[0.46, 0.18, 0.07], [0.24, 0.11, 0.06], 0, [0.92, 0.9, 0.86], 0], scale: 2, height: 0.007, craters: 0.35, craterScale: 7, mix: 1.1, caps: 0.9, seed: 5 },
      atmosphere: { height: 0.018, rayleigh: [0.05, 0.03, 0.018], mie: 0.04, g: 0.65 } },
    { id: 'ares', name: 'Ares Ring', type: 'station', parent: 'mars', size: 1200, orbit: { pr: 1.6, period: 800, inc: 25, phase: 3 } },
    { id: 'belt', type: 'belt', inner: 2.2, outer: 3.3, count: 2000, thickness: 0.035, color: [0.36, 0.32, 0.28] },
    { id: 'jupiter', name: 'Jupiter', type: 'planet', radius: 11.2, orbit: { au: 5.2, period: 4200, inc: 1.3, phase: 5.3 }, spin: { period: 260, tilt: 3.1 },
      surface: { gas: 1, c: [[0.82, 0.72, 0.57], [0.52, 0.33, 0.2], 0, [0.93, 0.88, 0.78], [0.72, 0.27, 0.13]], bands: { amt: 1, freq: 19, turb: 2.4, speed: 0.01 }, spot: { lat: -22, lon: 40, size: 0.13, amt: 1 } },
      atmosphere: { height: 0.012, rayleigh: [0.03, 0.05, 0.09], mie: 0.02, g: 0.7 } },
    { id: 'io', name: 'Io', type: 'moon', parent: 'jupiter', radius: 0.286, orbit: { pr: 4.2, period: 300, phase: 1 }, spin: { period: 300 },
      surface: { c: [[0.86, 0.78, 0.36], [0.78, 0.55, 0.24], 0, 0, [0.22, 0.1, 0.04]], scale: 2, height: 0.002, accent: -1, mix: 0.8, seed: 2 } },
    { id: 'europa', name: 'Europa', type: 'moon', parent: 'jupiter', radius: 0.245, orbit: { pr: 6.2, period: 480, phase: 3.3 }, spin: { period: 480 },
      surface: { c: [[0.84, 0.8, 0.72], [0.7, 0.62, 0.5], 0, 0, [0.42, 0.22, 0.1]], scale: 1.5, height: 0.0008, accent: 0.9, craters: 0.05, craterScale: 6, mix: 0.6, seed: 9 } },
    { id: 'ganymede', name: 'Ganymede', type: 'moon', parent: 'jupiter', radius: 0.413, orbit: { pr: 9, period: 760, phase: 5 }, spin: { period: 760 },
      surface: { c: [[0.52, 0.48, 0.43], [0.3, 0.27, 0.24], 0, 0, [0.62, 0.6, 0.57]], scale: 1.8, height: 0.002, accent: 0.4, craters: 0.4, craterScale: 8, mix: 1.2, seed: 13 } },
    { id: 'jovian', name: 'Jovian Relay', type: 'station', parent: 'jupiter', size: 1800, orbit: { pr: 2.2, period: 900, inc: 8, phase: 4 } },
    { id: 'saturn', name: 'Saturn', type: 'planet', radius: 9.45, orbit: { au: 9.5, period: 6000, inc: 2.5, phase: 0.9 }, spin: { period: 280, tilt: 26.7 },
      surface: { gas: 1, c: [[0.86, 0.77, 0.56], [0.68, 0.56, 0.36], 0, [0.92, 0.86, 0.68], 0], bands: { amt: 0.6, freq: 24, turb: 1.3, speed: 0.008 } },
      atmosphere: { height: 0.012, rayleigh: [0.04, 0.05, 0.07], mie: 0.03, g: 0.7 },
      rings: { inner: 1.24, outer: 2.27, opacity: 0.95, color: [0.86, 0.79, 0.66] } },
    { id: 'titan', name: 'Titan', type: 'moon', parent: 'saturn', radius: 0.404, orbit: { pr: 9.5, period: 900, inc: 0.3, phase: 2.2 }, spin: { period: 900 },
      surface: { c: [[0.5, 0.36, 0.16], [0.36, 0.26, 0.12], 0, 0, 0], scale: 1.5, height: 0.002, mix: 1, seed: 4 },
      atmosphere: { height: 0.12, rayleigh: [0.3, 0.17, 0.06], mie: 0.6, g: 0.72 } },
    { id: 'cassini', name: 'Cassini Hub', type: 'station', parent: 'saturn', size: 2000, orbit: { pr: 2.9, period: 1200, inc: 26.7, phase: 1.5 } },
    { id: 'uranus', name: 'Uranus', type: 'planet', radius: 4.0, orbit: { au: 19.2, period: 8000, inc: 0.8, phase: 3.7 }, spin: { period: -340, tilt: 97.8 },
      surface: { gas: 1, c: [[0.6, 0.84, 0.88], [0.52, 0.77, 0.83], 0, [0.7, 0.9, 0.92], 0], bands: { amt: 0.12, freq: 14, turb: 0.8, speed: 0.006 } },
      atmosphere: { height: 0.03, rayleigh: [0.02, 0.05, 0.06], mie: 0.01, g: 0.7 },
      rings: { inner: 1.65, outer: 2.0, opacity: 0.22, color: [0.6, 0.6, 0.62] } },
    { id: 'neptune', name: 'Neptune', type: 'planet', radius: 3.88, orbit: { au: 30, period: 10000, inc: 1.8, phase: 5.9 }, spin: { period: 320, tilt: 28 },
      surface: { gas: 1, c: [[0.26, 0.44, 0.88], [0.18, 0.32, 0.76], 0, [0.6, 0.75, 0.95], [0.08, 0.13, 0.38]], bands: { amt: 0.35, freq: 12, turb: 1.5, speed: 0.012 }, spot: { lat: -20, lon: 120, size: 0.09, amt: 0.9 } },
      atmosphere: { height: 0.03, rayleigh: [0.02, 0.05, 0.1], mie: 0.01, g: 0.7 } },
    { id: 'triton', name: 'Triton', type: 'moon', parent: 'neptune', radius: 0.212, orbit: { pr: 8, period: 600, inc: 157, phase: 1 }, spin: { period: 600 },
      surface: { c: [[0.76, 0.72, 0.69], [0.62, 0.5, 0.45], 0, [0.85, 0.8, 0.78], 0], scale: 1.8, height: 0.0015, craters: 0.15, craterScale: 7, caps: 0.6, mix: 1, seed: 21 } },
    { id: 'vesper', name: 'Comet Vesper', type: 'comet', size: 4000, orbit: { au: 9, ecc: 0.86, period: 1400, inc: 18, node: 40, phase: 5.8 } },
  ],
});

// A second, fictional system proves the data-driven path for V2 (press J in-game).
registerStarSystem({
  id: 'kestrel', name: 'Kestrel (V2 demo)',
  scale: { radius: 1.2e6, radiusExp: 0.75, au: 4e9, auExp: 0.55, lightRef: 2.5e9, lightExp: 0.5 },
  star: { id: 'kestrel-a', name: 'Kestrel A', radius: 60, color: [1, 0.55, 0.32], intensity: 30, corona: 1.4 },
  spawn: { near: 'kestrel-c', dist: 3.5 },
  bodies: [
    { id: 'kestrel-b', name: 'Kestrel b', type: 'planet', radius: 0.7, orbit: { au: 0.3, period: 500, phase: 1 }, spin: { period: 500, tilt: 2 },
      surface: { c: [[0.12, 0.1, 0.09], [0.05, 0.04, 0.04], 0, 0, [0.6, 0.12, 0.02]], scale: 2.4, height: 0.004, accent: -1.5, craters: 0.3, craterScale: 6, mix: 1, seed: 31 } },
    { id: 'kestrel-c', name: 'Kestrel c', type: 'planet', radius: 1.3, orbit: { au: 0.8, period: 1200, phase: 2 }, spin: { period: 500, tilt: 12 },
      surface: { c: [[0.12, 0.2, 0.08], [0.5, 0.45, 0.4], [0.01, 0.05, 0.07], [0.9, 0.92, 0.95], 0], ocean: 0.25, scale: 2.5, height: 0.005, mix: 0.6, caps: 0.8, specular: 1, seed: 17 },
      atmosphere: { height: 0.03, rayleigh: [0.1, 0.12, 0.2], mie: 0.04, g: 0.8, clouds: 0.7, cloudHeight: 0.004, cloudSpeed: 0.03 } },
    { id: 'kestrel-port', name: 'Kestrel Port', type: 'station', parent: 'kestrel-c', size: 1600, orbit: { pr: 1.5, period: 900 } },
    { id: 'kestrel-d', name: 'Kestrel d', type: 'planet', radius: 8, orbit: { au: 3, period: 3000, phase: 4 }, spin: { period: 300, tilt: 15 },
      surface: { gas: 1, c: [[0.75, 0.55, 0.62], [0.42, 0.3, 0.45], 0, [0.9, 0.8, 0.85], [0.95, 0.85, 0.5]], bands: { amt: 0.9, freq: 15, turb: 3, speed: 0.01 }, spot: { lat: 30, lon: 0, size: 0.1, amt: 0.8 } },
      atmosphere: { height: 0.015, rayleigh: [0.05, 0.04, 0.08], mie: 0.02, g: 0.7 },
      rings: { inner: 1.4, outer: 2.6, opacity: 0.7, color: [0.7, 0.75, 0.85] } },
  ],
});

/* ============================== WGSL (single module, all entry points) ============================== */
const WGSL = /*wgsl*/`
struct G{vp:mat4x4f,rt:vec4f,up:vec4f,fw:vec4f,res:vec4f,sun:vec4f,sc:vec4f,mi:vec4f,ss:vec4f,wp:vec4f};
struct Body{d:array<vec4f,16>};
struct Inst{a:vec4f,q:vec4f,b:vec4f};
struct Hud{a:vec4f,c:vec4f,b:vec4f};
@group(0)@binding(0) var<uniform> g:G;
@group(0)@binding(1) var<storage,read> BD:array<Body>;
@group(0)@binding(2) var<storage,read> IN:array<Inst>;
@group(0)@binding(3) var<storage,read> HD:array<Hud>;
@group(0)@binding(4) var atl:texture_2d<f32>;
@group(0)@binding(5) var smp:sampler;
@group(1)@binding(0) var scn:texture_2d<f32>;
@group(1)@binding(1) var dep:texture_depth_2d;
const PI=3.14159265;
// ---------- shared math ----------
fn qr(q:vec4f,v:vec3f)->vec3f{let t=2.*cross(q.xyz,v);return v+q.w*t+cross(q.xyz,t);}
fn qc(q:vec4f)->vec4f{return vec4f(-q.xyz,q.w);}
fn ry(v:vec3f,a:f32)->vec3f{let c=cos(a);let s=sin(a);return vec3f(c*v.x-s*v.z,v.y,s*v.x+c*v.z);}
fn ray(f:vec2f)->vec3f{let n=vec2f(f.x*g.res.z*2.-1.,1.-f.y*g.res.w*2.);return normalize(g.fw.xyz+n.x*g.rt.w*g.rt.xyz+n.y*g.up.w*g.up.xyz);}
fn zdep(t:f32,rd:vec3f)->f32{return clamp(g.fw.w/max(t*dot(rd,g.fw.xyz),1e-30),0.,1.);}// reversed-Z, infinite far
fn isph(o:vec3f,d:vec3f,r:f32)->vec2f{let b=dot(o,d);let c=dot(o,o)-r*r;let h=b*b-c;if(h<0.){return vec2f(1e30,-1e30);}let s=sqrt(h);return vec2f(-b-s,-b+s);}
fn cube(v:u32)->vec3f{let f=v/6u;let a=f>>1u;let s=select(1.,-1.,(f&1u)==1u);var U=array(vec2f(-1,-1),vec2f(1,-1),vec2f(1,1),vec2f(-1,-1),vec2f(1,1),vec2f(-1,1));let u=U[v%6u];var p=vec3f(0.);p[a]=s;p[(a+1u)%3u]=u.x*s;p[(a+2u)%3u]=u.y;return p;}
fn vsq(v:u32)->vec4f{let p=vec2f(f32((v<<1u)&2u),f32(v&2u))*2.-1.;return vec4f(p,0.,1.);}
// ---------- noise (value noise with analytic derivatives) ----------
fn hu(p:vec3i)->u32{let h=bitcast<vec3u>(p)*vec3u(1597334673u,3812015801u,2798796415u);var n=(h.x^h.y^h.z)*1597334677u;n^=n>>16u;n*=2246822519u;n^=n>>13u;n*=3266489917u;n^=n>>16u;return n;}
fn hf(p:vec3i)->f32{return f32(hu(p)>>8u)*(1./16777216.);}
fn vn(x:vec3f)->vec4f{let l=floor(x);let i=vec3i(l);let f=x-l;
 let u=f*f*f*(f*(f*6.-15.)+10.);let du=30.*f*f*(f*(f-2.)+1.);
 let a=hf(i);let b=hf(i+vec3i(1,0,0));let c=hf(i+vec3i(0,1,0));let d=hf(i+vec3i(1,1,0));
 let e=hf(i+vec3i(0,0,1));let o=hf(i+vec3i(1,0,1));let m=hf(i+vec3i(0,1,1));let h=hf(i+vec3i(1,1,1));
 let k1=b-a;let k2=c-a;let k3=e-a;let k4=a-b-c+d;let k5=a-c-e+m;let k6=a-b-e+o;let k7=-a+b+c-d+e-o-m+h;
 return vec4f(a+k1*u.x+k2*u.y+k3*u.z+k4*u.x*u.y+k5*u.y*u.z+k6*u.z*u.x+k7*u.x*u.y*u.z,
  du*vec3f(k1+k4*u.y+k6*u.z+k7*u.y*u.z,k2+k5*u.z+k4*u.x+k7*u.z*u.x,k3+k6*u.x+k5*u.y+k7*u.x*u.y))*2.-vec4f(1.,0.,0.,0.);}
fn fbm(p:vec3f,oc:f32,ga:f32)->vec4f{var s=vec4f(0.);var a=.5;var f=1.;
 for(var i=0;i<22;i++){let k=f32(i);if(k>=oc){break;}let n=vn(p*f+vec3f(k*1.7,k*9.2,k*3.1));s+=a*min(oc-k,1.)*vec4f(n.x,n.yzw*f);a*=ga;f*=2.03;}
 return s;}
var<private> OCM:f32=16.;// octave budget (perf cap per use-site)
fn lod(fp:f32,s:f32)->f32{return clamp(log2(.5/(fp*s))+1.,1.,OCM);}
// cellular craters: height (domain units) + gradient
fn crat(p:vec3f)->vec4f{let l=floor(p);let i=vec3i(l);let f=p-l;var r=vec4f(0.);
 for(var z=-1;z<=1;z++){for(var y=-1;y<=1;y++){for(var x=-1;x<=1;x++){
  let o=vec3i(x,y,z);let h=hu(i+o);
  if((h&7u)<5u){continue;}
  let c=vec3f(o)+vec3f(f32((h>>3u)&255u),f32((h>>11u)&255u),f32((h>>19u)&255u))*(.8/255.)+.1;
  let rd=.08+.38*pow(f32(h>>27u)*(1./31.),4.);
  let d=f-c;let l2=dot(d,d);
  if(l2<rd*rd*2.6){let dl=sqrt(l2);let q=dl/rd;let e=exp(-(q-1.)*(q-1.)*14.);
   var hh=.22*e;var dh=-6.16*e*(q-1.);
   if(q<1.){hh+=(q*q-1.)*.55;dh+=1.1*q;}
   r+=vec4f(hh*rd,dh*d/max(dl,1e-6));}
 }}}return r;}
fn crats(p:vec3f,n:f32)->vec4f{var s=vec4f(0.);var f=1.;for(var i=0;i<5;i++){let k=f32(i);if(k>=n){break;}let c=crat(p*f+vec3f(k*7.3));s+=min(n-k,1.)*vec4f(c.x/f,c.yzw);f*=2.4;}return s;}
// ================= SPHERICAL BODY UBER-SHADER =================
// Body layout (16 x vec4):
// 0 center(cam-rel m),R | 1 dist,alt,light,kind(0 solid,1 gas,2 star) | 2 orientation quat
// 3 c0,ocean | 4 c1,hAmp | 5 c2(ocean col),noiseScale | 6 c3(ice),capLat | 7 c4(accent),accentAmt
// 8 craterAmt,craterScale,mixK,seed | 9 bandAmt,bandFreq,bandTurb,spotAmt | 10 spotLat,spotLon,spotSize,cityLights
// 11 atmH,mieTau,mieG,cloudCover | 12 rayleighTau.rgb,_ | 13 ringIn,ringOut,ringOpacity,boxHalf
// 14 ringCol,specular | 15 animSpeed,corona,cloudH,_
struct VB{@builtin(position) p:vec4f,@location(0) @interpolate(flat) id:u32};
struct FO{@location(0) c:vec4f,@builtin(frag_depth) d:f32};
struct TR{h:f32,n:vec3f,f:f32,c:f32};
@vertex fn vsB(@builtin(vertex_index) v:u32,@builtin(instance_index) i:u32)->VB{
 let b=BD[i].d;let h=max(b[13].w*b[0].w,4.*g.mi.w*b[1].x);
 return VB(g.vp*vec4f(b[0].xyz+cube(v)*h,1.),i);}
fn terr(b:array<vec4f,16>,n:vec3f,fp:f32)->TR{
 let s=b[5].w;let sd=vec3f(b[8].w);
 let f=fbm(n*s+sd,lod(fp,s),.5);var h=f.x;var gr=f.yzw*s;
 let ol=b[3].w;if(ol>-5.){if(h<ol){h=ol;gr=vec3f(0.);}h-=ol;}
 h*=b[4].w;gr*=b[4].w;var cr=0.;
 if(b[8].x>0.){let cs=b[8].y;let c=crats(n*cs+sd*1.3,clamp(log2(.5/(fp*cs))/1.26,0.,5.));h+=b[8].x*c.x/cs;gr+=b[8].x*c.yzw;cr=c.x;}
 return TR(h,gr,f.x,cr);}
fn cloud(b:array<vec4f,16>,n:vec3f,fp:f32)->f32{
 let p=ry(n,g.mi.x*b[15].x);let w=fbm(p*3.,4.,.5);
 let f=fbm(p*7.+w.yzw*.04+vec3f(w.x*.6),min(lod(fp,7.),11.),.56).x;let th=.3-b[11].w*.55;return smoothstep(th,th+.35,f)*smoothstep(th-.15,th+.6,f);}
fn ringD(b:array<vec4f,16>,r:f32,fp:f32)->f32{
 let w=b[13].y-b[13].x;let x=(r-b[13].x)/w;if(x<0.||x>1.){return 0.;}let px=fp/w;
 var d=.55+.2*sin(x*31.+1.)*clamp(1.-31.*px,0.,1.)+.15*sin(x*87.+2.)*clamp(1.-87.*px,0.,1.)+.1*sin(x*213.)*clamp(1.-213.*px,0.,1.)+.12*vn(vec3f(x*700.,.5,.5)).x*clamp(1.-700.*px,0.,1.);
 d*=smoothstep(0.,.04,x)*smoothstep(1.,.97,x)*mix(.22,1.,smoothstep(.12,.3,x));
 d*=mix(.04,1.,smoothstep(.012,.025,abs(x-.63)))*mix(.15,1.,smoothstep(.002,.006,abs(x-.9)));
 return clamp(d,0.,1.);}
// optical depth toward the sun (rayleigh, mie) + planet shadow factor
fn odL(p:vec3f,L:vec3f,top:f32,hr:f32,hm:f32)->vec3f{
 let t=isph(p,L,top).y;let ds=t*.25;var o=vec2f(0.);
 for(var i=0;i<4;i++){let q=p+L*(ds*(f32(i)+.5));o+=exp(-max(length(q)-1.,0.)/vec2f(hr,hm));}
 let bl=dot(p,L);let sh=select(1.,smoothstep(.985,1.01,length(p-L*bl)),bl<0.);
 return vec3f(o*ds,sh);}
fn sunT(b:array<vec4f,16>,p:vec3f,L:vec3f)->vec3f{
 let H=b[11].x;if(H<=0.){let bl=dot(p,L);return vec3f(select(1.,smoothstep(.985,1.01,length(p-L*bl)),bl<0.));}
 let hr=H*.18;let hm=H*.07;let o=odL(p,L,1.+H,hr,hm);return exp(-(b[12].xyz/hr*o.x+b[11].y/hm*1.1*o.y))*o.z;}
struct AT{c:vec3f,t:vec3f};
fn atmo(b:array<vec4f,16>,ro:vec3f,rd:vec3f,t0:f32,t1:f32,L:vec3f,dt:f32,E:vec3f)->AT{
 let H=b[11].x;let hr=H*.18;let hm=H*.07;let bR=b[12].xyz/hr;let bM=b[11].y/hm;
 let ds=(t1-t0)/12.;var od=vec2f(0.);var sR=vec3f(0.);var sM=vec3f(0.);
 for(var i=0;i<12;i++){let p=ro+rd*(t0+ds*(f32(i)+dt));let d=exp(-max(length(p)-1.,0.)/vec2f(hr,hm))*ds;od+=d*.5;
  let l=odL(p,L,1.+H,hr,hm);let T=exp(-(bR*(od.x+l.x)+bM*1.1*(od.y+l.y)))*l.z;od+=d*.5;sR+=T*d.x;sM+=T*d.y;}
 let mu=dot(rd,L);let gg=b[11].z;let pR=.0597*(1.+mu*mu);let pM=.0796*(1.-gg*gg)/pow(1.+gg*gg-2.*gg*mu,1.5);
 return AT((sR*bR*pR+sM*bM*pM)*E*3.5,exp(-(bR*od.x+bM*1.1*od.y)));}
fn gasCol(b:array<vec4f,16>,n:vec3f,fp:f32)->vec3f{
 let lat=n.y;let t=g.mi.x*b[15].x;let p=ry(n,t*(1.+.25*sin(lat*11.)));
 let w=fbm(p*vec3f(3.,9.,3.)+vec3f(0.,0.,t*.3),lod(fp,9.),.55);
 let bf=b[9].y;let bd=sin(lat*bf+b[9].z*w.x);let bd2=sin(lat*bf*2.7+1.3+b[9].z*1.6*w.x);
 var c=mix(b[3].xyz,b[4].xyz,(bd*.5+.5)*b[9].x);c=mix(c,b[6].xyz,smoothstep(.3,1.,bd2)*.55*b[9].x);
 c*=.93+.14*fbm(p*vec3f(12.,40.,12.),lod(fp,40.),.5).x*b[9].x;
 if(b[9].w>0.){let la=radians(b[10].x);let lo=radians(b[10].y)+t*(1.+.25*sin(la*11.));
  let dl=atan2(sin(atan2(n.z,n.x)-lo),cos(atan2(n.z,n.x)-lo))*cos(la);let e=length(vec2f(dl/(b[10].z*1.8),(asin(clamp(lat,-1.,1.))-la)/b[10].z));
  let sw=fbm(vec3f(dl,lat,0.)*30.+vec3f(e*e*4.-t*2.,0.,0.),5.,.5).x;
  c=mix(c,b[7].xyz*(.85+.3*sin(e*12.+sw*3.)),smoothstep(1.,.55,e)*b[9].w);
  c=mix(c,b[6].xyz,smoothstep(.25,0.,abs(e-1.05))*.4*b[9].w);}
 return c*mix(1.,.72,smoothstep(.7,.97,abs(lat)));}
fn star(b:array<vec4f,16>,ro:vec3f,rd:vec3f,rdw:vec3f,dn:f32,an:f32,pa:f32)->FO{
 let bb=dot(ro,rd);let c0=an*(dn+1.);let ds=bb*bb-c0;let t=g.mi.x;let sc=b[3].xyz*b[3].w;
 var col=vec3f(0.);var a=0.;var tS=-1.;
 if(ds>=0.&&bb<0.){tS=c0/(-bb+sqrt(ds));let n=normalize(ro+rd*tS);let mu=max(dot(n,-rd),0.);let np=ry(n,t*.004);
  let gr=vn(np*95.+vec3f(t*.25)).x*.5+fbm(np*16.+vec3f(t*.03),lod(tS*pa,16.),.55).x;
  let sp=smoothstep(.42,.55,fbm(np*3.+vec3f(5.),4.,.5).x);
  col=sc*.06*(.3+.7*sqrt(mu))*mix(vec3f(1.,.55,.3),vec3f(1.),pow(mu,.35))*(1.+.22*gr)*(1.-.8*sp);
  a=clamp(.5-(length(ro+rd*max(-bb,0.))-1.)/(max(-bb,1e-6)*pa),0.,1.);}
 let tb=isph(ro,rd,5.);let t0=max(tb.x,0.);let t1=select(tb.y,tS,tS>0.);var cr=0.;
 if(t1>t0){let st=(t1-t0)/16.;for(var i=0;i<16;i++){let p=ro+rd*(t0+st*(f32(i)+.5));let r=length(p);let dn2=p/r;
  let s=vn(dn2*vec3f(9.,9.,9.)+vec3f(t*.01)).x*.6+vn(dn2*23.+vec3f(-t*.02)).x*.4;
  cr+=(exp(-(r-1.)*3.)*(.25+pow(max(s*.5+.6,0.),4.)*1.4)+.04/(r*r*r))*st;}}
 let e=col*a+sc*.012*cr*b[15].y;
 let tD=select(t0,tS,tS>0.);if(a<.001&&cr<1e-4){discard;}
 return FO(vec4f(e,a),zdep(max(tD,1e-6)*b[0].w,rdw));}
@fragment fn fsB(v:VB)->FO{
 let b=BD[v.id].d;let R=b[0].w;let q=qc(b[2]);let rdw=ray(v.p.xy);let rd=qr(q,rdw);
 let ro=qr(q,-b[0].xyz/R);let dn=b[1].x/R;let an=b[1].y/R;let pa=g.mi.w;
 if(b[1].w>1.5){return star(b,ro,rd,rdw,dn,an,pa);}
 let L=normalize(qr(q,g.sun.xyz-b[0].xyz));let E=g.sc.rgb*b[1].z*2.;let V=-rd;
 let dt=fract(52.98*fract(dot(v.p.xy,vec2f(.0671,.00584))));
 let bb=dot(ro,rd);let tc=max(-bb,0.);let bm=length(ro+rd*tc);let fpc=max(tc,1e-7)*pa;
 let gas=b[1].w>.5;
 // distant body: sub-pixel disc
 if(1./(dn*pa)<1.2){let px=bm/(dn*pa);let k=exp(-px*px*2.);if(k<.01){discard;}
  let al=mix(b[3].xyz,b[4].xyz,.4)*E*(.35+.65*max(dot(L,normalize(ro)),0.));let cv=clamp(1.6/(dn*pa),.15,1.)*k;
  return FO(vec4f(al*cv,cv),zdep(b[1].x,rdw));}
 var tS=-1.;var cov=1.;let c0=an*(dn+1.);let ds=bb*bb-c0;
 if(ds>=0.&&bb<0.){tS=c0/(-bb+sqrt(ds));}
 cov=clamp(.5-(bm-1.)/fpc,0.,1.);if(tS<0.&&cov>0.){tS=tc;}
 // terrain heightfield raymarch (real silhouettes close-up)
 let hm=select(b[4].w+b[8].x*.3/max(b[8].y,1.),0.,gas);
 if(hm>0.){let ct=(an-hm)*(dn+1.+hm);let d2=bb*bb-ct;
  if(d2>0.){let sq=sqrt(d2);let te=select(ct/(-bb+sq),0.,ct<0.);let tx=-bb+sq;
   if(tx>0.&&hm/(max(te,1e-7)*pa)>.6){var t=te;var hit=true;let fm=max(te*pa,hm*.02);
    OCM=7.;for(var i=0;i<72;i++){let p=ro+rd*t;let r=length(p);let d=r-1.-terr(b,p/r,fm*4.).h;if(d<t*pa*.35){break;}t+=d*.55;if(t>tx){hit=false;break;}}
    tS=select(-1.,t,hit);if(hit){cov=1.;}OCM=16.;}}}
 var acc=vec4f(0.);var tD=1e30;let ringOn=b[13].y>0.;let fpS=max(tS,1e-7)*pa;
 // ---- surface ----
 if(tS>0.){let p=ro+rd*tS;let n=normalize(p);var N=n;var col:vec3f;var spec=0.;var em=vec3f(0.);var rough=.3;
  if(gas){col=gasCol(b,n,fpS);}else{
   let T=terr(b,n,fpS);N=normalize(n-(T.n-dot(T.n,n)*n));
   let m=fbm(n*b[5].w*1.1+vec3f(5.1),5.,.5).x;let ol=b[3].w;let hr=T.h/max(b[4].w,1e-6);
   if(ol>-5.&&T.f<ol){col=b[5].xyz*mix(1.,.45,smoothstep(0.,.25,ol-T.f));spec=b[14].w;
    let wv=vn(n*6000.+vec3f(g.mi.x*.5)).yzw*.004;N=normalize(n+wv-dot(wv,n)*n);rough=clamp(.07+fpS*3e3,.07,.5);}
   else{col=mix(b[3].xyz,b[4].xyz,smoothstep(-.12,.12,m*b[8].z+hr*.35-.05))*(1.+T.c*1.5);
    if(ol>-5.){col=mix(col,b[6].xyz,smoothstep(.55,.75,hr)*.8);col=mix(b[4].xyz*1.1,col,smoothstep(0.,.03,T.f-ol));}}
   let cl=b[6].w;if(cl<1.5){let k=smoothstep(cl,cl+.03,abs(n.y)+m*.06);col=mix(col,b[6].xyz,k);spec*=1.-k;}
   let aa=b[7].w;
   if(aa>0.){let r1=1.-abs(vn(n*b[5].w*5.+vec3f(3.3)).x);let r2=1.-abs(vn(n*b[5].w*17.+vec3f(1.1)).x);col=mix(col,b[7].xyz,clamp(aa*(pow(r1,40.)+.6*pow(r2,70.)+.25*smoothstep(.3,.7,m)),0.,1.));}
   if(aa<0.){let f=fbm(n*b[5].w*3.+vec3f(9.),5.,.55).x;col=mix(col,b[7].xyz,smoothstep(.18,.38,f)*min(-aa,1.));em+=vec3f(1.,.32,.05)*smoothstep(.46,.56,f)*3.*-aa;}
   if(b[10].w>0.&&!(ol>-5.&&T.f<ol)){let ci=fbm(n*70.,6.,.6).x;em+=vec3f(1.,.62,.28)*smoothstep(.3,.6,ci)*smoothstep(-.05,.3,m)*b[10].w*.06*smoothstep(.08,-.18,dot(n,L))*smoothstep(.03,.1,T.f-ol);}}
  var sT=sunT(b,p,L);
  if(ringOn&&abs(L.y)>1e-4){let tr=-p.y/L.y;if(tr>0.){let rq=p+L*tr;sT*=1.-ringD(b,length(rq.xz),.01)*b[13].z*.9;}}
  if(b[11].w>0.){let ch=b[15].z;sT*=1.-.7*cloud(b,normalize(p+L*(ch/max(dot(n,L),.15))),.01);}
  let ndl=dot(N,L);let gdl=dot(n,L);
  var c=col*E*max(ndl,0.)*smoothstep(-.03,.08,gdl)*sT+col*E*(.0025+b[12].xyz*.3*smoothstep(-.2,.3,gdl));
  if(spec>0.){let Hh=normalize(L+V);let nh=max(dot(N,Hh),0.);let a2=rough*rough*rough*rough;let dd=nh*nh*(a2-1.)+1.;
   let F=.02+.98*pow(1.-max(dot(V,Hh),0.),5.);c+=E*sT*spec*a2/(PI*dd*dd)*F*.25*max(ndl,0.)/max(dot(N,V),.15);}
  acc=vec4f(c+em,1.)*cov;tD=tS;}
 // ---- clouds ----
 if(b[11].w>0.){let ch=b[15].z;let cc=(an-ch)*(dn+1.+ch);let dd=bb*bb-cc;
  if(dd>0.){let sq=sqrt(dd);let t=select(select(cc/(-bb+sq),1e30,bb>0.),-bb+sq,cc<0.);
   if(t<1e29&&t>0.&&(tS<0.||t<tS)){let pc=ro+rd*t;let nc=normalize(pc);var a=cloud(b,nc,t*pa)*.9;
    a=1.-pow(1.-a,1./max(abs(dot(nc,rd)),.4));let nl=dot(nc,L);
    let cc2=vec3f(1.)*E*(max(nl,0.)*.9+.1*smoothstep(-.2,.2,nl))*sunT(b,pc,L)+E*.01;
    acc=vec4f(cc2*a,a)+(1.-a)*acc;tD=min(tD,t);}}}
 // ---- rings ----
 var rC=vec4f(0.);var tR=-1.;
 if(ringOn&&abs(rd.y)>1e-6){tR=-ro.y/rd.y;
  if(tR>0.&&(tS<0.||tR<tS)){let pr=ro+rd*tR;let x=length(pr.xz);let d=ringD(b,x,tR*pa/max(abs(rd.y),.05))*b[13].z;
   if(d>.001){let bl=dot(pr,L);let sh=select(1.,smoothstep(.97,1.01,length(pr-L*bl)),bl<0.);
    let lit=L.y*ro.y>0.;let il=select((1.-d)*.6+.08,1.,lit)*(.25+.75*sqrt(abs(L.y)));
    let rc=b[14].xyz*(.75+.5*vn(vec3f(x*37.,.5,.5)).x);rC=vec4f(rc*E*il*sh*(.8+.5*pow(max(dot(rd,L),0.),6.))*d,d);}}}
 // ---- atmosphere + composition ----
 let H=b[11].x;var tA=vec2f(1e30,-1e30);if(H>0.){tA=isph(ro,rd,1.+H);}
 let atm=tA.y>0.&&tA.x<tA.y;let t0=max(tA.x,0.);let t1=select(tA.y,min(tA.y,tS),tS>0.);
 if(rC.a>0.&&atm&&tR>(t0+t1)*.5){acc=rC+(1.-rC.a)*acc;rC=vec4f(0.);tD=min(tD,tR);}
 if(atm&&t1>t0){let A=atmo(b,ro,rd,t0,t1,L,dt,E);acc=vec4f(A.c+A.t*acc.rgb,1.-(1.-acc.a)*dot(A.t,vec3f(.3333)));tD=min(tD,t0);}
 if(rC.a>0.){acc=rC+(1.-rC.a)*acc;tD=min(tD,tR);}
 if(acc.a<.002&&max(acc.r,max(acc.g,acc.b))<.0004){discard;}
 return FO(acc,zdep(max(tD,1e-9)*R,rdw));}
// ================= SDF UBER-SHADER (stations, asteroids, comets, ship) =================
// Inst: a=center(cam-rel m),halfSize | q=orientation | b=type(0 rock,1 station,2 comet,3 ship,4 tail),seed,light,param
struct VS{@builtin(position) p:vec4f,@location(0) @interpolate(flat) id:u32,@location(1) @interpolate(flat) im:f32};
var<private> LO:f32;
@vertex fn vsS(@builtin(vertex_index) v:u32,@builtin(instance_index) i:u32)->VS{
 let s=IN[i];let pr=s.a.w/(length(s.a.xyz)*g.mi.w);let im=select(0.,pr,pr<1.5&&s.b.x<.5);
 let k=select(1.,1.5/max(pr,1e-6),im>0.);return VS(g.vp*vec4f(s.a.xyz+qr(s.q,cube(v))*s.a.w*k,1.),i,im);}
fn sb(p:vec3f,b:vec3f)->f32{let q=abs(p)-b;return length(max(q,vec3f(0.)))+min(max(q.x,max(q.y,q.z)),0.);}
fn sb2(p:vec2f,b:vec2f)->f32{let q=abs(p)-b;return length(max(q,vec2f(0.)))+min(max(q.x,q.y),0.);}
fn rock(p:vec3f,sd:f32)->f32{let q=p*vec3f(1.,1.3+.5*fract(sd*7.1),1.1+.35*fract(sd*3.7));
 return (length(q)-.6+fbm(p*1.7+vec3f(sd*13.),LO,.5).x*.28)*.55;}
fn station(p0:vec3f)->vec2f{
 let p=ry(p0,g.mi.x*.06);let rx=length(p.xz);let q=vec2f(rx-.62,p.y);
 var d=sb2(q,vec2f(.05,.065))-.012;var m=1.;
 let an=atan2(p.z,p.x);let sg=PI/24.;let ra=(fract(an/sg)-.5)*sg*rx;
 d=min(d,max(sb2(q,vec2f(.068,.085))-.004,abs(ra)-.007));
 let s6=PI/3.;let a6=(fract(an/s6+.5)-.5)*s6;let ps=vec3f(rx*cos(a6),p.y,rx*sin(a6));
 d=min(d,length(vec3f(ps.x-clamp(ps.x,.1,.58),ps.y,ps.z))-.016);
 d=min(d,sb(vec3f(rx-.36,p.y,ra*0.+ps.z),vec3f(.012,.05,.012)));
 d=min(d,max(rx-.13,abs(p.y)-.075)-.01);
 d=min(d,max(rx-.032,abs(p.y)-.93));
 d=min(d,length(vec2f(rx-.07,p.y-.86))-.012);
 let pp=vec3f(abs(p.x)-.34,abs(p.y)-.6,p.z);let so=sb(pp,vec3f(.27,.003,.085));
 d=min(d,sb(vec3f(p.x,abs(p.y)-.6,p.z),vec3f(.62,.006,.006)));
 if(so<d){d=so;m=3.;}
 let nl=length(vec3f(p.x,abs(p.y)-.94,p.z))-.012;if(nl<d){d=nl;m=4.;}
 return vec2f(d,m);}
fn ship(p:vec3f)->vec2f{let px=vec3f(abs(p.x),p.y,p.z);
 var d=length(p/vec3f(.17,.11,.75))*.11-.11;var m=5.;
 let wq=px-vec3f(.42,-.02,.25+px.x*.45);d=min(d,sb(wq,vec3f(.3,.012,.13))-.01);
 d=min(d,sb(vec3f(p.x,p.y-.12-max(p.z-.4,0.)*.4,p.z-.55),vec3f(.008,.12,.12)));
 let en=max(length(px.xy-vec2f(.2,0.))-.07,abs(p.z-.68)-.14);d=min(d,en);
 let gl=length((p-vec3f(0.,.07,-.3))/vec3f(.09,.07,.2))*.07-.07;if(gl<d){d=gl;m=7.;}
 let ex=max(length(px.xy-vec2f(.2,0.))-.055,abs(p.z-.83)-.01);if(ex<d){d=ex;m=8.;}
 return vec2f(d,m);}
fn mp(p:vec3f,t:f32,sd:f32)->vec2f{if(t<.5){return vec2f(rock(p,sd),1.);}if(t<1.5){return station(p);}if(t<2.5){return vec2f(rock(p,sd),6.);}return ship(p);}
fn snrm(p:vec3f,t:f32,sd:f32,e:f32)->vec3f{let k=vec2f(1.,-1.);
 return normalize(k.xyy*mp(p+k.xyy*e,t,sd).x+k.yyx*mp(p+k.yyx*e,t,sd).x+k.yxy*mp(p+k.yxy*e,t,sd).x+k.xxx*mp(p+k.xxx*e,t,sd).x);}
fn slab(ro:vec3f,rd:vec3f)->vec2f{let iv=1./rd;let a=(-1.-ro)*iv;let c=(1.-ro)*iv;let n=min(a,c);let f=max(a,c);return vec2f(max(max(n.x,n.y),n.z),min(min(f.x,f.y),f.z));}
@fragment fn fsS(v:VS)->FO{
 let s=IN[v.id];let rdw=ray(v.p.xy);let ty=s.b.x;let sd=s.b.y;let li=s.b.z;let E=g.sc.rgb*li*2.;
 let Lw=normalize(g.sun.xyz-s.a.xyz);
 if(v.im>0.){let px=length(cross(rdw,s.a.xyz))/length(s.a.xyz)/g.mi.w;if(px>1.){discard;}
  return FO(vec4f(vec3f(.4,.36,.32)*E*max(v.im*v.im,.012)*.6*(1.-px*px)*(.4+.6*max(dot(Lw,-normalize(s.a.xyz)),0.)),1.),zdep(length(s.a.xyz),rdw));}
 let qi=qc(s.q);let sc=s.a.w;let ro=qr(qi,-s.a.xyz)/sc;let rd=qr(qi,rdw);let L=qr(qi,Lw);
 let tb=slab(ro,rd);if(tb.y<max(tb.x,0.)){discard;}
 let pa=g.mi.w;var t=max(tb.x,0.);var hit=false;var m=0.;LO=clamp(log2(.5/(max(t,1e-4)*pa*1.7))+1.,3.,7.);
 let sf=select(.9,1.,ty>.5&&ty<1.5);
 for(var k=0;k<128;k++){let r=mp(ro+rd*t,ty,sd);if(r.x<max(t*pa*.4,2e-5)){hit=true;m=r.y;break;}t+=r.x*sf;if(t>tb.y){break;}}
 if(!hit){discard;}
 let p=ro+rd*t;let n=snrm(p,ty,sd,max(t*pa*.5,1e-4));let V=-rd;
 var al=vec3f(.5);var em=vec3f(0.);var sp=.1;
 if(m<1.5){if(ty<.5){al=mix(vec3f(.3,.27,.24),vec3f(.46,.4,.33),fract(sd*5.3))*(.8+.35*vn(p*24.).x);sp=.03;}
  else{let pr=ry(p,g.mi.x*.06);let pn=step(vec3f(.5),fract(pr*vec3f(41.,37.,43.)));al=vec3f(.68,.7,.73)*(.82+.1*(pn.x+pn.y-pn.z));sp=.35;
   let rx=length(pr.xz);let wq=vec2f(rx-.62,pr.y);
   if(abs(wq.x)<.075&&abs(wq.y)<.05){let an=atan2(pr.z,pr.x);let w=step(.45,fract(an*130.))*step(.6,fract(pr.y*45.+.5))*step(.55,hf(vec3i(i32(an*130.),i32(pr.y*45.),3)))*step(.045,abs(wq.x));em=vec3f(1.,.8,.5)*w*1.2;}}}
 else if(m<3.5){al=vec3f(.03,.05,.13);sp=1.;}
 else if(m<4.5){let bl=step(.8,fract(g.mi.x*.7+sd));em=select(vec3f(.1,2.,.3),vec3f(2.,.15,.1),p.y>0.)*bl*6.;}
 else if(m<5.5){al=vec3f(.55,.56,.6)*(1.-.5*step(abs(p.x),.03)*step(p.y,0.));sp=.4;}
 else if(m<6.5){al=vec3f(.22,.21,.21)*(.8+.4*vn(p*20.).x);sp=.05;}
 else if(m<7.5){al=vec3f(.02,.03,.05);sp=2.;}
 else{em=vec3f(.35,.65,1.)*(2.+s.b.w*30.);}
 var sh=1.;
 if(ty>.5){var st=.004;for(var k=0;k<28;k++){let h=mp(p+n*.003+L*st,ty,sd).x;sh=min(sh,14.*h/st);st+=clamp(h,.004,.08);if(sh<.01||st>1.6){break;}}sh=clamp(sh,0.,1.);}
 let nl=max(dot(n,L),0.);let hh=normalize(L+V);
 let c=al*E*nl*sh+al*E*.012*(.6+.4*n.y)+E*sh*sp*pow(max(dot(n,hh),0.),60.)*nl*.5+em;
 return FO(vec4f(c,1.),zdep(t*sc,rdw));}
// comet tail: additive volumetric in the same instanced-box framework (local +z = anti-sun)
@fragment fn fsT(v:VS)->@location(0) vec4f{
 let s=IN[v.id];let rdw=ray(v.p.xy);let qi=qc(s.q);let ro=qr(qi,-s.a.xyz)/s.a.w;let rd=qr(qi,rdw);
 let tb=slab(ro,rd);if(tb.y<max(tb.x,0.)){discard;}let t0=max(tb.x,0.);let st=(tb.y-t0)/24.;var c=vec3f(0.);
 let dt=fract(52.98*fract(dot(v.p.xy,vec2f(.0671,.00584))));
 for(var i=0;i<24;i++){let p=ro+rd*(t0+st*(f32(i)+dt));let z=clamp((p.z+1.)*.5,0.,1.);let w=.02+z*.3;
  let nz=vn(p*vec3f(6.,6.,3.)+vec3f(0.,0.,-g.mi.x*.2)).x*.5+.5;
  let io=exp(-dot(p.xy,p.xy)/(w*w*.12))*(1.-z)*(.5+nz);let dp=p.xy-vec2f(z*z*.45,0.);
  let du=exp(-dot(dp,dp)/(w*w))*pow(1.-z,1.5)*(.6+.6*nz);let co=exp(-length(p-vec3f(0.,0.,-1.))*14.)*3.;
  c+=(vec3f(.35,.6,1.)*io*1.6+vec3f(1.,.88,.7)*du+vec3f(.8,.9,1.)*co)*st;}
 return vec4f(c*s.b.z*g.sc.rgb*.6,0.);}
// ================= BACKGROUND: stars + Milky Way =================
@vertex fn vsF(@builtin(vertex_index) v:u32)->@builtin(position) vec4f{return vsq(v);}
@fragment fn fsSky(@builtin(position) f:vec4f)->@location(0) vec4f{
 let rd=ray(f.xy);let gn=normalize(vec3f(.25,.88,.4));let gl=dot(rd,gn);let gc=normalize(vec3f(.9,-.2,-.38));
 let band=exp(-gl*gl*30.);let core=pow(max(dot(rd,gc),0.),6.);
 let ns=fbm(rd*3.,7.,.55);let du=fbm(rd*7.+vec3f(2.),6.,.55).x;
 var c=(vec3f(.42,.45,.6)*band*(.6+ns.x*.8)+vec3f(.9,.7,.45)*core*band*1.5)*.012*(1.-smoothstep(-.05,.25,du)*band*.85);
 c+=vec3f(.5,.15,.25)*smoothstep(.15,.6,fbm(rd*2.2+vec3f(7.),5.,.5).x)*.0025+vec3f(.1,.25,.5)*smoothstep(.2,.6,fbm(rd*1.7+vec3f(3.),5.,.5).x)*.002;
 let a=abs(rd);var mi=2u;var uv=rd.xy/a.z;
 if(a.x>=a.y&&a.x>=a.z){mi=0u;uv=rd.yz/a.x;}else if(a.y>=a.z){mi=1u;uv=rd.xz/a.y;}
 let fc=i32(mi)+select(0,3,rd[mi]<0.);
 let pu=g.mi.w*(1.+.7*dot(uv,uv));
 for(var k=0;k<3;k++){let s=60.*pow(2.6,f32(k));let ce=floor(uv*s);let h=hu(vec3i(vec2i(ce),fc*7+k*97));
  if(f32(h&255u)<(14.+band*40.)/(1.+f32(k)*.6)){let o=(vec2f(f32((h>>8u)&255u),f32((h>>16u)&255u))/255.)*.5+.25;let d=length(uv*s-ce-o)/(s*pu);
   let br=pow(f32(h>>24u)/255.,40.)*3.+.003;let tc=mix(vec3f(1.,.72,.5),vec3f(.7,.8,1.),f32((h>>4u)&15u)/15.);
   c+=tc*br*(exp(-d*d*1.4)+.03*br*exp(-d*.6))*mix(1.,.1,g.wp.x);}}
 return vec4f(c,1.);}
// ================= POST: bloom-lite, sun glare, warp streaks, ACES =================
@fragment fn fsPost(@builtin(position) f:vec4f)->@location(0) vec4f{
 let ip=vec2i(f.xy);let mx=vec2i(g.res.xy)-1;var c=textureLoad(scn,ip,0).rgb;let sk=g.res.y/1440.;
 var bl=vec3f(0.);for(var i=0;i<16;i++){let a=f32(i)*2.39996;let r=(3.+f32(i)*2.2)*sk;let s=textureLoad(scn,clamp(ip+vec2i(vec2f(cos(a),sin(a))*r),vec2i(0),mx),0).rgb;bl+=max(s-vec3f(1.),vec3f(0.))/(1.+f32(i)*.3);}
 c+=bl*.035;
 if(g.ss.w>0.){let sp=g.ss.xy*g.res.xy;var vis=0.;var tot=0.;
  for(var i=0;i<12;i++){let a=f32(i)*2.39996;let o=sp+vec2f(cos(a),sin(a))*g.ss.z*sqrt((f32(i)+.5)/12.)*.8;
   if(all(o>=vec2f(0.))&&all(o<g.res.xy)){tot+=1.;vis+=select(0.,1.,textureLoad(dep,vec2i(o),0)<=g.wp.z*1.02);}}
  vis=select(vis/max(tot,1.),.0,tot<.5);let d=(f.xy-sp)/g.res.y;let r=length(d);let k=clamp(g.ss.z/(g.res.y*.004),.3,3.)*vis;
  let an=atan2(d.y,d.x);
  c+=g.sc.rgb*k*(.6*exp(-r*18.)+.05/(1.+r*r*400.)+.12*exp(-abs(d.y)*500.)*exp(-abs(d.x)*3.)+.18*pow(abs(cos(an*3.)),60.)*exp(-r*7.));}
 if(g.wp.x>0.){let u=(f.xy-g.res.xy*.5)/g.res.y;let r=length(u);let a=atan2(u.y,u.x);
  let s=pow(vn(vec3f(a*24.,r*3.-g.mi.x*14.,0.)).x*.5+.5,10.)*smoothstep(.05,.6,r)*g.wp.x;c+=vec3f(.55,.75,1.)*s*.8;}
 c*=g.mi.z;c=clamp((c*(2.51*c+.03))/(c*(2.43*c+.59)+.14),vec3f(0.),vec3f(1.));
 let uv=f.xy*g.res.zw-.5;c*=1.-dot(uv,uv)*.35;
 c=pow(c,vec3f(1./2.2))+(hf(vec3i(ip,7))-.5)/255.;return vec4f(c,1.);}
// ================= HUD: instanced AA segments + glyphs =================
struct VH{@builtin(position) p:vec4f,@location(0) uv:vec2f,@location(1) c:vec4f,@location(2) @interpolate(flat) k:vec2f};
@vertex fn vsH(@builtin(vertex_index) v:u32,@builtin(instance_index) i:u32)->VH{
 let h=HD[i];var Q=array(vec2f(0,0),vec2f(1,0),vec2f(1,1),vec2f(0,0),vec2f(1,1),vec2f(0,1));let q=Q[v];var px:vec2f;var uv:vec2f;
 if(h.b.x>=0.){px=h.a.xy+q*vec2f(h.a.z*.625,h.a.z);let ch=u32(h.b.x)-32u;uv=(vec2f(f32(ch%16u),f32(ch/16u))+q)/vec2f(16.,6.);}
 else{let d=h.a.zw-h.a.xy;let l=max(length(d),1e-3);let t=d/l;let n=vec2f(-t.y,t.x);let w=h.b.y*.5+1.;px=h.a.xy+t*(q.x*(l+2.)-1.)+n*(q.y*2.-1.)*w;uv=vec2f(0.,(q.y*2.-1.)*w);}
 return VH(vec4f(px.x*g.res.z*2.-1.,1.-px.y*g.res.w*2.,0.,1.),uv,h.c,h.b.xy);}
@fragment fn fsH(v:VH)->@location(0) vec4f{
 var a:f32;if(v.k.x>=0.){a=textureSampleLevel(atl,smp,v.uv,0.).r;}else{a=clamp(v.k.y*.5+.5-abs(v.uv.y),0.,1.);}
 return vec4f(v.c.rgb,v.c.a*a);}
`;

/* ============================== F64 MATH (allocation-free, in-place) ============================== */
const qmul = (o, oi, a, ai, b, bi) => { // o = a*b (x,y,z,w)
  const ax = a[ai], ay = a[ai + 1], az = a[ai + 2], aw = a[ai + 3], bx = b[bi], by = b[bi + 1], bz = b[bi + 2], bw = b[bi + 3];
  o[oi] = aw * bx + ax * bw + ay * bz - az * by; o[oi + 1] = aw * by - ax * bz + ay * bw + az * bx;
  o[oi + 2] = aw * bz + ax * by - ay * bx + az * bw; o[oi + 3] = aw * bw - ax * bx - ay * by - az * bz;
};
const qnorm = (q, i) => { const l = Math.hypot(q[i], q[i + 1], q[i + 2], q[i + 3]) || 1; q[i] /= l; q[i + 1] /= l; q[i + 2] /= l; q[i + 3] /= l; };
const qaxis = (o, oi, x, y, z, ang) => { const s = Math.sin(ang / 2); o[oi] = x * s; o[oi + 1] = y * s; o[oi + 2] = z * s; o[oi + 3] = Math.cos(ang / 2); };
const qrot = (o, oi, q, qi, x, y, z) => { // o = q * v * q^-1
  const qx = q[qi], qy = q[qi + 1], qz = q[qi + 2], qw = q[qi + 3];
  const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
  o[oi] = x + qw * tx + qy * tz - qz * ty; o[oi + 1] = y + qw * ty + qz * tx - qx * tz; o[oi + 2] = z + qw * tz + qx * ty - qy * tx;
};
const qslerp = (q, qi, b, bi, t) => { // q = slerp(q,b,t) in place
  let d = q[qi] * b[bi] + q[qi + 1] * b[bi + 1] + q[qi + 2] * b[bi + 2] + q[qi + 3] * b[bi + 3], s = 1;
  if (d < 0) { d = -d; s = -1; }
  let k0 = 1 - t, k1 = t * s;
  if (d < 0.9995) { const a = Math.acos(d), sa = Math.sin(a); k0 = Math.sin((1 - t) * a) / sa; k1 = (Math.sin(t * a) / sa) * s; }
  for (let i = 0; i < 4; i++) q[qi + i] = q[qi + i] * k0 + b[bi + i] * k1;
  qnorm(q, qi);
};
const qlook = (o, oi, fx, fy, fz, ux, uy, uz) => { // camera looks down -Z: build quat from forward/up
  let l = Math.hypot(fx, fy, fz); fx /= l; fy /= l; fz /= l;
  let rx = fy * uz - fz * uy, ry = fz * ux - fx * uz, rz = fx * uy - fy * ux; l = Math.hypot(rx, ry, rz);
  if (l < 1e-6) { rx = fy * 0 - fz * 1; ry = fz * 0 - fx * 0; rz = fx * 1 - fy * 0; l = Math.hypot(rx, ry, rz) || 1; } // up ∥ forward → use +Z as hint
  rx /= l; ry /= l; rz /= l;
  const vx = ry * fz - rz * fy, vy = rz * fx - rx * fz, vz = rx * fy - ry * fx; // up
  const m00 = rx, m11 = vy, m22 = -fz, m01 = vx, m02 = -fx, m10 = ry, m12 = -fy, m20 = rz, m21 = vz; // columns: r, v, -f
  const tr = m00 + m11 + m22;
  if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; o[oi + 3] = s / 4; o[oi] = (m21 - m12) / s; o[oi + 1] = (m02 - m20) / s; o[oi + 2] = (m10 - m01) / s; }
  else if (m00 > m11 && m00 > m22) { const s = Math.sqrt(1 + m00 - m11 - m22) * 2; o[oi + 3] = (m21 - m12) / s; o[oi] = s / 4; o[oi + 1] = (m01 + m10) / s; o[oi + 2] = (m02 + m20) / s; }
  else if (m11 > m22) { const s = Math.sqrt(1 + m11 - m00 - m22) * 2; o[oi + 3] = (m02 - m20) / s; o[oi] = (m01 + m10) / s; o[oi + 1] = s / 4; o[oi + 2] = (m12 + m21) / s; }
  else { const s = Math.sqrt(1 + m22 - m00 - m11) * 2; o[oi + 3] = (m10 - m01) / s; o[oi] = (m02 + m20) / s; o[oi + 1] = (m12 + m21) / s; o[oi + 2] = s / 4; }
};
const hash = (a, b, c) => { let h = Math.imul(a, 1597334673) ^ Math.imul(b, 3812015801) ^ Math.imul(c, 2798796415); h = Math.imul(h ^ (h >>> 15), 2246822519); h = Math.imul(h ^ (h >>> 13), 3266489917); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const D2R = Math.PI / 180;

/* ============================== SYSTEM COMPILATION (runs only on switch) ============================== */
const MAXB = 64, MAXI = 4096, MAXH = 12000, BSTR = 64, ISTR = 12, HSTR = 12;
function compileSystem(def) {
  const S = def.scale, rad = (re) => S.radius * Math.pow(re, S.radiusExp), au = (a) => S.au * Math.pow(a, S.auExp);
  const st = def.star, list = [{ id: st.id, name: st.name, type: 'star', R: rad(st.radius), parent: -1, star: st, tilt: 0, spinP: 1e9, a: 0, ecc: 0, inc: 0, node: 0 }];
  const belts = [];
  for (const b of def.bodies) {
    if (b.type === 'belt') { belts.push({ inner: au(b.inner), outer: au(b.outer), count: b.count, thick: au(b.outer) * b.thickness }); continue; }
    const p = b.parent ? list.findIndex((x) => x.id === b.parent) : 0, o = b.orbit || {};
    const R = b.type === 'station' || b.type === 'comet' ? b.size : rad(b.radius);
    list.push({ id: b.id, name: b.name, type: b.type, R, parent: p, def: b,
      a: o.au ? au(o.au) : (o.pr || 0) * list[p].R, period: o.period || 1e9, inc: (o.inc || 0) * D2R, node: (o.node || 0) * D2R, phase: o.phase || 0, ecc: o.ecc || 0,
      spinP: (b.spin && b.spin.period) || 1e9, tilt: ((b.spin && b.spin.tilt) || 0) * D2R });
  }
  for (const b of list) {
    b.sphere = b.type === 'star' || b.type === 'planet' || b.type === 'moon';
    const d = b.def || {}, at = d.atmosphere, ri = d.rings;
    b.box = b.type === 'star' ? 5 : Math.max(1 + (at ? at.height : 0) + 0.02, ri ? ri.outer + 0.02 : 0);
    b.soi = b.type === 'star' ? 0 : b.type === 'planet' ? 32 * b.R : b.type === 'moon' ? 7 * b.R : b.type === 'station' ? 25 * b.R : 10 * b.R;
    b.arrive = b.type === 'station' || b.type === 'comet' ? 5 * b.R : Math.max(2.6, b.box * 1.6) * b.R;
  }
  return { def, list, belts, n: list.length, idx: Object.fromEntries(list.map((b, i) => [b.id, i])) };
}
function packStatic(F, slot, b, sys) { // writes static uber-shader parameters for one sphere body
  const o = slot * BSTR, d = b.def || {}, s = d.surface || {}, at = d.atmosphere || {}, ri = d.rings || {}, c = s.c || [];
  const set = (v, a, w) => { const k = o + v * 4; F[k] = a ? a[0] : 0; F[k + 1] = a ? a[1] : 0; F[k + 2] = a ? a[2] : 0; F[k + 3] = w; };
  if (b.type === 'star') { set(3, b.star.color, b.star.intensity); F[o + 7] = 2; F[o + 55] = 5; F[o + 61] = b.star.corona; return; }
  F[o + 7] = s.gas ? 1 : 0;
  set(3, c[0] || [0.5, 0.5, 0.5], s.ocean !== undefined ? s.ocean : -9);
  set(4, c[1] || c[0] || [0.4, 0.4, 0.4], s.gas ? 0 : s.height || 0);
  set(5, c[2] || [0, 0, 0], s.scale || 2);
  set(6, c[3] || [1, 1, 1], s.caps || 9);
  set(7, c[4] || [0, 0, 0], s.accent || 0);
  const bd = s.bands || {}, sp = s.spot || {};
  F.set([s.craters || 0, s.craterScale || 8, s.mix || 0.8, s.seed || 1, bd.amt || 0, bd.freq || 10, bd.turb || 1, sp.amt || 0,
    sp.lat || 0, sp.lon || 0, sp.size || 0.1, s.lights || 0, at.height || 0, at.mie || 0, at.g || 0.75, at.clouds || 0], o + 32);
  set(12, at.rayleigh || [0, 0, 0], 0);
  F.set([ri.inner || 0, ri.outer || 0, ri.opacity || 0, b.box], o + 52);
  set(14, ri.color || [0, 0, 0], s.specular || 0);
  F.set([bd.speed || at.cloudSpeed || 0, 0, at.cloudHeight || 0.004, 0], o + 60);
}

/* ============================== ENGINE ============================== */
async function createEngine(canvas, systemId, opts = {}) {
  if (!navigator.gpu) throw new Error('WebGPU is not available in this browser.');
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw new Error('No WebGPU adapter found.');
  const hasTS = adapter.features.has('timestamp-query');
  const device = await adapter.requestDevice({ requiredFeatures: hasTS ? ['timestamp-query'] : [] });
  const ctx = canvas.getContext('webgpu'), fmt = navigator.gpu.getPreferredCanvasFormat();
  if (!opts.offscreen) ctx.configure({ device, format: fmt, alphaMode: 'opaque', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
  device.addEventListener('uncapturederror', (e) => console.error('[SpaceRoam] GPU error:', e.error.message));
  const mod = device.createShaderModule({ code: WGSL });
  const U = GPUBufferUsage, T = GPUTextureUsage, VF = GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT;

  // ---- preallocated CPU mirrors + GPU buffers ----
  const gF = new Float32Array(64), bodyF = new Float32Array(MAXB * BSTR), instF = new Float32Array(MAXI * ISTR), hudF = new Float32Array(MAXH * HSTR);
  const buf = (size, usage) => device.createBuffer({ size, usage });
  const gBuf = buf(256, U.UNIFORM | U.COPY_DST), bBuf = buf(bodyF.byteLength, U.STORAGE | U.COPY_DST);
  const iBuf = buf(instF.byteLength, U.STORAGE | U.COPY_DST), hBuf = buf(hudF.byteLength, U.STORAGE | U.COPY_DST);

  // ---- glyph atlas (procedural: system monospace font rasterised once) ----
  const AW = 480, AH = 288, oc = new OffscreenCanvas(AW, AH), o2 = oc.getContext('2d');
  o2.fillStyle = '#fff'; o2.font = 'bold 34px ui-monospace,Consolas,monospace'; o2.textAlign = 'center'; o2.textBaseline = 'middle';
  for (let c = 32; c < 128; c++) o2.fillText(String.fromCharCode(c), ((c - 32) % 16) * 30 + 15, Math.floor((c - 32) / 16) * 48 + 25);
  const atlas = device.createTexture({ size: [AW, AH], format: 'rgba8unorm', usage: T.TEXTURE_BINDING | T.COPY_DST | T.RENDER_ATTACHMENT });
  device.queue.copyExternalImageToTexture({ source: oc }, { texture: atlas }, [AW, AH]);

  const bgl0 = device.createBindGroupLayout({ entries: [
    { binding: 0, visibility: VF, buffer: {} }, { binding: 1, visibility: VF, buffer: { type: 'read-only-storage' } },
    { binding: 2, visibility: VF, buffer: { type: 'read-only-storage' } }, { binding: 3, visibility: VF, buffer: { type: 'read-only-storage' } },
    { binding: 4, visibility: VF, texture: {} }, { binding: 5, visibility: VF, sampler: {} }] });
  const bgl1 = device.createBindGroupLayout({ entries: [
    { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'unfilterable-float' } },
    { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } }] });
  const bg0 = device.createBindGroup({ layout: bgl0, entries: [
    { binding: 0, resource: { buffer: gBuf } }, { binding: 1, resource: { buffer: bBuf } }, { binding: 2, resource: { buffer: iBuf } },
    { binding: 3, resource: { buffer: hBuf } }, { binding: 4, resource: atlas.createView() }, { binding: 5, resource: device.createSampler({ magFilter: 'linear', minFilter: 'linear' }) }] });
  const pl0 = device.createPipelineLayout({ bindGroupLayouts: [bgl0] }), pl1 = device.createPipelineLayout({ bindGroupLayouts: [bgl0, bgl1] });

  const PM = { color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' } };
  const ADD = { color: { srcFactor: 'one', dstFactor: 'one' }, alpha: { srcFactor: 'one', dstFactor: 'one' } };
  const AL = { color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' } };
  const HDR = 'rgba16float', DF = 'depth32float';
  const pipe = (vs, fs, format, blend, depth, cull, layout = pl0) => device.createRenderPipeline({ layout,
    vertex: { module: mod, entryPoint: vs }, fragment: { module: mod, entryPoint: fs, targets: [{ format, blend }] },
    primitive: { topology: 'triangle-list', cullMode: cull || 'none' },
    depthStencil: depth ? { format: DF, depthWriteEnabled: depth === 2, depthCompare: depth === 3 ? 'always' : 'greater' } : undefined });
  const skyP = pipe('vsF', 'fsSky', HDR, undefined, 3), sdfP = pipe('vsS', 'fsS', HDR, undefined, 2, 'front'),
    bodyP = pipe('vsB', 'fsB', HDR, PM, 2, 'front'), tailP = pipe('vsS', 'fsT', HDR, ADD, 1, 'front'),
    postP = pipe('vsF', 'fsPost', fmt, undefined, 0, 0, pl1), hudP = pipe('vsH', 'fsH', fmt, AL, 0);

  // ---- render targets (recreated only on resize) ----
  let W = 0, H = 0, hdrT, depT, bg1, outT = null;
  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (w === W && h === H) return;
    W = canvas.width = w; H = canvas.height = h;
    if (hdrT) { hdrT.destroy(); depT.destroy(); outT && outT.destroy(); }
    if (opts.offscreen) outT = device.createTexture({ size: [W, H], format: fmt, usage: T.RENDER_ATTACHMENT | T.COPY_SRC }); // headless test path
    hdrT = device.createTexture({ size: [W, H], format: HDR, usage: T.RENDER_ATTACHMENT | T.TEXTURE_BINDING });
    depT = device.createTexture({ size: [W, H], format: DF, usage: T.RENDER_ATTACHMENT | T.TEXTURE_BINDING });
    colorAtt.view = hdrT.createView(); depthAtt.view = depT.createView();
    bg1 = device.createBindGroup({ layout: bgl1, entries: [{ binding: 0, resource: colorAtt.view }, { binding: 1, resource: depthAtt.view }] });
  };

  // ---- GPU timestamps: per-frame slot in a big resolve buffer (benchmark) + periodic HUD readback ----
  const NSLOT = 16384;
  let qs = null, resBuf = null, rdBuf = null, rdBusy = false, gpuMs = 0;
  if (hasTS) {
    qs = device.createQuerySet({ type: 'timestamp', count: 2 });
    resBuf = buf(NSLOT * 256, U.QUERY_RESOLVE | U.COPY_SRC);
    rdBuf = buf(NSLOT * 256, U.MAP_READ | U.COPY_DST);
  }
  const colorAtt = { view: null, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' };
  const depthAtt = { view: null, depthClearValue: 0, depthLoadOp: 'clear', depthStoreOp: 'store' };
  const finalAtt = { view: null, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' };
  const sceneDesc = { colorAttachments: [colorAtt], depthStencilAttachment: depthAtt };
  const finalDesc = { colorAttachments: [finalAtt] };
  if (hasTS) { sceneDesc.timestampWrites = { querySet: qs, beginningOfPassWriteIndex: 0 }; finalDesc.timestampWrites = { querySet: qs, endOfPassWriteIndex: 1 }; }
  const cmdArr = [null];

  // ---- simulation state (all f64, preallocated) ----
  const pos = new Float64Array(MAXB * 3), bq = new Float64Array(MAXB * 4), tq = new Float64Array(4), t3 = new Float64Array(3);
  const ship = { ref: 0, off: new Float64Array(3), vel: new Float64Array(3), q: new Float64Array([0, 0, 0, 1]), w: new Float64Array(3), thrust: 0 };
  const cam = new Float64Array(3), camQ = new Float64Array(4), abs = new Float64Array(3), dq = new Float64Array(4), sq = new Float64Array(4);
  const rt = new Float64Array(3), up = new Float64Array(3), fw = new Float64Array(3), scr = new Float64Array(3);
  const order = new Int32Array(MAXB), odist = new Float64Array(MAXB), slotOf = new Int32Array(MAXB);
  const astr = new Float64Array(MAXI * 8);
  let sys = null, nAst = 0, simT = 0, target = 1, cruise = false, cruiseV = 0, warpVis = 0, thirdPerson = false, showHelp = true, lastDist = 0, closing = 0;
  let capReq = null, capBusy = false;
  let mdx = 0, mdy = 0, fov = 65 * D2R, exposure = 1.0, frame = 0, nOpaque = 0, nTail = 0;
  const keys = Object.create(null);

  function switchStarSystem(id) {
    const def = STAR_SYSTEMS[id]; if (!def) { console.warn('Unknown star system', id); return false; }
    sys = compileSystem(def); bodyF.fill(0);
    let slot = 0;
    for (let i = 0; i < sys.n; i++) { const b = sys.list[i]; slotOf[i] = b.sphere ? slot : -1; if (b.sphere) packStatic(bodyF, slot++, b, sys); }
    sys.nSph = slot;
    // asteroid belt: orbital elements in f64 (positions advanced on CPU each frame for jitter-free close-ups)
    nAst = 0; for (const bt of sys.belts) for (let k = 0; k < bt.count && nAst < 3000; k++, nAst++) {
      const o = nAst * 8, r = hash(k, 1, 7), a = bt.inner + (bt.outer - bt.inner) * (0.5 + 0.5 * Math.sin(r * 9.4) * 0.3 + (hash(k, 2, 7) - 0.5) * 0.85);
      astr[o] = a; astr[o + 1] = hash(k, 3, 7) * 6.283; astr[o + 2] = 0.0004 * Math.pow(4e9 / a, 1.5); astr[o + 3] = (hash(k, 4, 7) - 0.5) * 2 * bt.thick;
      astr[o + 4] = 4000 + 22000 * Math.pow(hash(k, 5, 7), 4); astr[o + 5] = hash(k, 6, 7); astr[o + 6] = (hash(k, 8, 7) - 0.5) * 0.6; astr[o + 7] = hash(k, 9, 7) * 6.283;
    }
    sys.beltIn = sys.belts.length ? sys.belts[0].inner : 0; sys.beltOut = sys.belts.length ? sys.belts[0].outer : 0; sys.beltTh = sys.belts.length ? sys.belts[0].thick : 0;
    const sp = def.spawn || {}; target = sys.idx[sp.near] || 1; simT = 0; updateOrbits(0);
    placeNear(target, sp.dist || 4); cruise = false;
    return true;
  }
  function placeNear(i, dist, ang = 0.6, el = 0.15, pitch = 0) { // ship at dist*R from body i, az ang from the sub-solar point, looking at it (+pitch)
    const b = sys.list[i];
    ship.ref = i; let sx = -pos[i * 3], sz = -pos[i * 3 + 2]; if (Math.hypot(sx, sz) < 1) { sx = 1; sz = 0; } const l = Math.hypot(sx, sz);
    const dx = (sx / l) * Math.cos(ang) - (sz / l) * Math.sin(ang), dz = (sx / l) * Math.sin(ang) + (sz / l) * Math.cos(ang);
    const r = dist * b.R; ship.off[0] = dx * r * Math.cos(el); ship.off[1] = r * Math.sin(el); ship.off[2] = dz * r * Math.cos(el); ship.vel.fill(0); ship.w.fill(0);
    qlook(ship.q, 0, -ship.off[0], -ship.off[1], -ship.off[2], 0, 1, 0);
    if (pitch) { qaxis(dq, 0, 1, 0, 0, pitch); qmul(sq, 0, ship.q, 0, dq, 0); ship.q.set(sq); }
  }
  function updateOrbits(t) {
    for (let i = 0; i < sys.n; i++) {
      const b = sys.list[i], o = i * 3;
      if (b.parent < 0) { pos[o] = pos[o + 1] = pos[o + 2] = 0; qaxis(bq, i * 4, 0, 1, 0, t * 0.01); continue; }
      let M = b.phase + (6.283185307179586 * t) / b.period, x, z;
      if (b.ecc > 0) { let E = M; for (let k = 0; k < 6; k++) E -= (E - b.ecc * Math.sin(E) - M) / (1 - b.ecc * Math.cos(E)); x = b.a * (Math.cos(E) - b.ecc); z = b.a * Math.sqrt(1 - b.ecc * b.ecc) * Math.sin(E); }
      else { x = b.a * Math.cos(M); z = b.a * Math.sin(M); }
      const y = -z * Math.sin(b.inc), zi = z * Math.cos(b.inc), cn = Math.cos(b.node), sn = Math.sin(b.node), p = b.parent * 3;
      pos[o] = pos[p] + x * cn - zi * sn; pos[o + 1] = pos[p + 1] + y; pos[o + 2] = pos[p + 2] + x * sn + zi * cn;
      qaxis(tq, 0, 0, 0, 1, b.tilt); qaxis(sq, 0, 0, 1, 0, (6.283185307179586 * t) / b.spinP); qmul(bq, i * 4, tq, 0, sq, 0);
    }
  }

  // ---- input ----
  const onKey = (e, d) => {
    keys[e.code] = d; if (!d) return;
    switch (e.code) {
      case 'Tab': e.preventDefault(); target = (target + (e.shiftKey ? sys.n - 1 : 1)) % sys.n; break;
      case 'KeyF': cruise = !cruise && dist(target) > sys.list[target].arrive * 1.2; cruiseV = 0; break;
      case 'KeyB': bench.on ? stopBench(false) : startBench(); break;
      case 'KeyV': thirdPerson = !thirdPerson; break;
      case 'KeyH': showHelp = !showHelp; break;
      case 'KeyJ': switchStarSystem(sys.def.id === 'sol' ? 'kestrel' : 'sol'); break;
      case 'BracketLeft': exposure /= 1.15; break; case 'BracketRight': exposure *= 1.15; break;
    }
  };
  const kd = (e) => onKey(e, 1), ku = (e) => onKey(e, 0);
  const mm = (e) => { if (document.pointerLockElement === canvas) { mdx += e.movementX; mdy += e.movementY; } };
  const md = () => { canvas.focus(); if (document.pointerLockElement !== canvas) canvas.requestPointerLock && canvas.requestPointerLock(); };
  window.addEventListener('keydown', kd); window.addEventListener('keyup', ku); window.addEventListener('mousemove', mm); canvas.addEventListener('mousedown', md);

  const dist = (i) => { const o = i * 3; return Math.hypot(pos[o] - abs[0], pos[o + 1] - abs[1], pos[o + 2] - abs[2]); };

  // ---- benchmark: 60s scripted tour (Earth → Sun → Saturn rings → station) ----
  const BSEG = [ // body, start s, r0,r1 (radii), az0,az1, el0,el1
    ['earth', 0, 7, 1.12, -0.2, 1.6, 0.25, 0.03], ['sun', 15, 9, 1.7, 2.0, 3.4, 0.3, 0.05],
    ['saturn', 28, 4.2, 1.55, 0.3, 1.9, 0.12, 0.012], ['gateway', 45, 14, 1.6, 0.4, 2.6, 0.5, 0.12]];
  const bench = { on: false, t: 0, n: 0, seg: -1, lag: new Float64Array(3), v: new Float64Array(3), rel: new Float64Array(3), cpu: new Float32Array(NSLOT), res: null };
  function startBench() { if (!sys.idx.saturn) { switchStarSystem('sol'); } bench.on = true; bench.t = 0; bench.n = 0; bench.seg = -1; bench.res = null; cruise = false; simT = 100; console.log('[SpaceRoam] benchmark started (60 s)'); }
  function benchCam(dt) {
    let si = 0; for (let i = 0; i < BSEG.length; i++) if (bench.t >= BSEG[i][1]) si = i;
    const s = BSEG[si], end = si + 1 < BSEG.length ? BSEG[si + 1][1] : 60, u = Math.min(1, (bench.t - s[1]) / (end - s[1])), e = u * u * (3 - 2 * u);
    const bi = sys.idx[s[0]], b = sys.list[bi], r = b.R * s[2] * Math.pow(s[3] / s[2], e), el = s[6] + (s[7] - s[6]) * e;
    const az = s[4] + (s[5] - s[4]) * e + (bi ? Math.atan2(-pos[bi * 3 + 2], -pos[bi * 3]) : 0); // relative to the sub-solar direction
    qaxis(tq, 0, 0, 0, 1, b.tilt); qrot(t3, 0, tq, 0, Math.cos(el) * Math.cos(az) * r, Math.sin(el) * r, Math.cos(el) * Math.sin(az) * r);
    const o = bi * 3, k = Math.exp(-dt * (3 + 0.55 * Math.log10(1 + Math.hypot(bench.lag[0], bench.lag[1], bench.lag[2])))); // faster for interplanetary hand-offs
    if (si !== bench.seg) { for (let j = 0; j < 3; j++) bench.lag[j] = bench.n === 0 ? 0 : cam[j] - pos[o + j] - t3[j]; bench.seg = si; }
    for (let j = 0; j < 3; j++) { bench.lag[j] = isFinite(bench.lag[j]) ? bench.lag[j] * k : 0; const nc = pos[o + j] + t3[j] + bench.lag[j]; bench.v[j] = (t3[j] + bench.lag[j] - bench.rel[j]) / Math.max(dt, 1e-4); bench.rel[j] = t3[j] + bench.lag[j]; cam[j] = nc; } // exponential hand-off between segments, exact path inside
    qlook(dq, 0, pos[o] - cam[0], pos[o + 1] - cam[1], pos[o + 2] - cam[2], 0, 1, 0);
    if (bench.n === 0) camQ.set(dq); else qslerp(camQ, 0, dq, 0, 1 - Math.exp(-dt * 3));
    target = bi;
  }
  function stopBench(done) {
    bench.on = false; const n = bench.n; if (!done || n < 10) return;
    const cpu = Array.from(bench.cpu.subarray(1, n)).sort((a, b) => a - b), pct = (a, p) => a[Math.min(a.length - 1, Math.floor(a.length * p))];
    const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    const res = bench.res = { frames: n, cpuAvg: avg(cpu), cpuP99: pct(cpu, 0.99), gpuAvg: NaN, gpuP50: NaN, gpuP99: NaN, gpuMax: NaN, resolution: W + 'x' + H };
    const report = () => { console.log('[SpaceRoam] benchmark results'); console.table(res); };
    if (!hasTS) { report(); return; }
    const enc = device.createCommandEncoder(); enc.copyBufferToBuffer(resBuf, 0, rdBuf, 0, n * 256); device.queue.submit([enc.finish()]);
    rdBusy = true;
    rdBuf.mapAsync(GPUMapMode.READ, 0, n * 256).then(() => {
      const v = new BigUint64Array(rdBuf.getMappedRange(0, n * 256)), g = [];
      for (let i = 2; i < n; i++) { const d = Number(v[i * 32 + 1] - v[i * 32]) / 1e6; if (d > 0 && d < 1000) g.push(d); }
      rdBuf.unmap(); rdBusy = false; g.sort((a, b) => a - b);
      if (g.length) { res.gpuAvg = avg(g); res.gpuP50 = pct(g, 0.5); res.gpuP99 = pct(g, 0.99); res.gpuMax = g[g.length - 1]; }
      report();
    });
  }

  // ---- HUD builders (write straight into the preallocated instance array) ----
  let hn = 0; const tb = new Uint8Array(256); let tl = 0;
  const seg = (x0, y0, x1, y1, r, g, b, a, w) => { if (hn >= MAXH) return; const o = hn++ * HSTR; hudF[o] = x0; hudF[o + 1] = y0; hudF[o + 2] = x1; hudF[o + 3] = y1; hudF[o + 4] = r; hudF[o + 5] = g; hudF[o + 6] = b; hudF[o + 7] = a; hudF[o + 8] = -1; hudF[o + 9] = w; };
  const ts = (s) => { for (let i = 0; i < s.length && tl < 255; i++) tb[tl++] = s.charCodeAt(i); };
  const tn = (v, dec) => {
    if (!isFinite(v)) { ts('--'); return; } if (v < 0) { tb[tl++] = 45; v = -v; }
    const m = Math.pow(10, dec); let iv = Math.floor(v), fv = Math.round((v - iv) * m); if (fv >= m) { iv++; fv -= m; }
    let st = tl; do { tb[tl++] = 48 + (iv % 10); iv = Math.floor(iv / 10); } while (iv > 0 && tl < 240);
    for (let a = st, b = tl - 1; a < b; a++, b--) { const t = tb[a]; tb[a] = tb[b]; tb[b] = t; }
    if (dec > 0) { tb[tl++] = 46; st = tl; for (let k = 0; k < dec; k++) { tb[tl++] = 48 + (fv % 10); fv = Math.floor(fv / 10); } for (let a = st, b = tl - 1; a < b; a++, b--) { const t = tb[a]; tb[a] = tb[b]; tb[b] = t; } }
  };
  const tdist = (m) => { const a = Math.abs(m); if (a < 1e4) { tn(m, 0); ts(' m'); } else if (a < 1e7) { tn(m / 1e3, 1); ts(' km'); } else if (a < 1e10) { tn(m / 1e6, 1); ts(' Mm'); } else { tn(m / 1e9, 2); ts(' Gm'); } };
  const tout = (x, y, sz, r, g, b, a, align) => {
    const adv = sz * 0.6; x -= align * tl * adv;
    for (let i = 0; i < tl; i++) { const c = tb[i]; if (c !== 32 && hn < MAXH) { const o = hn++ * HSTR; hudF[o] = x + i * adv; hudF[o + 1] = y; hudF[o + 2] = sz; hudF[o + 4] = r; hudF[o + 5] = g; hudF[o + 6] = b; hudF[o + 7] = a; hudF[o + 8] = c; } }
    tl = 0;
  };
  const tanY = () => Math.tan(fov / 2);
  const project = (x, y, z) => { // camera-relative f64 point -> screen px in scr[], returns false if behind
    const vz = x * fw[0] + y * fw[1] + z * fw[2]; if (vz < 1e-3) return false;
    const ty = tanY(), tx = ty * W / H;
    scr[0] = (0.5 + 0.5 * (x * rt[0] + y * rt[1] + z * rt[2]) / (vz * tx)) * W; scr[1] = (0.5 - 0.5 * (x * up[0] + y * up[1] + z * up[2]) / (vz * ty)) * H; scr[2] = vz; return true;
  };
  function buildHud(dt, spd) {
    hn = 0; const s = Math.max(0.75, H / 1200), cx = W / 2, cy = H / 2, C = 0.45, Cg = 0.9, Cb = 1;
    // orbit paths: planets around the star + moons/stations of the local planet
    const loc = ship.ref > 0 ? (sys.list[ship.ref].parent > 0 ? sys.list[ship.ref].parent : ship.ref) : -1;
    for (let i = 1; i < sys.n; i++) {
      const b = sys.list[i]; if (!(b.parent === 0 || b.parent === loc)) continue;
      const p = b.parent * 3, hi = i === target, a = hi ? 0.55 : 0.16, N = b.ecc > 0 ? 160 : 128;
      let px = 0, py = 0, ok = false;
      for (let k = 0; k <= N; k++) {
        const M = (k / N) * 6.283185307179586; let x, z;
        if (b.ecc > 0) { x = b.a * (Math.cos(M) - b.ecc); z = b.a * Math.sqrt(1 - b.ecc * b.ecc) * Math.sin(M); } else { x = b.a * Math.cos(M); z = b.a * Math.sin(M); }
        const y = -z * Math.sin(b.inc), zi = z * Math.cos(b.inc), cn = Math.cos(b.node), sn = Math.sin(b.node);
        const v = project(pos[p] + x * cn - zi * sn - cam[0], pos[p + 1] + y - cam[1], pos[p + 2] + x * sn + zi * cn - cam[2]);
        if (v && ok && Math.abs(scr[0] - px) + Math.abs(scr[1] - py) < 4 * W) seg(px, py, scr[0], scr[1], 0.35, 0.7, 1, a, 1.2 * s);
        ok = v; px = scr[0]; py = scr[1];
      }
    }
    // body markers + names
    for (let i = 0; i < sys.n; i++) {
      const o = i * 3; if (!project(pos[o] - cam[0], pos[o + 1] - cam[1], pos[o + 2] - cam[2])) continue;
      const b = sys.list[i], prad = (b.R / scr[2]) / tanY() * H * 0.5;
      if (i === target || prad > 60 || scr[0] < 0 || scr[1] < 0 || scr[0] > W || scr[1] > H) continue;
      if (b.type === 'station' && dist(i) > 2e8) continue;
      if (b.type === 'moon' && b.parent !== loc && b.parent !== ship.ref) continue;
      const x = scr[0], y = scr[1], m = 4 * s;
      seg(x - m, y, x, y - m, C, Cg, Cb, 0.5, 1.2 * s); seg(x, y - m, x + m, y, C, Cg, Cb, 0.5, 1.2 * s); seg(x + m, y, x, y + m, C, Cg, Cb, 0.5, 1.2 * s); seg(x, y + m, x - m, y, C, Cg, Cb, 0.5, 1.2 * s);
      ts(b.name); tout(x + 9 * s, y - 8 * s, 15 * s, C, Cg, Cb, 0.55, 0);
    }
    // target bracket / off-screen arrow
    const to = target * 3, tbdy = sys.list[target], td = dist(target);
    closing += ((lastDist - td) / Math.max(dt, 1e-4) - closing) * Math.min(1, dt * 4); lastDist = td;
    const tx = pos[to] - cam[0], ty = pos[to + 1] - cam[1], tz = pos[to + 2] - cam[2];
    const vis = project(tx, ty, tz) && scr[0] > 0 && scr[1] > 0 && scr[0] < W && scr[1] < H;
    if (vis) {
      const x = scr[0], y = scr[1], r = Math.max(22 * s, (tbdy.R * (tbdy.sphere ? 1.05 : 2)) / scr[2] / tanY() * H * 0.5), l = Math.min(r * 0.4, 30 * s);
      for (let k = 0; k < 4; k++) { const sx = k & 1 ? 1 : -1, sy = k & 2 ? 1 : -1; seg(x + sx * r, y + sy * r, x + sx * (r - l), y + sy * r, 0.5, 1, 0.8, 0.9, 2 * s); seg(x + sx * r, y + sy * r, x + sx * r, y + sy * (r - l), 0.5, 1, 0.8, 0.9, 2 * s); }
      ts(tbdy.name); tout(x + r + 8 * s, y - r, 20 * s, 0.6, 1, 0.85, 1, 0);
      tdist(td - tbdy.R); tout(x + r + 8 * s, y - r + 24 * s, 17 * s, 0.6, 1, 0.85, 0.85, 0);
      tdist(closing); ts('/s'); tout(x + r + 8 * s, y - r + 45 * s, 17 * s, 0.6, 1, 0.85, 0.7, 0);
    } else {
      let ax = tx * rt[0] + ty * rt[1] + tz * rt[2], ay = -(tx * up[0] + ty * up[1] + tz * up[2]); const l = Math.hypot(ax, ay) || 1; ax /= l; ay /= l;
      const R = Math.min(W, H) * 0.42, x = cx + ax * R, y = cy + ay * R, k = 16 * s;
      seg(x, y, x - ax * k - ay * k * 0.6, y - ay * k + ax * k * 0.6, 0.5, 1, 0.8, 0.9, 2.5 * s); seg(x, y, x - ax * k + ay * k * 0.6, y - ay * k - ax * k * 0.6, 0.5, 1, 0.8, 0.9, 2.5 * s);
      ts(tbdy.name); tout(x - ax * 40 * s, y - ay * 40 * s, 16 * s, 0.6, 1, 0.85, 0.9, 0.5);
    }
    // reticle + velocity vector
    const rr = 10 * s; seg(cx - 2.2 * rr, cy, cx - rr, cy, 0.7, 0.9, 1, 0.6, 1.5 * s); seg(cx + rr, cy, cx + 2.2 * rr, cy, 0.7, 0.9, 1, 0.6, 1.5 * s); seg(cx, cy + rr, cx, cy + 1.8 * rr, 0.7, 0.9, 1, 0.6, 1.5 * s);
    if (spd > 1 && !cruise && project(ship.vel[0], ship.vel[1], ship.vel[2])) { const x = scr[0], y = scr[1], k = 7 * s; seg(x - k, y, x + k, y, 1, 0.8, 0.3, 0.8, 1.5 * s); seg(x, y - k, x, y + k, 1, 0.8, 0.3, 0.8, 1.5 * s); }
    // left telemetry panel
    const L = 28 * s; let Y = 40 * s; const F = 18 * s, LH = 25 * s;
    ts('SYSTEM '); ts(sys.def.name); tout(L, Y, F, 0.6, 0.9, 1, 0.9, 0); Y += LH;
    ts(bench.on ? 'MODE   BENCHMARK' : cruise ? 'MODE   SUPERCRUISE' : 'MODE   FLIGHT'); tout(L, Y, F, cruise || bench.on ? 1 : 0.6, cruise || bench.on ? 0.8 : 0.9, cruise || bench.on ? 0.3 : 1, 0.9, 0); Y += LH;
    ts('SPEED  '); tdist(spd); ts('/s'); tout(L, Y, F, 0.6, 0.9, 1, 0.9, 0); Y += LH;
    ts('FRAME  '); ts(sys.list[ship.ref].name); tout(L, Y, F, 0.6, 0.9, 1, 0.9, 0); Y += LH;
    ts('CPU    '); tn(avgDt * 1000, 2); ts(' ms'); tout(L, Y, F, 0.6, 0.9, 1, 0.7, 0); Y += LH;
    if (hasTS) { ts('GPU    '); tn(gpuMs, 2); ts(' ms'); tout(L, Y, F, gpuMs > 11 ? 1 : 0.6, gpuMs > 11 ? 0.5 : 0.9, gpuMs > 11 ? 0.4 : 1, 0.7, 0); Y += LH; }
    ts('TARGET '); ts(tbdy.name); tout(L, Y, F, 0.6, 1, 0.85, 0.9, 0); Y += LH;
    if (cruise) { ts('ETA    '); tn(Math.log(Math.max(td - tbdy.arrive, 1) / tbdy.arrive + 1) / 1.4 + 0.5, 1); ts(' s'); tout(L, Y, F, 1, 0.8, 0.3, 0.9, 0); Y += LH; }
    if (bench.on) { ts('BENCH  '); tn(60 - bench.t, 1); ts(' s left'); tout(L, Y, F, 1, 0.8, 0.3, 0.9, 0); Y += LH; }
    if (bench.res) {
      Y += LH * 0.5; const r = bench.res;
      ts('BENCHMARK  '); tn(r.frames, 0); ts(' frames  '); tn(W, 0); ts('x'); tn(H, 0); tout(L, Y, F, 1, 0.9, 0.5, 0.9, 0); Y += LH;
      ts('GPU avg '); tn(r.gpuAvg, 2); ts('  p99 '); tn(r.gpuP99, 2); ts('  max '); tn(r.gpuMax, 2); ts(' ms'); tout(L, Y, F, 1, 0.9, 0.5, 0.9, 0); Y += LH;
      ts('CPU avg '); tn(r.cpuAvg, 2); ts('  p99 '); tn(r.cpuP99, 2); ts(' ms (frame interval)'); tout(L, Y, F, 1, 0.9, 0.5, 0.9, 0); Y += LH;
    }
    if (showHelp) {
      const by = H - 70 * s;
      ts('W/S thrust  A/D strafe  SPACE/X up/down  Q/E roll  MOUSE pitch/yaw (click to lock)  SHIFT boost'); tout(cx, by, 16 * s, 0.7, 0.85, 1, 0.65, 0.5);
      ts('TAB target  F supercruise  V 3rd person  B benchmark  J switch system  [ ] exposure  H hide help'); tout(cx, by + 24 * s, 16 * s, 0.7, 0.85, 1, 0.65, 0.5);
    }
  }

  // ---- per-frame update ----
  let last = 0, raf = 0, avgDt = 0.016, dead = false;
  function tick(now) {
    if (dead) return; if (!opts.offscreen) raf = requestAnimationFrame(tick);
    const rawDt = last ? (now - last) / 1000 : 1 / 60; last = now; const dt = Math.min(rawDt, 0.1);
    avgDt += (rawDt - avgDt) * 0.05; resize();
    if (bench.on) { if (bench.n < NSLOT) bench.cpu[bench.n] = rawDt * 1000; }
    simT += dt; updateOrbits(simT);
    // reference frame (sphere of influence): deepest body whose SOI contains the ship
    const ro = ship.ref * 3; abs[0] = pos[ro] + ship.off[0]; abs[1] = pos[ro + 1] + ship.off[1]; abs[2] = pos[ro + 2] + ship.off[2];
    let nr = 0, best = Infinity;
    for (let i = 1; i < sys.n; i++) { const b = sys.list[i]; if (b.soi < best && dist(i) < b.soi) { best = b.soi; nr = i; } }
    if (nr !== ship.ref) { const o = nr * 3; ship.off[0] = abs[0] - pos[o]; ship.off[1] = abs[1] - pos[o + 1]; ship.off[2] = abs[2] - pos[o + 2]; ship.ref = nr; }
    // nearest surface altitude (drives speed limits)
    let alt = Infinity; for (let i = 0; i < sys.n; i++) alt = Math.min(alt, dist(i) - sys.list[i].R);
    const K = keys, inX = (K.KeyD ? 1 : 0) - (K.KeyA ? 1 : 0), inY = (K.Space ? 1 : 0) - (K.KeyX ? 1 : 0), inZ = (K.KeyS ? 1 : 0) - (K.KeyW ? 1 : 0);
    // rotation: quaternion integration of local angular velocity (no Euler angles anywhere)
    const sens = 0.0022 / Math.max(dt, 1e-3);
    const wx = -mdy * sens + ((K.ArrowUp ? 1 : 0) - (K.ArrowDown ? 1 : 0)) * 1.2, wy = -mdx * sens + ((K.ArrowLeft ? 1 : 0) - (K.ArrowRight ? 1 : 0)) * 1.2, wz = ((K.KeyQ ? 1 : 0) - (K.KeyE ? 1 : 0)) * 1.6;
    mdx = mdy = 0; const kw = 1 - Math.exp(-dt * 14);
    ship.w[0] += (wx - ship.w[0]) * kw; ship.w[1] += (wy - ship.w[1]) * kw; ship.w[2] += (wz - ship.w[2]) * kw;
    const wl = Math.hypot(ship.w[0], ship.w[1], ship.w[2]);
    if (!cruise && !bench.on && wl > 1e-9) { qaxis(dq, 0, ship.w[0] / wl, ship.w[1] / wl, ship.w[2] / wl, wl * dt); qmul(sq, 0, ship.q, 0, dq, 0); ship.q.set(sq); qnorm(ship.q, 0); }
    qrot(fw, 0, ship.q, 0, 0, 0, -1);
    if (cruise && !bench.on) { // supercruise with auto-alignment + exponential auto-deceleration
      const tbd = sys.list[target], to = target * 3, dx = pos[to] - abs[0], dy = pos[to + 1] - abs[1], dz = pos[to + 2] - abs[2], d = Math.hypot(dx, dy, dz);
      qrot(up, 0, ship.q, 0, 0, 1, 0); qlook(dq, 0, dx, dy, dz, up[0], up[1], up[2]); qslerp(ship.q, 0, dq, 0, 1 - Math.exp(-dt * 2.5));
      qrot(fw, 0, ship.q, 0, 0, 0, -1); const al = (fw[0] * dx + fw[1] * dy + fw[2] * dz) / d, surf = Math.max(d - tbd.arrive, 0);
      const vdes = surf * 1.4 * Math.pow(Math.max(0, (al - 0.85) / 0.15), 2);
      cruiseV = Math.min(vdes, Math.max(cruiseV, 2000) * Math.exp(dt * 2.2));
      for (let j = 0; j < 3; j++) { ship.off[j] += fw[j] * cruiseV * dt; ship.vel[j] = fw[j] * Math.min(cruiseV, 5e4); }
      if (d < tbd.arrive * 1.03 || (K.KeyS && !K.KeyW)) { cruise = false; for (let j = 0; j < 3; j++) ship.vel[j] = fw[j] * Math.min(cruiseV, Math.max(alt * 0.2, 200)); }
      warpVis += (Math.min(1, Math.log10(Math.max(cruiseV, 1)) / 9) - warpVis) * Math.min(1, dt * 3);
    } else { // flight-assisted 6DoF Newtonian thrust; speed cap scales with altitude
      warpVis += (0 - warpVis) * Math.min(1, dt * 3); cruiseV = 0;
      const vmax = Math.min(Math.max(150, alt * 0.35), 3e7) * (K.ShiftLeft || K.ShiftRight ? 8 : 1), acc = vmax * 1.3 * dt;
      qrot(t3, 0, ship.q, 0, inX, inY, inZ); const n = Math.hypot(inX, inY, inZ) || 1;
      for (let j = 0; j < 3; j++) { const dv = (t3[j] / n) * vmax - ship.vel[j]; ship.vel[j] += Math.max(-acc, Math.min(acc, dv)); ship.off[j] += ship.vel[j] * dt; }
      ship.thrust += ((inZ < 0 ? 1 : 0) - ship.thrust) * Math.min(1, dt * 5);
    }
    // collision: keep above every sphere surface (terrain margin) and outside stations
    abs[0] = pos[ship.ref * 3] + ship.off[0]; abs[1] = pos[ship.ref * 3 + 1] + ship.off[1]; abs[2] = pos[ship.ref * 3 + 2] + ship.off[2];
    for (let i = 0; i < sys.n; i++) {
      const b = sys.list[i], s = b.def && b.def.surface, mr = b.R * (1 + (s && !s.gas ? (s.height || 0) * 0.6 : 0)) + (b.type === 'station' ? b.R * 0.1 : 30), d = dist(i);
      if (d < mr && !bench.on) { const o = i * 3, k = mr / d; for (let j = 0; j < 3; j++) { abs[j] = pos[o + j] + (abs[j] - pos[o + j]) * k; ship.off[j] = abs[j] - pos[ship.ref * 3 + j]; } }
    }
    // camera
    if (bench.on) { bench.t += dt; benchCam(dt); if (bench.t >= 60) stopBench(true); bench.n++; abs.set(cam); } // HUD distances from the tour camera
    else {
      camQ.set(ship.q);
      if (thirdPerson) { qrot(t3, 0, ship.q, 0, 0, 9, 52); for (let j = 0; j < 3; j++) cam[j] = abs[j] + t3[j]; } else cam.set(abs);
    }
    qrot(rt, 0, camQ, 0, 1, 0, 0); qrot(up, 0, camQ, 0, 0, 1, 0); qrot(fw, 0, camQ, 0, 0, 0, -1);
    const spd = bench.on ? Math.hypot(bench.v[0], bench.v[1], bench.v[2]) : cruise ? cruiseV : Math.hypot(ship.vel[0], ship.vel[1], ship.vel[2]);

    // ---- globals ----
    const ty = Math.tan(fov / 2), tx = (ty * W) / H, near = 0.25, f = 1 / ty;
    // reversed-Z infinite projection * rotation-only view (camera-relative → no translation)
    gF[0] = (f / (W / H)) * rt[0]; gF[1] = f * up[0]; gF[2] = 0; gF[3] = fw[0];
    gF[4] = (f / (W / H)) * rt[1]; gF[5] = f * up[1]; gF[6] = 0; gF[7] = fw[1];
    gF[8] = (f / (W / H)) * rt[2]; gF[9] = f * up[2]; gF[10] = 0; gF[11] = fw[2];
    gF[12] = 0; gF[13] = 0; gF[14] = near; gF[15] = 0;
    gF[16] = rt[0]; gF[17] = rt[1]; gF[18] = rt[2]; gF[19] = tx; gF[20] = up[0]; gF[21] = up[1]; gF[22] = up[2]; gF[23] = ty;
    gF[24] = fw[0]; gF[25] = fw[1]; gF[26] = fw[2]; gF[27] = near; gF[28] = W; gF[29] = H; gF[30] = 1 / W; gF[31] = 1 / H;
    const sx = pos[0] - cam[0], sy = pos[1] - cam[1], sz = pos[2] - cam[2], sR = sys.list[0].R, sd = Math.hypot(sx, sy, sz), st = sys.list[0].star;
    gF[32] = sx; gF[33] = sy; gF[34] = sz; gF[35] = sR; gF[36] = st.color[0]; gF[37] = st.color[1]; gF[38] = st.color[2]; gF[39] = st.intensity;
    gF[40] = simT % 10000; gF[41] = warpVis; gF[42] = exposure; gF[43] = (2 * ty) / H;
    if (project(sx, sy, sz)) { gF[44] = scr[0] / W; gF[45] = scr[1] / H; gF[46] = Math.max(2, (sR / scr[2]) / ty * H * 0.5); gF[47] = 1; gF[50] = (near * sd) / (Math.max(sd - sR, 1) * scr[2]); }
    else gF[47] = 0;
    gF[48] = warpVis;

    // ---- bodies: dynamic block (camera-relative centre computed in f64), sorted far → near ----
    let nb = 0; const L = sys.def.scale;
    for (let i = 0; i < sys.n; i++) {
      const sl = slotOf[i]; if (sl < 0) continue; const b = sys.list[i], o = sl * BSTR, p = i * 3;
      const x = pos[p] - cam[0], y = pos[p + 1] - cam[1], z = pos[p + 2] - cam[2], d = Math.hypot(x, y, z);
      bodyF[o] = x; bodyF[o + 1] = y; bodyF[o + 2] = z; bodyF[o + 3] = b.R; bodyF[o + 4] = d; bodyF[o + 5] = d - b.R; // altitude in f64 → exact ray-sphere
      bodyF[o + 6] = b.type === 'star' ? 1 : Math.min(2, Math.max(0.25, Math.pow(L.lightRef / Math.max(Math.hypot(pos[p], pos[p + 1], pos[p + 2]), 1e8), L.lightExp)));
      bodyF[o + 8] = bq[i * 4]; bodyF[o + 9] = bq[i * 4 + 1]; bodyF[o + 10] = bq[i * 4 + 2]; bodyF[o + 11] = bq[i * 4 + 3];
      let k = nb++; while (k > 0 && odist[k - 1] < d) { odist[k] = odist[k - 1]; order[k] = order[k - 1]; k--; } odist[k] = d; order[k] = sl;
    }
    // ---- SDF instances: stations, comet, ship, asteroid belt (far orbiting set + local procedural field) ----
    let ni = 0;
    const inst = (x, y, z, s, q, qi, type, seed, light, param) => { if (ni >= MAXI) return; const o = ni++ * ISTR; instF[o] = x; instF[o + 1] = y; instF[o + 2] = z; instF[o + 3] = s; instF[o + 4] = q[qi]; instF[o + 5] = q[qi + 1]; instF[o + 6] = q[qi + 2]; instF[o + 7] = q[qi + 3]; instF[o + 8] = type; instF[o + 9] = seed; instF[o + 10] = light; instF[o + 11] = param; };
    const lightAt = (x, y, z, par) => { // sun light incl. playable falloff + parent-planet shadow (CPU, f64)
      const r = Math.hypot(x, y, z); let li = Math.min(2, Math.max(0.25, Math.pow(L.lightRef / Math.max(r, 1e8), L.lightExp)));
      if (par > 0) { const o = par * 3, px = pos[o] - x, py = pos[o + 1] - y, pz = pos[o + 2] - z, lx = -x / r, ly = -y / r, lz = -z / r, tt = px * lx + py * ly + pz * lz;
        if (tt > 0) { const cd = Math.hypot(px - lx * tt, py - ly * tt, pz - lz * tt), R = sys.list[par].R; li *= Math.min(1, Math.max(0, (cd - R * 0.98) / (R * 0.04))); } }
      return li;
    };
    for (let i = 1; i < sys.n; i++) {
      const b = sys.list[i], p = i * 3; if (b.sphere) continue;
      const x = pos[p] - cam[0], y = pos[p + 1] - cam[1], z = pos[p + 2] - cam[2];
      if (b.type === 'station') { qaxis(tq, 0, 1, 0, 0, b.inc * 0.5); inst(x, y, z, b.R, tq, 0, 1, i * 0.37, lightAt(pos[p], pos[p + 1], pos[p + 2], b.parent), 0); }
      else { qaxis(tq, 0, 0.3, 0.9, 0.3, simT * 0.05); qnorm(tq, 0); inst(x, y, z, b.R, tq, 0, 2, 0.71, lightAt(pos[p], pos[p + 1], pos[p + 2], 0), 0); }
    }
    if (thirdPerson && !bench.on) inst(abs[0] - cam[0], abs[1] - cam[1], abs[2] - cam[2], 22, ship.q, 0, 3, 0.5, lightAt(abs[0], abs[1], abs[2], ship.ref), ship.thrust);
    for (let k = 0; k < nAst; k++) { // far belt: elements in f64 → camera-relative
      const o = k * 8, a = astr[o], M = astr[o + 1] + simT * astr[o + 2], x = a * Math.cos(M), z = a * Math.sin(M), y = astr[o + 3] + z * astr[o + 6] * 0.05;
      const rx = x - cam[0], ry = y - cam[1], rz = z - cam[2];
      qaxis(tq, 0, 0.57735, 0.57735, 0.57735, astr[o + 7] + simT * 0.1 * astr[o + 5]); inst(rx, ry, rz, astr[o + 4], tq, 0, 0, astr[o + 5], lightAt(x, y, z, 0), 0);
    }
    if (sys.beltOut > 0) { // local field: deterministic rocks in a cell grid around the camera when inside the belt
      const CS = 26000, cx0 = Math.floor(cam[0] / CS), cy0 = Math.floor(cam[1] / CS), cz0 = Math.floor(cam[2] / CS);
      const rc = Math.hypot(cam[0], cam[2]);
      if (rc > sys.beltIn - 4 * CS && rc < sys.beltOut + 4 * CS && Math.abs(cam[1]) < sys.beltTh + 4 * CS)
        for (let ix = -5; ix <= 5; ix++) for (let iy = -2; iy <= 2; iy++) for (let iz = -5; iz <= 5; iz++) {
          const gx = cx0 + ix, gy = cy0 + iy, gz = cz0 + iz;
          for (let r = 0; r < 3; r++) {
            if (hash(gx, gy * 7 + r, gz) > 0.7) continue;
            const x = (gx + hash(gx, gy, gz * 3 + r)) * CS, y = (gy + hash(gx * 5 + r, gy, gz)) * CS, z = (gz + hash(gx, gy * 3 + r, gz * 2)) * CS, rr = Math.hypot(x, z);
            if (rr < sys.beltIn || rr > sys.beltOut || Math.abs(y) > sys.beltTh) continue;
            const sd = hash(gz, gx + r, gy); qaxis(tq, 0, 0.6, 0.64, 0.48, sd * 6.283 + simT * 0.15 * (sd - 0.5)); qnorm(tq, 0);
            inst(x - cam[0], y - cam[1], z - cam[2], 150 + 2400 * Math.pow(hash(gy, gz + r, gx), 3), tq, 0, 0, sd, lightAt(x, y, z, 0), 0);
          }
        }
    }
    nOpaque = ni; nTail = 0;
    for (let i = 1; i < sys.n; i++) { // comet tails (additive volumes; local +z points away from the star)
      const b = sys.list[i]; if (b.type !== 'comet') continue; const p = i * 3, r = Math.hypot(pos[p], pos[p + 1], pos[p + 2]);
      const len = Math.min(3e8, 4e17 / Math.max(r, 1e8)), act = Math.min(1.5, 0.15 + Math.pow(6e9 / r, 2));
      qlook(dq, 0, -pos[p], -pos[p + 1], -pos[p + 2], 0, 1, 0); // local -Z → star, so +Z = anti-sun
      inst(pos[p] + (pos[p] / r) * len - cam[0], pos[p + 1] + (pos[p + 1] / r) * len - cam[1], pos[p + 2] + (pos[p + 2] / r) * len - cam[2], len, dq, 0, 4, 0, act, 0); nTail++;
    }

    buildHud(dt, spd);
    const Q = device.queue;
    Q.writeBuffer(gBuf, 0, gF); Q.writeBuffer(bBuf, 0, bodyF, 0, sys.nSph * BSTR);
    if (ni) Q.writeBuffer(iBuf, 0, instF, 0, ni * ISTR); if (hn) Q.writeBuffer(hBuf, 0, hudF, 0, hn * HSTR);
    // ---- encode ----
    const enc = device.createCommandEncoder();
    let p = enc.beginRenderPass(sceneDesc);
    p.setBindGroup(0, bg0);
    p.setPipeline(skyP); p.draw(3);
    if (nOpaque) { p.setPipeline(sdfP); p.draw(36, nOpaque, 0, 0); }
    p.setPipeline(bodyP); for (let k = 0; k < nb; k++) p.draw(36, 1, 0, order[k]);
    if (nTail) { p.setPipeline(tailP); p.draw(36, nTail, 0, nOpaque); }
    p.end();
    const sc = outT || ctx.getCurrentTexture(); finalAtt.view = sc.createView();
    p = enc.beginRenderPass(finalDesc);
    p.setBindGroup(0, bg0); p.setBindGroup(1, bg1); p.setPipeline(postP); p.draw(3);
    if (hn) { p.setPipeline(hudP); p.draw(6, hn, 0, 0); }
    p.end();
    let cap = null; if (capReq && !capBusy) { cap = capReq; capReq = null; capBusy = true; const bpr = Math.ceil(W * 4 / 256) * 256; cap.bpr = bpr; cap.w = W; cap.h = H;
      cap.buf = buf(bpr * H, U.MAP_READ | U.COPY_DST); enc.copyTextureToBuffer({ texture: sc }, { buffer: cap.buf, bytesPerRow: bpr }, [W, H]); }
    const slot = bench.on ? Math.min(bench.n, NSLOT - 1) : 0;
    if (hasTS) enc.resolveQuerySet(qs, 0, 2, resBuf, slot * 256);
    const doRead = hasTS && !bench.on && !rdBusy && (frame % 30 === 0);
    if (doRead) enc.copyBufferToBuffer(resBuf, 0, rdBuf, 0, 16);
    cmdArr[0] = enc.finish(); Q.submit(cmdArr); frame++;
    if (opts.offscreen) Q.onSubmittedWorkDone().then(nextOff); // headless: no swapchain back-pressure
    if (cap) cap.buf.mapAsync(GPUMapMode.READ).then(() => { // screenshot readback (debug / user capture; allocates by design)
      const src = new Uint8Array(cap.buf.getMappedRange()), px = new Uint8ClampedArray(cap.w * cap.h * 4), bgra = fmt === 'bgra8unorm';
      for (let y = 0; y < cap.h; y++) for (let x = 0; x < cap.w; x++) { const i = y * cap.bpr + x * 4, o = (y * cap.w + x) * 4; px[o] = src[i + (bgra ? 2 : 0)]; px[o + 1] = src[i + 1]; px[o + 2] = src[i + (bgra ? 0 : 2)]; px[o + 3] = 255; }
      cap.buf.destroy(); capBusy = false; const c = new OffscreenCanvas(cap.w, cap.h); c.getContext('2d').putImageData(new ImageData(px, cap.w, cap.h), 0, 0);
      c.convertToBlob({ type: 'image/png' }).then((b) => { const r = new FileReader(); r.onload = () => cap.res(r.result); r.readAsDataURL(b); }); });
    if (doRead) { rdBusy = true; rdBuf.mapAsync(GPUMapMode.READ, 0, 16).then(onRead, onReadErr); }
  }
  const nextOff = () => { raf = requestAnimationFrame(tick); };
  const onRead = () => { const v = new BigUint64Array(rdBuf.getMappedRange(0, 16)); const d = Number(v[1] - v[0]) / 1e6; if (d > 0 && d < 1000) gpuMs += (d - gpuMs) * 0.3; rdBuf.unmap(); rdBusy = false; };
  const onReadErr = () => { rdBusy = false; };

  switchStarSystem(STAR_SYSTEMS[systemId] ? systemId : 'sol');
  resize(); raf = requestAnimationFrame(tick);

  const api = {
    switchStarSystem, startBenchmark: startBench,
    get benchmark() { return bench.res; }, get frame() { return frame; }, get stats() { return { benchT: bench.on ? bench.t : -1, instances: nOpaque, tails: nTail, hud: hn, cam: Array.from(cam) }; },
    capture: () => new Promise((res) => { capReq = { res }; }), // PNG data URL of the next frame
    setTarget: (id) => { if (sys.idx[id] !== undefined) target = sys.idx[id]; },
    teleport: (id, distRadii = 3, az, el, pitch) => { const i = sys.idx[id]; if (i !== undefined) { target = i; placeNear(i, distRadii, az, el, pitch); cruise = false; } },
    debugView: (id, dx, dy, dz, lx, ly, lz) => { const i = sys.idx[id]; if (i === undefined) return; const R = sys.list[i].R; ship.ref = i; ship.off[0] = dx * R; ship.off[1] = dy * R; ship.off[2] = dz * R; ship.vel.fill(0); ship.w.fill(0); cruise = false; qlook(ship.q, 0, lx === undefined ? -dx : lx, ly === undefined ? -dy : ly, lz === undefined ? -dz : lz, 0, 1, 0); },
    setTime: (t) => { simT = t; }, setExposure: (e) => { exposure = e; }, toggleThirdPerson: () => { thirdPerson = !thirdPerson; },
    destroy() {
      dead = true; cancelAnimationFrame(raf);
      window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); window.removeEventListener('mousemove', mm); canvas.removeEventListener('mousedown', md);
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      device.destroy();
    },
  };
  device.lost.then((i) => { if (!dead) console.error('[SpaceRoam] device lost:', i.reason, i.message); });
  return api;
}

/* ============================== REACT COMPONENT ============================== */
export default function SpaceRoam({ systemId = 'sol', onReady, style, offscreen = false }) {
  const ref = useRef(null), eng = useRef(null), [err, setErr] = useState(null);
  useEffect(() => {
    let dead = false, e = null;
    createEngine(ref.current, systemId, { offscreen }).then((x) => { if (dead) return x.destroy(); eng.current = e = x; onReady && onReady(x); }).catch((x) => setErr(String((x && x.message) || x)));
    return () => { dead = true; eng.current = null; e && e.destroy(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { eng.current && eng.current.switchStarSystem(systemId); }, [systemId]); // V2 interstellar hook
  if (err) return <div style={{ color: '#9cf', font: '16px monospace', padding: 24, background: '#000', height: '100%' }}>SpaceRoam: {err}</div>;
  return <canvas ref={ref} tabIndex={0} style={{ width: '100%', height: '100%', display: 'block', outline: 'none', cursor: 'crosshair', background: '#000', ...style }} />;
}
