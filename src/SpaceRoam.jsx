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
  scale: { radius: 1.2e6, radiusExp: 1, au: 4e9, auExp: 0.55, lightRef: 4e9, lightExp: 0.5 }, // real size ratios, compressed distances
  star: { id: 'sun', name: 'Sun', fact: 'Holds 99.8% of the Solar System\'s mass.', radius: 109, color: [1, 0.85, 0.66], intensity: 40, corona: 1 },
  spawn: { near: 'earth', dist: 3.2 },
  bodies: [
    { id: 'mercury', name: 'Mercury', fact: 'A day on Mercury lasts longer than its year.', type: 'planet', radius: 0.383, orbit: { au: 0.39, period: 700, inc: 7, phase: 1.1 }, spin: { period: 900, tilt: 0.03 },
      surface: { c: [[0.45, 0.42, 0.39], [0.3, 0.29, 0.28], 0, 0, 0], scale: 2.2, height: 0.003, craters: 0.6, craterScale: 9, mix: 0.7, seed: 3 } },
    { id: 'venus', name: 'Venus', fact: 'Hot enough at the surface to melt lead.', type: 'planet', radius: 0.95, orbit: { au: 0.72, period: 1100, inc: 3.4, phase: 2.6 }, spin: { period: -2000, tilt: 177 },
      surface: { gas: 1, c: [[0.9, 0.78, 0.52], [0.72, 0.6, 0.38], 0, [0.95, 0.9, 0.75], 0], bands: { amt: 0.35, freq: 7, turb: 4, speed: 0.004 } },
      atmosphere: { height: 0.05, rayleigh: [0.25, 0.2, 0.1], mie: 0.35, g: 0.7 } },
    { id: 'earth', name: 'Earth', fact: 'The only known world with life - and with you.', type: 'planet', radius: 1, orbit: { au: 1, period: 1500, phase: 0.4 }, spin: { period: 600, tilt: 23.4 },
      surface: { c: [[0.07, 0.15, 0.04], [0.33, 0.26, 0.15], [0.004, 0.025, 0.08], [0.85, 0.88, 0.93], 0], ocean: 0.03, scale: 1.7, height: 0.006, mix: 0.35, caps: 0.86, lights: 1, specular: 1, seed: 7, maps: 'earth' },
      atmosphere: { height: 0.025, rayleigh: [0.058, 0.135, 0.33], mie: 0.025, g: 0.8, clouds: 0.38, cloudHeight: 0.0035, cloudSpeed: 0.02 } },
    { id: 'luna', name: 'Luna', fact: 'Always shows the same face to Earth.', type: 'moon', parent: 'earth', radius: 0.273, orbit: { pr: 14, period: 400, inc: 5, phase: 2 }, spin: { period: 400, tilt: 1.5 },
      surface: { c: [[0.44, 0.43, 0.42], [0.17, 0.17, 0.18], 0, 0, 0], scale: 1.6, height: 0.003, craters: 0.55, craterScale: 8, mix: 1.8, seed: 11, maps: 'moon' } },
    { id: 'gateway', name: 'Gateway Station', fact: 'Humanity\'s first deep-space harbour.', type: 'station', parent: 'earth', size: 1500, orbit: { pr: 1.45, period: 900, inc: 12, phase: 0.2 } },
    { id: 'mars', name: 'Mars', fact: 'Home to Olympus Mons, 2.5x taller than Everest.', type: 'planet', radius: 0.532, orbit: { au: 1.52, period: 2100, inc: 1.8, phase: 4.1 }, spin: { period: 620, tilt: 25 },
      surface: { c: [[0.46, 0.18, 0.07], [0.24, 0.11, 0.06], 0, [0.92, 0.9, 0.86], 0], scale: 2, height: 0.007, craters: 0.35, craterScale: 7, mix: 1.1, caps: 0.9, seed: 5, maps: 'mars' },
      atmosphere: { height: 0.018, rayleigh: [0.05, 0.03, 0.018], mie: 0.04, g: 0.65 } },
    { id: 'ares', name: 'Ares Ring', fact: 'Built from asteroid iron hauled in from the belt.', type: 'station', parent: 'mars', size: 1200, orbit: { pr: 1.6, period: 800, inc: 25, phase: 3 } },
    { id: 'belt', type: 'belt', inner: 2.2, outer: 3.3, count: 2000, thickness: 0.035, color: [0.36, 0.32, 0.28] },
    { id: 'jupiter', name: 'Jupiter', fact: 'Its Great Red Spot is wider than Earth.', type: 'planet', radius: 11.2, orbit: { au: 5.2, period: 4200, inc: 1.3, phase: 5.3 }, spin: { period: 260, tilt: 3.1 },
      surface: { gas: 1, c: [[0.82, 0.72, 0.57], [0.52, 0.33, 0.2], 0, [0.93, 0.88, 0.78], [0.72, 0.27, 0.13]], bands: { amt: 1, freq: 19, turb: 2.4, speed: 0.01 }, spot: { lat: -22, lon: 40, size: 0.13, amt: 1 } },
      atmosphere: { height: 0.012, rayleigh: [0.03, 0.05, 0.09], mie: 0.02, g: 0.7 } },
    { id: 'io', name: 'Io', fact: 'The most volcanic body in the Solar System.', type: 'moon', parent: 'jupiter', radius: 0.286, orbit: { pr: 4.2, period: 300, phase: 1 }, spin: { period: 300 },
      surface: { c: [[0.86, 0.78, 0.36], [0.78, 0.55, 0.24], 0, 0, [0.22, 0.1, 0.04]], scale: 2, height: 0.002, accent: -1, mix: 0.8, seed: 2 } },
    { id: 'europa', name: 'Europa', fact: 'An ocean of liquid water hides under the ice.', type: 'moon', parent: 'jupiter', radius: 0.245, orbit: { pr: 6.2, period: 480, phase: 3.3 }, spin: { period: 480 },
      surface: { c: [[0.84, 0.8, 0.72], [0.7, 0.62, 0.5], 0, 0, [0.42, 0.22, 0.1]], scale: 1.5, height: 0.0008, accent: 0.9, craters: 0.05, craterScale: 6, mix: 0.6, seed: 9 } },
    { id: 'ganymede', name: 'Ganymede', fact: 'The largest moon - bigger than Mercury.', type: 'moon', parent: 'jupiter', radius: 0.413, orbit: { pr: 9, period: 760, phase: 5 }, spin: { period: 760 },
      surface: { c: [[0.52, 0.48, 0.43], [0.3, 0.27, 0.24], 0, 0, [0.62, 0.6, 0.57]], scale: 1.8, height: 0.002, accent: 0.4, craters: 0.4, craterScale: 8, mix: 1.2, seed: 13 } },
    { id: 'jovian', name: 'Jovian Relay', fact: 'Relays signals from the outer system to Earth.', type: 'station', parent: 'jupiter', size: 1800, orbit: { pr: 2.2, period: 900, inc: 8, phase: 4 } },
    { id: 'saturn', name: 'Saturn', fact: 'Light enough to float in a giant bathtub.', type: 'planet', radius: 9.45, orbit: { au: 9.5, period: 6000, inc: 2.5, phase: 0.9 }, spin: { period: 280, tilt: 26.7 },
      surface: { gas: 1, c: [[0.86, 0.77, 0.56], [0.68, 0.56, 0.36], 0, [0.92, 0.86, 0.68], 0], bands: { amt: 0.6, freq: 24, turb: 1.3, speed: 0.008 } },
      atmosphere: { height: 0.012, rayleigh: [0.04, 0.05, 0.07], mie: 0.03, g: 0.7 },
      rings: { inner: 1.24, outer: 2.27, opacity: 0.95, color: [0.86, 0.79, 0.66] } },
    { id: 'titan', name: 'Titan', fact: 'Rains liquid methane onto hydrocarbon seas.', type: 'moon', parent: 'saturn', radius: 0.404, orbit: { pr: 9.5, period: 900, inc: 0.3, phase: 2.2 }, spin: { period: 900 },
      surface: { c: [[0.5, 0.36, 0.16], [0.36, 0.26, 0.12], 0, 0, 0], scale: 1.5, height: 0.002, mix: 1, seed: 4 },
      atmosphere: { height: 0.12, rayleigh: [0.3, 0.17, 0.06], mie: 0.6, g: 0.72 } },
    { id: 'cassini', name: 'Cassini Hub', fact: 'Named for the probe that dove into Saturn.', type: 'station', parent: 'saturn', size: 2000, orbit: { pr: 2.9, period: 1200, inc: 26.7, phase: 1.5 } },
    { id: 'uranus', name: 'Uranus', fact: 'Rolls around the Sun tipped on its side.', type: 'planet', radius: 4.0, orbit: { au: 19.2, period: 8000, inc: 0.8, phase: 3.7 }, spin: { period: -340, tilt: 97.8 },
      surface: { gas: 1, c: [[0.6, 0.84, 0.88], [0.52, 0.77, 0.83], 0, [0.7, 0.9, 0.92], 0], bands: { amt: 0.12, freq: 14, turb: 0.8, speed: 0.006 } },
      atmosphere: { height: 0.03, rayleigh: [0.02, 0.05, 0.06], mie: 0.01, g: 0.7 },
      rings: { inner: 1.65, outer: 2.0, opacity: 0.22, color: [0.6, 0.6, 0.62] } },
    { id: 'neptune', name: 'Neptune', fact: 'Winds here top 2,000 km/h.', type: 'planet', radius: 3.88, orbit: { au: 30, period: 10000, inc: 1.8, phase: 5.9 }, spin: { period: 320, tilt: 28 },
      surface: { gas: 1, c: [[0.26, 0.44, 0.88], [0.18, 0.32, 0.76], 0, [0.6, 0.75, 0.95], [0.08, 0.13, 0.38]], bands: { amt: 0.35, freq: 12, turb: 1.5, speed: 0.012 }, spot: { lat: -20, lon: 120, size: 0.09, amt: 0.9 } },
      atmosphere: { height: 0.03, rayleigh: [0.02, 0.05, 0.1], mie: 0.01, g: 0.7 } },
    { id: 'triton', name: 'Triton', fact: 'Orbits backwards - a captured dwarf planet.', type: 'moon', parent: 'neptune', radius: 0.212, orbit: { pr: 8, period: 600, inc: 157, phase: 1 }, spin: { period: 600 },
      surface: { c: [[0.76, 0.72, 0.69], [0.62, 0.5, 0.45], 0, [0.85, 0.8, 0.78], 0], scale: 1.8, height: 0.0015, craters: 0.15, craterScale: 7, caps: 0.6, mix: 1, seed: 21 } },
    { id: 'vesper', name: 'Comet Vesper', fact: 'A dirty snowball older than the planets.', type: 'comet', size: 4000, orbit: { au: 9, ecc: 0.86, period: 1400, inc: 18, node: 40, phase: 5.8 } },
  ],
});

// A second, fictional system proves the data-driven path for V2 (press J in-game).
registerStarSystem({
  id: 'kestrel', name: 'Kestrel (V2 demo)',
  scale: { radius: 1.2e6, radiusExp: 0.75, au: 4e9, auExp: 0.55, lightRef: 2.5e9, lightExp: 0.5 },
  star: { id: 'kestrel-a', name: 'Kestrel A', fact: 'A small, stubborn red dwarf.', radius: 60, color: [1, 0.55, 0.32], intensity: 30, corona: 1.4 },
  spawn: { near: 'kestrel-c', dist: 3.5 },
  bodies: [
    { id: 'kestrel-b', name: 'Kestrel b', fact: 'Tidally locked; its day side never cools.', type: 'planet', radius: 0.7, orbit: { au: 0.3, period: 500, phase: 1 }, spin: { period: 500, tilt: 2 },
      surface: { c: [[0.12, 0.1, 0.09], [0.05, 0.04, 0.04], 0, 0, [0.6, 0.12, 0.02]], scale: 2.4, height: 0.004, accent: -1.5, craters: 0.3, craterScale: 6, mix: 1, seed: 31 } },
    { id: 'kestrel-c', name: 'Kestrel c', fact: 'An ocean world under a red sun.', type: 'planet', radius: 1.3, orbit: { au: 0.8, period: 1200, phase: 2 }, spin: { period: 500, tilt: 12 },
      surface: { c: [[0.12, 0.2, 0.08], [0.5, 0.45, 0.4], [0.01, 0.05, 0.07], [0.9, 0.92, 0.95], 0], ocean: 0.25, scale: 2.5, height: 0.005, mix: 0.6, caps: 0.8, specular: 1, seed: 17 },
      atmosphere: { height: 0.03, rayleigh: [0.1, 0.12, 0.2], mie: 0.04, g: 0.8, clouds: 0.7, cloudHeight: 0.004, cloudSpeed: 0.03 } },
    { id: 'kestrel-port', name: 'Kestrel Port', fact: 'The first human outpost beyond Sol.', type: 'station', parent: 'kestrel-c', size: 1600, orbit: { pr: 1.5, period: 900 } },
    { id: 'kestrel-d', name: 'Kestrel d', fact: 'Its rings glitter in the dim red light.', type: 'planet', radius: 8, orbit: { au: 3, period: 3000, phase: 4 }, spin: { period: 300, tilt: 15 },
      surface: { gas: 1, c: [[0.75, 0.55, 0.62], [0.42, 0.3, 0.45], 0, [0.9, 0.8, 0.85], [0.95, 0.85, 0.5]], bands: { amt: 0.9, freq: 15, turb: 3, speed: 0.01 }, spot: { lat: 30, lon: 0, size: 0.1, amt: 0.8 } },
      atmosphere: { height: 0.015, rayleigh: [0.05, 0.04, 0.08], mie: 0.02, g: 0.7 },
      rings: { inner: 1.4, outer: 2.6, opacity: 0.7, color: [0.7, 0.75, 0.85] } },
  ],
});

// ---- landmarks: Name|lat|lon|kind|rank|elevation(m). kind: c city, m mountain, s sea, o ocean, x feature, l landing site. ASCII names (HUD atlas).
export const PLACES = {
  earth: 'Stockholm|59.33|18.07|c|1;Gothenburg|57.71|11.97|c|2;Malmo|55.6|13|c|3;Oslo|59.91|10.75|c|1;Bergen|60.39|5.32|c|2;Copenhagen|55.68|12.57|c|1;Aarhus|56.16|10.2|c|3;Helsinki|60.17|24.94|c|1;Tampere|61.5|23.76|c|3;Reykjavik|64.15|-21.94|c|2;' +
    'London|51.51|-0.13|c|1;Manchester|53.48|-2.24|c|2;Birmingham|52.48|-1.9|c|3;Edinburgh|55.95|-3.19|c|2;Dublin|53.35|-6.26|c|1;Paris|48.86|2.35|c|1;Marseille|43.3|5.37|c|2;Lyon|45.76|4.84|c|2;Madrid|40.42|-3.7|c|1;Barcelona|41.39|2.17|c|1;Valencia|39.47|-0.38|c|3;' +
    'Lisbon|38.72|-9.14|c|1;Porto|41.15|-8.61|c|2;Berlin|52.52|13.4|c|1;Hamburg|53.55|9.99|c|2;Munich|48.14|11.58|c|2;Amsterdam|52.37|4.9|c|1;Rotterdam|51.92|4.48|c|3;Brussels|50.85|4.35|c|1;Antwerp|51.22|4.4|c|3;Luxembourg|49.61|6.13|c|3;' +
    'Zurich|47.38|8.54|c|2;Bern|46.95|7.45|c|2;Geneva|46.2|6.14|c|2;Vienna|48.21|16.37|c|1;Graz|47.07|15.44|c|3;Rome|41.9|12.5|c|1;Milan|45.46|9.19|c|1;Naples|40.85|14.27|c|2;Athens|37.98|23.73|c|1;Thessaloniki|40.64|22.94|c|2;' +
    'Warsaw|52.23|21.01|c|1;Krakow|50.06|19.94|c|2;Prague|50.08|14.44|c|1;Brno|49.2|16.61|c|3;Bratislava|48.15|17.11|c|2;Budapest|47.5|19.04|c|1;Bucharest|44.43|26.1|c|1;Cluj-Napoca|46.77|23.6|c|3;Sofia|42.7|23.32|c|1;Belgrade|44.79|20.45|c|1;' +
    'Zagreb|45.81|15.98|c|2;Split|43.51|16.44|c|3;Ljubljana|46.06|14.51|c|2;Sarajevo|43.86|18.41|c|2;Podgorica|42.44|19.26|c|3;Tirana|41.33|19.82|c|2;Skopje|42|21.43|c|2;Pristina|42.66|21.17|c|3;Tallinn|59.44|24.75|c|2;Riga|56.95|24.11|c|2;Vilnius|54.69|25.28|c|2;' +
    'Kyiv|50.45|30.52|c|1;Kharkiv|49.99|36.23|c|2;Odesa|46.48|30.73|c|2;Minsk|53.9|27.57|c|1;Chisinau|47.01|28.86|c|2;Moscow|55.76|37.62|c|1;Saint Petersburg|59.93|30.34|c|1;Istanbul|41.01|28.98|c|1;Ankara|39.93|32.86|c|1;Valletta|35.9|14.51|c|3;Nicosia|35.17|33.36|c|3;' +
    'New York|40.71|-74.01|c|1;Washington|38.91|-77.04|c|2;Chicago|41.88|-87.63|c|1;Los Angeles|34.05|-118.24|c|1;San Francisco|37.77|-122.42|c|2;Toronto|43.65|-79.38|c|1;Mexico City|19.43|-99.13|c|1;Bogota|4.71|-74.07|c|2;Lima|-12.05|-77.04|c|2;' +
    'Sao Paulo|-23.55|-46.63|c|1;Rio de Janeiro|-22.91|-43.17|c|1;Buenos Aires|-34.6|-58.38|c|1;Cairo|30.04|31.24|c|1;Lagos|6.52|3.38|c|1;Nairobi|-1.29|36.82|c|2;Johannesburg|-26.2|28.05|c|1;Cape Town|-33.92|18.42|c|2;Dubai|25.2|55.27|c|1;Tehran|35.69|51.39|c|2;' +
    'Delhi|28.61|77.21|c|1;Mumbai|19.08|72.88|c|1;Beijing|39.9|116.41|c|1;Shanghai|31.23|121.47|c|1;Hong Kong|22.32|114.17|c|2;Tokyo|35.68|139.69|c|1;Seoul|37.57|126.98|c|1;Bangkok|13.76|100.5|c|2;Singapore|1.35|103.82|c|1;Jakarta|-6.21|106.85|c|2;' +
    'Sydney|-33.87|151.21|c|1;Melbourne|-37.81|144.96|c|2;Auckland|-36.85|174.76|c|2;' +
    'Mont Blanc|45.83|6.86|m|1|4806;Matterhorn|45.98|7.66|m|1|4478;Kebnekaise|67.9|18.52|m|2|2097;Galdhopiggen|61.64|8.31|m|2|2469;Ben Nevis|56.8|-5|m|2|1345;Etna|37.75|14.99|m|1|3357;Vesuvius|40.82|14.43|m|2|1281;Mount Olympus|40.09|22.36|m|2|2917;' +
    'Elbrus|43.35|42.44|m|1|5642;Zugspitze|47.42|10.99|m|2|2962;Grossglockner|47.07|12.69|m|2|3798;Teide|28.27|-16.64|m|2|3715;Mount Everest|27.99|86.93|m|1|8849;K2|35.88|76.51|m|1|8611;Kilimanjaro|-3.07|37.35|m|1|5895;Denali|63.07|-151.01|m|1|6190;' +
    'Aconcagua|-32.65|-70.01|m|1|6961;Mount Fuji|35.36|138.73|m|1|3776;Grand Canyon|36.1|-112.1|x|1;Sahara|23|13|s|1;Amazon Rainforest|-3|-60|s|1;Himalaya|28.5|84|s|1;The Alps|46.5|9.5|s|1;' +
    'Atlantic Ocean|30|-40|o|1;Pacific Ocean|0|-150|o|1;Indian Ocean|-20|80|o|1;Arctic Ocean|86|0|o|1;Southern Ocean|-62|20|o|1;Mediterranean Sea|35|18|s|1;Baltic Sea|58|20|s|1;North Sea|56|3|s|1;Black Sea|43|35|s|1;Norwegian Sea|68|3|s|1;' +
    'Caspian Sea|42|51|s|1;Red Sea|20|38|s|1;Adriatic Sea|43|15|s|2;Aegean Sea|39|25|s|2;English Channel|50.2|-1|s|2;Bay of Biscay|45|-5|s|2;Gulf of Bothnia|62|20|s|2;Caribbean Sea|15|-75|s|1',
  luna: 'Apollo 11|0.67|23.47|l|1;Apollo 12|-3.01|-23.42|l|2;Apollo 14|-3.65|-17.47|l|2;Apollo 15|26.13|3.63|l|2;Apollo 16|-8.97|15.5|l|2;Apollo 17|20.19|30.77|l|2;Tycho|-43.31|-11.36|x|1;Copernicus|9.62|-20.08|x|1;Kepler|8.12|-38.01|x|2;' +
    'Aristarchus|23.7|-47.4|x|2;Plato|51.6|-9.4|x|2;Clavius|-58.4|-14.4|x|2;Sea of Tranquility|8.5|31.4|s|1;Sea of Serenity|28|17.5|s|1;Sea of Rains|32.8|-15.6|s|1;Ocean of Storms|18.4|-57.4|s|1;Sea of Crises|17|59.1|s|1;Sea of Clouds|-21.3|-16.6|s|2;' +
    'Apennine Mountains|18.9|-3.7|x|2;Lunar South Pole|-89|0|x|1;Tsiolkovskiy|-20.4|129.1|x|2;Mare Orientale|-19.4|-92.8|s|2',
  mars: 'Olympus Mons|18.65|-133.8|x|1;Valles Marineris|-13.9|-59.2|s|1;Gale Crater (Curiosity)|-5.4|137.8|l|1;Jezero (Perseverance)|18.44|77.45|l|1;Viking 1|22.27|-47.95|l|2;Opportunity|-1.95|-5.53|l|2;Zhurong|25.1|109.9|l|2;' +
    'Hellas Basin|-42.4|70.5|s|1;Tharsis Volcanoes|1.57|-112.58|s|1;Elysium Mons|25.02|147.21|x|2;North Polar Cap|87|0|s|1;Syrtis Major|8.4|69.5|s|2',
};
// ---- star catalogue: id|Name|RA deg|Dec deg|distance ly|class|radius (Sun=1)|fact|known planets (name:au:radius Earth:r|g, comma separated)
export const STARS = ('sol|Sol|0|0|0|G|1|Home.|;' +
  'proxima|Proxima Centauri|217.43|-62.68|4.24|M|0.15|The closest star to the Sun.|Proxima d:0.029:0.8:r,Proxima b:0.0485:1.07:r;' +
  'alphacen|Alpha Centauri A|219.9|-60.83|4.37|G|1.22|A near twin of the Sun, 4.4 light-years away.|;' +
  'barnard|Barnards Star|269.45|4.69|5.96|M|0.19|The fastest-moving star across our sky.|;' +
  'wolf359|Wolf 359|164.12|7.01|7.86|M|0.16|A faint, flaring red dwarf.|;' +
  'sirius|Sirius|101.29|-16.72|8.6|A|1.71|The brightest star in Earths night sky.|;' +
  'eeri|Epsilon Eridani|53.23|-9.46|10.5|K|0.74|A young star wrapped in dust belts.|Epsilon Eridani b:3.5:11:g;' +
  'ross128|Ross 128|176.94|0.8|11|M|0.2|A quiet red dwarf with a temperate world.|Ross 128 b:0.05:1.1:r;' +
  'procyon|Procyon|114.83|5.22|11.5|F|2.05|The Little Dog star, with a white dwarf companion.|;' +
  'tauceti|Tau Ceti|26.02|-15.94|11.9|G|0.79|A calm, Sun-like neighbour.|;' +
  'altair|Altair|297.7|8.87|16.7|A|1.8|Spins so fast it bulges at the equator.|;' +
  'gl581|Gliese 581|229.86|-7.72|20.5|M|0.3|A red dwarf with a family of super-Earths.|Gliese 581 e:0.029:1.3:r,Gliese 581 b:0.041:4:g,Gliese 581 c:0.073:1.6:r;' +
  'vega|Vega|279.23|38.78|25|A|2.4|Once the pole star, and will be again.|;' +
  'fomalhaut|Fomalhaut|344.41|-29.62|25|A|1.84|Ringed by a vast belt of icy debris.|;' +
  'pollux|Pollux|116.33|28.03|33.8|K|8.8|An orange giant with a giant planet.|;' +
  'arcturus|Arcturus|213.92|19.18|36.7|K|25.4|An old orange giant, brightest in the north.|;' +
  'trappist1|TRAPPIST-1|346.62|-5.04|40.7|M|0.12|Seven Earth-sized worlds around a tiny star.|TRAPPIST-1 b:0.0115:1.12:r,TRAPPIST-1 c:0.0158:1.1:r,TRAPPIST-1 d:0.0223:0.79:r,TRAPPIST-1 e:0.0293:0.92:r,TRAPPIST-1 f:0.0385:1.05:r,TRAPPIST-1 g:0.0469:1.13:r,TRAPPIST-1 h:0.0619:0.76:r;' +
  'capella|Capella|79.17|46|42.9|G|12|Four stars posing as one.|;' +
  '51peg|51 Pegasi|344.37|20.77|50.6|G|1.15|Home of the first planet found around a Sun-like star.|51 Pegasi b:0.052:11:g;' +
  'aldebaran|Aldebaran|68.98|16.51|65|K|44|The red eye of Taurus.|;' +
  'regulus|Regulus|152.09|11.97|79|B|3.1|The heart of the Lion.|;' +
  'spica|Spica|201.3|-11.16|250|B|7.5|A hot blue binary in Virgo.|;' +
  'canopus|Canopus|95.99|-52.7|310|F|71|The second-brightest star in the sky.|;' +
  'polaris|Polaris|37.95|89.26|433|F|37.5|The North Star.|;' +
  'betelgeuse|Betelgeuse|88.79|7.41|550|M|500|A red supergiant that will one day explode.|;' +
  'antares|Antares|247.35|-26.43|550|M|500|A red supergiant, rival of Mars.|;' +
  'rigel|Rigel|78.63|-8.2|860|B|79|A blue supergiant, Orions brightest.|;' +
  'kepler452|Kepler-452|296|44.28|1800|G|1.1|Its planet is often called Earths cousin.|Kepler-452 b:1.05:1.6:r;' +
  'deneb|Deneb|310.36|45.28|2600|A|200|One of the most luminous stars known.|').split(';').map((e) => { const f = e.split('|'), K = Math.PI / 180, ra = +f[2] * K, de = +f[3] * K, ob = 23.44 * K;
    const x = Math.cos(de) * Math.cos(ra), y = Math.cos(de) * Math.sin(ra), z = Math.sin(de), ye = y * Math.cos(ob) + z * Math.sin(ob), ze = -y * Math.sin(ob) + z * Math.cos(ob);
    return { id: f[0], name: f[1], ly: +f[4], cls: f[5], rad: +f[6], fact: f[7], planets: f[8], p: [x * +f[4], ze * +f[4], -ye * +f[4]] }; }); // ecliptic frame, game y = ecliptic north
// ---- reference frames. Game frame = ecliptic J2000 with y = ecliptic north (game x = equinox, game z = -ecliptic y).
const OBL = 23.4393 * Math.PI / 180;
const eq2game = (v) => [v[0], -v[1] * Math.sin(OBL) + v[2] * Math.cos(OBL), -(v[1] * Math.cos(OBL) + v[2] * Math.sin(OBL))];
const GXB = [[-0.0548755604, -0.8734370902, -0.4838350155], [0.4941094279, -0.44482963, 0.7469822445], [-0.867666149, -0.1980763734, 0.4559837762]]; // galactic l=0, l=90, NGP in equatorial J2000
const gal2game = (v) => eq2game([0, 1, 2].map((k) => v[0] * GXB[0][k] - v[2] * GXB[1][k] + v[1] * GXB[2][k])); // galaxy frame (x to GC, y = NGP, -z = l90) -> game
const GM = [gal2game([1, 0, 0]), gal2game([0, 1, 0]), gal2game([0, 0, 1])]; // columns of galaxy->game
const toGame = (v) => [0, 1, 2].map((k) => v[0] * GM[0][k] + v[1] * GM[1][k] + v[2] * GM[2][k]);
const toGal = (v) => GM.map((c) => c[0] * v[0] + c[1] * v[1] + c[2] * v[2]);
const eqv = (ra, de) => { const K = Math.PI / 180; return [Math.cos(de * K) * Math.cos(ra * K), Math.cos(de * K) * Math.sin(ra * K), Math.sin(de * K)]; };
const diskN = (ra, de, pa, inc) => { const K = Math.PI / 180, d = eqv(ra, de), N = [-Math.sin(de * K) * Math.cos(ra * K), -Math.sin(de * K) * Math.sin(ra * K), Math.cos(de * K)], E = [-Math.sin(ra * K), Math.cos(ra * K), 0];
  const m = [0, 1, 2].map((k) => Math.cos(pa * K) * N[k] + Math.sin(pa * K) * E[k]), c = [m[1] * d[2] - m[2] * d[1], m[2] * d[0] - m[0] * d[2], m[0] * d[1] - m[1] * d[0]];
  return toGal(eq2game([0, 1, 2].map((k) => Math.cos(inc * K) * d[k] + Math.sin(inc * K) * c[k]))); }; // real disk orientation from position angle + inclination
// ---- Local Group: galactic l/b + distance from the Sun -> galaxy-frame positions (ly). Sun sits 26,000 ly from the Milky Way's centre.
const SUN_G = [-26000, 65, 0];
const gdir = (l, b) => { const K = Math.PI / 180; return [Math.cos(b * K) * Math.cos(l * K), Math.sin(b * K), -Math.cos(b * K) * Math.sin(l * K)]; };
const gnorm = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return v.map((x) => x / l); };
export const GALAXIES = [ // id, name, l, b, distance ly, radius ly, arm pitch (0 = irregular), inclination to our line of sight, fact, arrival star name
  ['milkyway', 'Milky Way', 0, 0, 0, 52000, 0.22, 0, 'Our home: a barred spiral of some 200 billion stars.', 'Sol'],
  ['lmc', 'Large Magellanic Cloud', 280.5, -32.9, 163000, 7000, 0, [80.89, -69.76, 170, 35], 'A satellite galaxy, visible to the naked eye from the south.', 'Tarantula Reach'],
  ['smc', 'Small Magellanic Cloud', 302.8, -44.3, 203000, 3500, 0, [13.19, -72.83, 45, 60], 'A small irregular galaxy torn by the Milky Way and the LMC.', 'Hydri Drift'],
  ['m31', 'Andromeda Galaxy', 121.2, -21.6, 2540000, 110000, 0.2, [10.685, 41.269, 38, 77], 'The nearest large galaxy; it will merge with ours in about 4.5 billion years.', 'Andromeda Prime'],
  ['m33', 'Triangulum Galaxy', 133.6, -31.3, 2730000, 30000, 0.32, [23.462, 30.66, 23, 55], 'A loose spiral and the third-largest member of the Local Group.', 'Triangulum Vane'],
].map(([id, name, l, b, d, R, pitch, ori, fact, sn]) => {
  const dir = gdir(l, b), p = id === 'milkyway' ? [0, 0, 0] : [SUN_G[0] + dir[0] * d, SUN_G[1] + dir[1] * d, SUN_G[2] + dir[2] * d];
  const n = ori ? gnorm(diskN(...ori)) : [0, 1, 0];
  return { id, name, p, n, R, pitch, fact, sn, ly: d };
});
const f3 = (v) => v.map((x) => (+x).toFixed(3)).join(',');
const GX_WGSL = `fn gxAll(ro:vec3f,rd:vec3f,sky:f32)->vec3f{var e=vec3f(0.);
${GALAXIES.map((G) => `{let c=vec3f(${f3(G.p)});let v=c-ro;let dl=length(v);if(sky<.5||(dl>${(G.R * 1.6).toFixed(1)}&&dot(rd,v/dl)>cos(atan(${(G.R * 1.3).toFixed(1)}/dl)))){e+=gxDisk(ro,rd,c,vec3f(${f3(G.n)}),${G.R.toFixed(1)},${G.pitch.toFixed(3)});}}`).join('')}
return e;}`;
GALAXIES.slice(1).forEach((G) => STARS.push({ id: G.id, name: G.name, ly: G.ly, cls: 'G', rad: 1, fact: G.fact, planets: '', sn: G.sn, gal: 1, p: toGame([G.p[0] - SUN_G[0], G.p[1] - SUN_G[1], G.p[2] - SUN_G[2]]) }));
const GXM_W = `const GXM=mat3x3f(${GM.map((c, i) => f3([GM[0][i], GM[1][i], GM[2][i]])).join(',')});const GNP=vec3f(${f3(GM[1])});const GCD=vec3f(${f3(GM[0])});`; // game->galaxy rotation, real galactic pole + centre for the sky band
const SCOL = { O: [0.62, 0.72, 1], B: [0.7, 0.8, 1], A: [0.86, 0.9, 1], F: [1, 0.96, 0.88], G: [1, 0.85, 0.66], K: [1, 0.7, 0.45], M: [1, 0.5, 0.3] };
const ROCKY = [ // generated-world palettes
  { c: [[0.55, 0.4, 0.25], [0.35, 0.24, 0.15], 0, 0, 0], craters: 0.3, craterScale: 7, mix: 1.1, height: 0.005 },
  { c: [[0.85, 0.88, 0.92], [0.6, 0.66, 0.75], 0, 0, 0], craters: 0.25, craterScale: 8, mix: 0.9, height: 0.003 },
  { c: [[0.12, 0.1, 0.09], [0.05, 0.04, 0.04], 0, 0, [0.6, 0.12, 0.02]], accent: -1.5, craters: 0.3, craterScale: 6, mix: 1, height: 0.004 },
  { c: [[0.12, 0.2, 0.08], [0.5, 0.45, 0.4], [0.01, 0.05, 0.07], [0.9, 0.92, 0.95], 0], ocean: 0.25, mix: 0.6, caps: 0.8, specular: 1, height: 0.005, atm: 1 },
  { c: [[0.44, 0.43, 0.42], [0.17, 0.17, 0.18], 0, 0, 0], craters: 0.55, craterScale: 8, mix: 1.8, height: 0.003 },
  { c: [[0.46, 0.18, 0.07], [0.24, 0.11, 0.06], 0, [0.92, 0.9, 0.86], 0], craters: 0.35, craterScale: 7, mix: 1.1, caps: 0.9, height: 0.007, atm: 2 }];
const GAS = [[[0.82, 0.72, 0.57], [0.52, 0.33, 0.2], 0, [0.93, 0.88, 0.78], [0.72, 0.27, 0.13]], [[0.5, 0.65, 0.85], [0.25, 0.38, 0.6], 0, [0.8, 0.88, 0.95], 0],
  [[0.55, 0.8, 0.78], [0.3, 0.5, 0.52], 0, [0.85, 0.95, 0.93], 0], [[0.75, 0.55, 0.62], [0.42, 0.3, 0.45], 0, [0.9, 0.8, 0.85], [0.95, 0.85, 0.5]]];
function starDef(st) { // a full star-system definition: real planets where known, otherwise generated (seeded by the star's name, so it never changes)
  let h = 2166136261; for (const ch of st.id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); const rnd = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296;
  const sr = 109 * st.rad, rm = 1.2e6 * sr, amin = Math.pow((5 * rm) / 4e9, 1 / 0.55), bodies = [], N = (s) => (st.sn || st.name) + ' ' + s;
  const addPlanet = (id, name, au, r, gas, fact) => { const k = bodies.length, per = Math.max(240, 1500 * Math.pow(au / Math.max(amin, 0.01), 0.4) * (0.6 + rnd()));
    const b = { id, name, fact, type: 'planet', radius: r, orbit: { au, period: per, phase: rnd() * 6.28, inc: (rnd() - 0.5) * 6 }, spin: { period: 300 + rnd() * 600, tilt: rnd() * 30 } };
    if (gas) { b.surface = { gas: 1, c: GAS[Math.floor(rnd() * GAS.length)], bands: { amt: 0.6 + rnd() * 0.4, freq: 10 + rnd() * 12, turb: 2 + rnd() * 2, speed: 0.01 } };
      if (rnd() < 0.5) b.surface.spot = { lat: (rnd() - 0.5) * 60, lon: rnd() * 360, size: 0.08 + rnd() * 0.06, amt: 0.8 }; b.atmosphere = { height: 0.014, rayleigh: [0.04, 0.05, 0.08], mie: 0.02, g: 0.7 };
      if (rnd() < 0.35) b.rings = { inner: 1.35, outer: 2.1 + rnd() * 0.6, opacity: 0.6, color: [0.75, 0.72, 0.68] }; }
    else { const P = ROCKY[Math.floor(rnd() * ROCKY.length)]; b.surface = { ...P, scale: 1.6 + rnd() * 1.2, seed: Math.floor(rnd() * 90) }; delete b.surface.atm;
      if (P.atm === 1) b.atmosphere = { height: 0.03, rayleigh: [0.06, 0.13, 0.3], mie: 0.03, g: 0.8, clouds: 0.5, cloudHeight: 0.004, cloudSpeed: 0.03 };
      if (P.atm === 2) b.atmosphere = { height: 0.018, rayleigh: [0.05, 0.03, 0.018], mie: 0.04, g: 0.65 }; }
    bodies.push(b); return k; };
  if (st.planets) st.planets.split(',').forEach((e, i) => { const f = e.split(':'); addPlanet(st.id + '-' + i, f[0], Math.max(+f[1], amin * (1 + i * 0.35)), +f[2], f[3] === 'g', 'A real, confirmed exoplanet.'); });
  else { const n = 2 + Math.floor(rnd() * 5); let a = Math.max(0.3, amin) * (1 + rnd() * 0.5);
    for (let i = 0; i < n; i++) { const gas = a > amin * 4 + 1.5 ? rnd() < 0.7 : rnd() < 0.15; const k = addPlanet(st.id + '-' + i, N(String.fromCharCode(98 + i)), a, gas ? 4 + rnd() * 8 : 0.4 + rnd() * 1.3, gas, 'An uncharted world, generated for this star.');
      if (gas) for (let m = 0, nm = Math.floor(rnd() * 3); m < nm; m++) bodies.push({ id: st.id + '-' + i + 'm' + m, name: bodies[k].name + ' ' + 'IVX'.split('')[m], fact: 'A moon of ' + bodies[k].name + '.', type: 'moon', parent: bodies[k].id, radius: 0.2 + rnd() * 0.25,
        orbit: { pr: 3 + m * 2.5 + rnd(), period: 300 + rnd() * 300, phase: rnd() * 6.28 }, spin: { period: 400 }, surface: { ...ROCKY[[1, 4, 2][m % 3]], scale: 1.8, seed: Math.floor(rnd() * 90) } });
      a *= 1.6 + rnd() * 0.7; } }
  const sp = bodies.find((b) => b.type === 'planet' && b.radius < 2) || bodies[0];
  return { id: st.id, name: st.name, scale: { radius: 1.2e6, radiusExp: 1, au: 4e9, auExp: 0.55, lightRef: 4e9 * Math.max(1, Math.sqrt(st.rad)), lightExp: 0.5 },
    star: { id: st.id + '-star', name: st.sn || st.name, fact: st.gal ? 'A star in the ' + st.name + '.' : st.fact, radius: sr, color: SCOL[st.cls], intensity: st.cls === 'M' && st.rad < 1 ? 26 : st.rad > 5 ? 55 : 40, corona: 1 },
    spawn: { near: sp.id, dist: 3.4 }, bodies };
}
// JPL "Approximate Positions of the Planets" (Standish), J2000 elements + rates per century: a, e, I, L, long. perihelion, long. node
const JPL = { mercury: [0.38709927, 3.7e-7, 0.20563593, 1.906e-5, 7.00497902, -0.00594749, 252.2503235, 149472.67411175, 77.45779628, 0.16047689, 48.33076593, -0.12534081],
  venus: [0.72333566, 3.9e-6, 0.00677672, -4.107e-5, 3.39467605, -0.0007889, 181.9790995, 58517.81538729, 131.60246718, 0.00268329, 76.67984255, -0.27769418],
  earth: [1.00000261, 5.62e-6, 0.01671123, -4.392e-5, -1.531e-5, -0.01294668, 100.46457166, 35999.37244981, 102.93768193, 0.32327364, 0, 0],
  mars: [1.52371034, 1.847e-5, 0.0933941, 7.882e-5, 1.84969142, -0.00813131, -4.55343205, 19140.30268499, -23.94362959, 0.44441088, 49.55953891, -0.29257343],
  jupiter: [5.202887, -0.00011607, 0.04838624, -0.00013253, 1.30439695, -0.00183714, 34.39644051, 3034.74612775, 14.72847983, 0.21252668, 100.47390909, 0.20469106],
  saturn: [9.53667594, -0.0012506, 0.05386179, -0.00050991, 2.48599187, 0.00193609, 49.95424423, 1222.49362201, 92.59887831, -0.41897216, 113.66242448, -0.28867794],
  uranus: [19.18916464, -0.00196176, 0.04725744, -4.397e-5, 0.77263783, -0.00242939, 313.23810451, 428.48202785, 170.9542763, 0.40805281, 74.01692503, 0.04240589],
  neptune: [30.06992276, 0.00026291, 0.00859048, 5.105e-5, 1.77004347, 0.00035372, -55.12002969, 218.45945325, 44.96476227, -0.32241464, 131.78422574, -0.00508664] };
const LMK = { c: 'City', m: 'Mountain', s: 'Region', o: 'Ocean', x: 'Landmark', l: 'Landing site' };
/* ============================== WGSL (single module, all entry points) ============================== */
const WGSL = /*wgsl*/`
struct G{vp:mat4x4f,rt:vec4f,up:vec4f,fw:vec4f,res:vec4f,sun:vec4f,sc:vec4f,mi:vec4f,ss:vec4f,wp:vec4f,fx:vec4f,wv:vec4f,gx:vec4f};
struct Body{d:array<vec4f,16>};
struct Inst{a:vec4f,q:vec4f,b:vec4f};
struct Hud{a:vec4f,c:vec4f,b:vec4f};
@group(0)@binding(0) var<uniform> g:G;
@group(0)@binding(1) var<storage,read> BD:array<Body>;
@group(0)@binding(2) var<storage,read> IN:array<Inst>;
@group(0)@binding(3) var<storage,read> HD:array<Hud>;
@group(0)@binding(4) var atl:texture_2d<f32>;
@group(0)@binding(5) var smp:sampler;
@group(0)@binding(6) var<storage,read> TH:array<vec2u>;// tile hash: key -> layer
@group(0)@binding(7) var TA:texture_2d_array<f32>;// streamed map tiles (256x256)
struct PB{i:vec4f,o:vec4f};
@group(2)@binding(0) var<storage,read_write> PRB:PB;
@group(1)@binding(0) var scn:texture_2d<f32>;
@group(1)@binding(1) var dep:texture_depth_2d;
const PI=3.14159265;
// ---------- shared math ----------
fn qr(q:vec4f,v:vec3f)->vec3f{let t=2.*cross(q.xyz,v);return v+q.w*t+cross(q.xyz,t);}
fn qc(q:vec4f)->vec4f{return vec4f(-q.xyz,q.w);}
fn ry(v:vec3f,a:f32)->vec3f{let c=cos(a);let s=sin(a);return vec3f(c*v.x-s*v.z,v.y,s*v.x+c*v.z);}
// ---- galaxies: one thin-disk + bulge model (log-spiral arms, dust lanes, HII knots; irregular clumps when pitch = 0), 3 slices through the disk
fn gxDisk(ro:vec3f,rd:vec3f,c:vec3f,n:vec3f,R:f32,sp:f32)->vec3f{
 let oc=ro-c;var e=vec3f(0.);let e1=normalize(cross(n,select(vec3f(1.,0.,0.),vec3f(0.,0.,1.),abs(n.x)>.9)));let e2=cross(n,e1);
 let tc=-dot(oc,rd);let db=length(oc+rd*max(tc,0.))/R;
 if(tc>0.){e+=vec3f(1.,.8,.55)*(exp(-db*db*select(40.,170.,sp>0.))*select(.35,1.1,sp>0.)+exp(-db*7.)*.04);}
 let dn=dot(rd,n);let on=dot(oc,n);
 if(abs(dn)>1e-5){for(var k=0;k<3;k++){let t=((f32(k)-1.)*R*.015-on)/dn;if(t>0.){let p=oc+rd*t;let x=dot(p,e1)/R;let y=dot(p,e2)/R;let r=length(vec2f(x,y));
   if(r<1.3){var dens=exp(-r*3.);let cl=(vn(vec3f(x*9.,y*9.,R*1e-4)).x*.6+vn(vec3f(x*23.,y*23.,3.)).x*.4)*.5+.5;
    if(sp>0.){let ph=atan2(y,x)-log(r+.03)/sp;let arm=pow(.5+.5*cos(2.*ph),4.)+.5*pow(.5+.5*cos(2.*ph+1.7),6.);dens*=.2+1.5*arm*(.55+.7*cl);
     e+=vec3f(1.,.4,.6)*smoothstep(.78,.95,cl)*arm*exp(-r*2.)*.25;dens*=1.-.55*smoothstep(.55,.75,vn(vec3f(x*32.,y*32.,1.)).x*.5+.5)*arm;}
    else{dens*=.3+1.6*cl*cl;}
    e+=mix(vec3f(1.,.84,.6),vec3f(.6,.73,1.),smoothstep(.04,.45,r))*dens*smoothstep(1.3,.85,r)*.22;}}}}
 return e;}
${GXM_W}
${GX_WGSL}
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
struct TR{h:f32,n:vec3f,f:f32,c:f32,m:f32};
@vertex fn vsB(@builtin(vertex_index) v:u32,@builtin(instance_index) i:u32)->VB{
 let b=BD[i].d;let h=max(b[13].w*b[0].w,4.*g.mi.w*b[1].x);
 return VB(g.vp*vec4f(b[0].xyz+cube(v)*h,1.),i);}
// ---- streamed real maps (Earth: Sentinel-2 cloudless + Terrarium elevation, Moon: LRO WAC); procedural fallback ----
fn tfind(k:u32)->i32{var h=(k*2654435761u)>>20u;for(var i=0;i<16;i++){let e=TH[h&4095u];if(e.x==k){return i32(e.y);}if(e.x==0xffffffffu){return -1;}h+=1u;}return -1;}
fn tuv(n:vec3f,eq:bool)->vec2f{let lo=atan2(-n.z,n.x);let la=asin(clamp(n.y,-1.,1.));
 if(eq){return vec2f((lo+PI)/PI,(PI*.5-la)/PI);}let m=clamp(la,-1.4844,1.4844);return vec2f((lo+PI)/(2.*PI),(1.-log(tan(m)+1./cos(m))/PI)*.5);}
fn tsel(kind:u32,uv:vec2f,zd:f32,zm:i32,eq:bool,yo:u32)->vec4f{var z=min(i32(max(zd,0.)),zm);
 loop{if(z<0){break;}let s=f32(1u<<u32(z));let t=uv*s;let w=select(s,s*2.,eq);
  let ix=u32(clamp(floor(t.x),0.,w-1.));let iy=u32(clamp(floor(t.y),0.,s-1.));
  let L=tfind((kind<<30u)|(u32(z)<<26u)|((iy+yo)<<13u)|ix);if(L>=0){return vec4f(f32(L),(t-floor(t))*256.,f32(z));}z-=1;}
 return vec4f(-1.);}
fn dec(c:vec4f)->f32{return c.r*65280.+c.g*255.+c.b*.99609375-32768.;}// Terrarium RGB -> metres
fn elev(n:vec3f,fp:f32)->vec2f{let r=tsel(1u,tuv(n,false),log2(6.2832/(256.*fp)),12,false,0u);if(r.x<0.){return vec2f(0.);}
 let L=i32(r.x);let q=r.yz-.5;let i=vec2i(floor(q));let f=q-floor(q);let c0=clamp(i,vec2i(0),vec2i(255));let c1=clamp(i+1,vec2i(0),vec2i(255));
 let a=dec(textureLoad(TA,c0,L,0));let bb=dec(textureLoad(TA,vec2i(c1.x,c0.y),L,0));let c=dec(textureLoad(TA,vec2i(c0.x,c1.y),L,0));let d=dec(textureLoad(TA,c1,L,0));
 return vec2f(mix(mix(a,bb,f.x),mix(c,d,f.x),f.y),1.);}
fn albedo(mm:f32,n:vec3f,fp:f32)->vec4f{let eq=mm>1.5;let r=tsel(select(0u,select(2u,3u,mm>2.5),eq),tuv(n,eq),log2(select(6.2832,3.1416,eq)/(256.*fp)),select(13,select(8,7,mm>2.5),eq),eq,0u);
 if(r.x<0.){return vec4f(0.);}let c=textureSampleLevel(TA,smp,clamp(r.yz/256.,vec2f(.003),vec2f(.997)),i32(r.x),0.).rgb;return vec4f(pow(c,vec3f(2.2)),1.);}
// colour-shaded altimetry (LOLA / MOLA): hue runs blue (low) -> cyan -> green -> yellow -> red / white (high); hillshading only changes brightness
fn hue01(c:vec3f)->f32{let mx=max(c.r,max(c.g,c.b));let d=mx-min(c.r,min(c.g,c.b));if(d<.12*mx||mx<.06){return select(-1.,1.,mx>.8&&d<.12*mx);}// grey: white peak, or shadow (unknown)
 var h:f32;if(mx==c.r){h=(c.g-c.b)/d;}else if(mx==c.g){h=2.+(c.b-c.r)/d;}else{h=4.+(c.r-c.g)/d;}h=fract(h/6.+1.);if(h>.85){h=0.;}return clamp((.7-h)/.7,0.,1.);}
fn relief(n:vec3f,fp:f32,ms:bool)->vec2f{let r=tsel(select(2u,3u,ms),tuv(n,true),log2(3.1416/(256.*fp)),select(5,6,ms),true,4096u);if(r.x<0.){return vec2f(0.);}
 let L=i32(r.x);let q=r.yz-.5;let i=vec2i(floor(q));let f=q-floor(q);let c0=clamp(i,vec2i(0),vec2i(255));let c1=clamp(i+1,vec2i(0),vec2i(255));
 let v=vec4f(hue01(textureLoad(TA,c0,L,0).rgb),hue01(textureLoad(TA,vec2i(c1.x,c0.y),L,0).rgb),hue01(textureLoad(TA,vec2i(c0.x,c1.y),L,0).rgb),hue01(textureLoad(TA,c1,L,0).rgb));
 let w=vec4f((1.-f.x)*(1.-f.y),f.x*(1.-f.y),(1.-f.x)*f.y,f.x*f.y)*step(vec4f(0.),v);let ws=dot(w,vec4f(1.));if(ws<1e-3){return vec2f(0.);}// skip shadowed / unknown samples
 return vec2f(dot(w,v)/ws,1.);}
fn terrMap(b:array<vec4f,16>,n:vec3f,fp:f32)->TR{
 let s=b[5].w*90.;let dt=fbm(n*s+vec3f(b[8].w),max(lod(fp,s)-1.,0.),.5);let da=b[4].w*.04;
 if(b[12].w>1.5){let ms=b[12].w>2.5;if(tsel(select(2u,3u,ms),tuv(n,true),0.,0,true,0u).x<0.){return TR(0.,vec3f(0.),0.,0.,0.);}
  let e=relief(n,fp,ms);if(e.y<.5){return TR(dt.x*da,dt.yzw*s*da,1.,0.,1.);}// Moon / Mars: photo + real altimetry relief (+ fine procedural detail)
  let lo=select(-9100.,-8200.,ms);let hi=select(10700.,21200.,ms);let K=select(8.6e-7,4.4e-7,ms);// metres -> R (x1.5 relief)
  let a=abs(n.y)<.9;let t1=normalize(cross(n,select(vec3f(1.,0.,0.),vec3f(0.,1.,0.),a)));let t2=cross(n,t1);let ep=max(fp,6e-5);
  let h0=(lo+e.x*(hi-lo))*K;let hx=(lo+relief(normalize(n+t1*ep),fp,ms).x*(hi-lo))*K;let hy=(lo+relief(normalize(n+t2*ep),fp,ms).x*(hi-lo))*K;
  return TR(h0+dt.x*da,(t1*(hx-h0)+t2*(hy-h0))/ep+dt.yzw*s*da,e.x,0.,1.);}
 let e=elev(n,fp);if(e.y<.5){return TR(0.,vec3f(0.),0.,0.,0.);}
 let a=abs(n.y)<.9;let t1=normalize(cross(n,select(vec3f(1.,0.,0.),vec3f(0.,1.,0.),a)));let t2=cross(n,t1);let ep=max(fp,2e-5);
 let n1=normalize(n+t1*ep);let n2=normalize(n+t2*ep);let ex=elev(n1,fp).x;let ey=elev(n2,fp).x;const EK=5.5e-7;// metres -> R (x3.5 relief)
 let ld=smoothstep(0.,30.,e.x);
 return TR(max(e.x,0.)*EK+ld*dt.x*da,(t1*(max(ex,0.)-max(e.x,0.))+t2*(max(ey,0.)-max(e.x,0.)))/ep*EK+ld*dt.yzw*s*da,e.x*.001,0.,1.);}
fn terr(b:array<vec4f,16>,n:vec3f,fp:f32)->TR{
 if(b[12].w>.5){let r=terrMap(b,n,fp);if(r.m>.5){return r;}}
 let s=b[5].w;let sd=vec3f(b[8].w);
 let f=fbm(n*s+sd,lod(fp,s),.5);var h=f.x;var gr=f.yzw*s;
 let ol=b[3].w;if(ol>-5.){if(h<ol){h=ol;gr=vec3f(0.);}h-=ol;}
 h*=b[4].w;gr*=b[4].w;var cr=0.;
 if(b[8].x>0.){let cs=b[8].y;let c=crats(n*cs+sd*1.3,clamp(log2(.5/(fp*cs))/1.26,0.,5.));h+=b[8].x*c.x/cs;gr+=b[8].x*c.yzw;cr=c.x;}
 return TR(h,gr,f.x,cr,0.);}
fn cloud(b:array<vec4f,16>,n:vec3f,fp:f32)->f32{
 let p=ry(n,g.mi.x*b[15].x);let w=fbm(p*3.,4.,.5);
 let f=fbm(p*7.+w.yzw*.04+vec3f(w.x*.6),min(lod(fp,7.),mix(8.,11.,g.fx.z)),.56).x;let th=.3-b[11].w*.55;return smoothstep(th,th+.35,f)*smoothstep(th-.15,th+.6,f);}
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
 let N=i32(mix(7.,12.,g.fx.z));let ds=(t1-t0)/f32(N);var od=vec2f(0.);var sR=vec3f(0.);var sM=vec3f(0.);
 for(var i=0;i<N;i++){let p=ro+rd*(t0+ds*(f32(i)+dt));let d=exp(-max(length(p)-1.,0.)/vec2f(hr,hm))*ds;od+=d*.5;
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
 let hm=select(max(b[4].w+b[8].x*.3/max(b[8].y,1.),select(0.,select(.013,.017,b[12].w>2.5),b[12].w>1.5)),0.,gas);// map relief bound (Moon / Mars altimetry)
 if(hm>0.){let ct=(an-hm)*(dn+1.+hm);let d2=bb*bb-ct;
  if(d2>0.){let sq=sqrt(d2);let te=select(ct/(-bb+sq),0.,ct<0.);let tx=-bb+sq;
   if(tx>0.&&hm/(max(te,1e-7)*pa)>.6){var t=te;var hit=true;let fm=max(te*pa,hm*.02);
    OCM=mix(5.,7.,g.fx.z);for(var i=0;i<72;i++){let p=ro+rd*t;let r=length(p);let d=r-1.-terr(b,p/r,fm*4.).h;if(d<t*pa*.35){break;}t+=d*.55;if(t>tx){hit=false;break;}}
    tS=select(-1.,t,hit);if(hit){cov=1.;}OCM=16.;}}}
 var acc=vec4f(0.);var tD=1e30;let ringOn=b[13].y>0.;let fpS=max(tS,1e-7)*pa;
 // ---- surface ----
 if(tS>0.){let p=ro+rd*tS;let n=normalize(p);var N=n;var col:vec3f;var spec=0.;var em=vec3f(0.);var rough=.3;
  if(gas){col=gasCol(b,n,fpS);}else{
   let T=terr(b,n,fpS);N=normalize(n-(T.n-dot(T.n,n)*n));let mm=b[12].w;
   let m=fbm(n*b[5].w*1.1+vec3f(5.1),5.,.5).x;let ol=select(b[3].w,0.,T.m>.5&&mm<1.5);let hr=T.h/max(b[4].w,1e-6);
   var wat=ol>-5.&&T.f<ol;var A=vec4f(0.);if(mm>.5){A=albedo(mm,n,fpS);}
   if(A.w>.5){if(T.m<.5){wat=A.b>A.r*1.4&&dot(A.rgb,vec3f(.3,.6,.1))<.04;N=n;}let gs=b[5].w*3000.;let go=clamp(lod(fpS,gs),0.,7.);col=A.rgb*select(1.15,select(1.7,1.25,mm>2.5),mm>1.5)*(1.+.45*fbm(n*gs,go,.55).x*min(go*.5,1.));// ground grain where the photo runs out of pixels
   if(wat&&mm<1.5){spec=b[14].w;}else{wat=false;}}
   else if(wat){col=b[5].xyz*mix(1.,.45,smoothstep(0.,.25,ol-T.f));spec=b[14].w;}
   else{col=mix(b[3].xyz,b[4].xyz,smoothstep(-.12,.12,m*b[8].z+hr*.22-.1))*(1.+T.c*1.5);
    if(ol>-5.){col=mix(col,b[6].xyz,smoothstep(.55,.75,hr)*.8);col=mix(b[4].xyz*1.1,col,smoothstep(0.,.03,T.f-ol));}}
   if(wat){let wv=vn(n*6000.+vec3f(g.mi.x*.5)).yzw*.004;N=normalize(n+wv-dot(wv,n)*n);rough=clamp(.07+fpS*3e3,.07,.5);}
   let cl=b[6].w;if(cl<1.5&&A.w<.5){let k=smoothstep(cl,cl+.03,abs(n.y)+m*.06);col=mix(col,b[6].xyz,k);spec*=1.-k;}
   let aa=b[7].w;
   if(aa>0.){let r1=1.-abs(vn(n*b[5].w*5.+vec3f(3.3)).x);let r2=1.-abs(vn(n*b[5].w*17.+vec3f(1.1)).x);col=mix(col,b[7].xyz,clamp(aa*(pow(r1,40.)+.6*pow(r2,70.)+.25*smoothstep(.3,.7,m)),0.,1.));}
   if(aa<0.){let f=fbm(n*b[5].w*3.+vec3f(9.),5.,.55).x;col=mix(col,b[7].xyz,smoothstep(.18,.38,f)*min(-aa,1.));em+=vec3f(1.,.32,.05)*smoothstep(.46,.56,f)*3.*-aa;}
   if(b[10].w>0.&&!wat){let ci=fbm(n*70.,6.,.6).x;em+=vec3f(1.,.62,.28)*smoothstep(.3,.6,ci)*smoothstep(-.05,.3,select(m,.3,A.w>.5))*b[10].w*.06*smoothstep(.08,-.18,dot(n,L))*select(smoothstep(.03,.1,T.f-ol),1.,A.w>.5);}}
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
// exact ground height under the ship for collision (same terrain function as the raymarch)
@compute @workgroup_size(1) fn csProbe(){let b=BD[u32(PRB.i.w)].d;OCM=7.;let r=terr(b,normalize(PRB.i.xyz),select(max(b[4].w,1e-4)*.08,1e-5,b[12].w>.5));PRB.o=vec4f(r.h,r.f,r.m,1.);}
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
 var rd=ray(f.xy);var dop=1.;let be=g.wv.x;
 if(be>0.){let cp=dot(rd,g.fw.xyz);let cs=(cp-be)/(1.-be*cp);let pp=rd-g.fw.xyz*cp;let pl=length(pp);// relativistic aberration: the sky crowds forward
  if(pl>1e-5){rd=g.fw.xyz*cs+pp/pl*sqrt(max(1.-cs*cs,0.));}dop=1./(inverseSqrt(1.-be*be)*(1.-be*cp));}
 let gn=GNP;let gl=dot(rd,gn);let gc=GCD;// Milky Way band along the real galactic plane
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
 if(be>0.){let ld=log2(dop);let sh=clamp(ld*.35,-1.,1.);// Doppler: blue ahead, red behind, brightness ~ D^1.5
  let tint=select(mix(vec3f(1.),vec3f(1.,.35,.12),-sh),mix(vec3f(1.),vec3f(.45,.6,1.4),sh),sh>0.);c*=tint*min(pow(dop,1.5),8.);}
 if(g.gx.w<.5){c+=gxAll(g.gx.xyz,GXM*rd,1.)*.05;}// other galaxies as faint smudges in the sky
 return vec4f(c,1.);}
// ================= POST: bloom-lite, sun glare, warp streaks, ACES =================
@fragment fn fsPost(@builtin(position) f:vec4f)->@location(0) vec4f{
 let mx=vec2i(g.res.xy)-1;let sk=g.res.y/1440.;let hu0=(f.xy-g.res.xy*.5)/g.res.y;let hr=length(hu0);let ha=atan2(hu0.y,hu0.x);let he=g.fx.x*smoothstep(.22,.85,hr);
 var ip=vec2i(f.xy);if(he>0.){let hq=f.xy*.035/max(sk,.3);let w=vec2f(vn(vec3f(hq,g.mi.x*6.)).x,vn(vec3f(hq.yx+vec2f(7.),g.mi.x*6.)).x);ip=clamp(ip+vec2i(w*he*9.*sk),vec2i(0),mx);} // heat-haze refraction
 var c=textureLoad(scn,ip,0).rgb;
 var bl=vec3f(0.);for(var i=0;i<16;i++){let a=f32(i)*2.39996;let r=(3.+f32(i)*2.2)*sk;let s=textureLoad(scn,clamp(ip+vec2i(vec2f(cos(a),sin(a))*r),vec2i(0),mx),0).rgb;bl+=max(s-vec3f(1.),vec3f(0.))/(1.+f32(i)*.3);}
 c+=bl*.035;
 if(g.ss.w>0.){let sp=g.ss.xy*g.res.xy;var vis=0.;var tot=0.;
  for(var i=0;i<12;i++){let a=f32(i)*2.39996;let o=sp+vec2f(cos(a),sin(a))*g.ss.z*sqrt((f32(i)+.5)/12.)*.8;
   if(all(o>=vec2f(0.))&&all(o<g.res.xy)){tot+=1.;vis+=select(0.,1.,textureLoad(dep,vec2i(o),0)<=g.wp.z*1.02);}}
  vis=select(vis/max(tot,1.),.0,tot<.5);let d=(f.xy-sp)/g.res.y;let r=length(d);let k=clamp(g.ss.z/(g.res.y*.004),.3,3.)*vis*g.fx.w;
  let an=atan2(d.y,d.x);
  c+=g.sc.rgb*k*(.6*exp(-r*18.)+.05/(1.+r*r*400.)+.12*exp(-abs(d.y)*500.)*exp(-abs(d.x)*3.)+.18*pow(abs(cos(an*3.)),60.)*exp(-r*7.));}
 if(g.wp.x>0.){let u=(f.xy-g.res.xy*.5)/g.res.y;let r=length(u);let a=atan2(u.y,u.x);
  let s=pow(vn(vec3f(a*24.,r*3.-g.mi.x*14.,0.)).x*.5+.5,10.)*smoothstep(.05,.6,r)*g.wp.x;c+=vec3f(.55,.75,1.)*s*.8;}
 c+=vec3f(.75,.85,1.)*g.wp.y*3.;
 if(g.wv.y>0.||g.wv.w>0.){let t=g.mi.x;let A=ha/6.2832+.5;let lr=log(max(hr,.002));
  let ac=floor(A*720.);let rh=hf(vec3i(i32(ac),3,9));let ao=abs(fract(A*720.)-.5);// hyperspace streaks: thin radial lines rushing outward, lengthening with the jump
  let d=fract(lr*.9-t*(1.6+rh*2.2)+rh*7.);let L=.04+.9*g.wv.y;let sg=smoothstep(1.-L,1.,d)*smoothstep(1.,.985,d);
  c+=mix(vec3f(.55,.7,1.),vec3f(1.),rh)*(1.-smoothstep(.0,.16,ao))*sg*step(.45,rh)*smoothstep(.04,.35,hr)*g.wv.y*2.2;
  let tw=g.wv.w;if(tw>0.){let z=.3/max(hr,.015);let a2=ha+z*.18+t*.35;let tc=vec3f(cos(a2)*1.8,sin(a2)*1.8,z*1.4+t*9.);// flowing tunnel of light
   let n1=vn(tc).x*.5+.5;let n2=vn(tc*2.3+vec3f(3.)).x*.5+.5;let wl=pow(clamp(n1*.7+n2*.45,0.,1.3),3.);
   let tcol=mix(vec3f(.03,.1,.55),vec3f(.75,.88,1.),clamp(wl*wl,0.,1.))*wl*1.15+vec3f(.6,.8,1.)*exp(-hr*9.)*.9;c=mix(c,tcol,tw*.92);}}
 c+=vec3f(1.,.93,.85)*g.wv.z*(2.2*exp(-hr*2.5)+.6);
 if(g.gx.w>0.){let gr=ray(f.xy);let sk=pow(hf(vec3i(vec2i(f.xy*.5),17)),400.)*.6;c=mix(c,gxAll(g.gx.xyz,gr,0.)+vec3f(sk),g.gx.w);}// galaxy view
 if(g.fx.x>0.){let t=g.mi.x;let n1=vn(vec3f(cos(ha)*9.+9.,sin(ha)*9.,hr*5.-t*9.)).x*.5+.5;let n2=vn(vec3f(cos(ha)*22.,sin(ha)*22.+4.,hr*12.-t*19.)).x*.5+.5;
  let fl=pow(clamp(n1*.65+n2*.4,0.,1.2),5.)*he;let gl=pow(smoothstep(.35,1.,hr),3.)*g.fx.x;
  c=c*(1.-.25*he)+vec3f(1.,.36,.08)*fl*1.8+vec3f(1.,.3,.35)*gl*.35+vec3f(1.,.5,.2)*g.fx.y*.6;} // plasma sheath + touchdown/entry flash
 c*=g.mi.z;c=clamp((c*(2.51*c+.03))/(c*(2.43*c+.59)+.14),vec3f(0.),vec3f(1.));
 let uv=f.xy*g.res.zw-.5;c*=1.-dot(uv,uv)*.35;
 c=pow(c,vec3f(1./2.2))+(hf(vec3i(ip,7))-.5)/255.;return vec4f(c,1.);}
// ================= HUD: instanced AA segments + glyphs =================
struct VH{@builtin(position) p:vec4f,@location(0) uv:vec2f,@location(1) c:vec4f,@location(2) @interpolate(flat) k:vec3f};
@vertex fn vsH(@builtin(vertex_index) v:u32,@builtin(instance_index) i:u32)->VH{
 let h=HD[i];var Q=array(vec2f(0,0),vec2f(1,0),vec2f(1,1),vec2f(0,0),vec2f(1,1),vec2f(0,1));let q=Q[v];var px:vec2f;var uv:vec2f;
 if(h.b.x>=0.){px=h.a.xy+q*vec2f(h.a.z*.625,h.a.z);let ch=u32(h.b.x)-32u;uv=(vec2f(f32(ch%16u),f32(ch/16u))+q)/vec2f(16.,6.);}
 else if(h.b.x<-1.5){let r=h.a.z+h.b.y*.5+1.5;uv=(q*2.-1.)*r;px=h.a.xy+uv;}
 else{let d=h.a.zw-h.a.xy;let l=max(length(d),1e-3);let t=d/l;let n=vec2f(-t.y,t.x);let w=h.b.y*.5+1.;px=h.a.xy+t*(q.x*(l+2.)-1.)+n*(q.y*2.-1.)*w;uv=vec2f(0.,(q.y*2.-1.)*w);}
 return VH(vec4f(px.x*g.res.z*2.-1.,1.-px.y*g.res.w*2.,0.,1.),uv,h.c,vec3f(h.b.xy,h.a.z));}
@fragment fn fsH(v:VH)->@location(0) vec4f{
 var a:f32;
 if(v.k.x>=0.){a=textureSampleLevel(atl,smp,v.uv,0.).r;let e=vec2f(2.2/480.,2.2/288.);
  var o=0.;for(var i=0;i<8;i++){let an=f32(i)*.7854;o=max(o,textureSampleLevel(atl,smp,v.uv+vec2f(cos(an),sin(an))*e,0.).r);}
  let oa=max(a,min(o*1.6,1.)*.8);return vec4f(v.c.rgb*a/max(oa,1e-4),v.c.a*oa);} // dark outline keeps text readable on bright planets
 else if(v.k.x<-1.5){let d=length(v.uv);a=select(clamp(v.k.y*.5+.5-abs(d-v.k.z),0.,1.),clamp(v.k.z-d+.5,0.,1.),v.k.y<=0.);}
 else{a=clamp(v.k.y*.5+.5-abs(v.uv.y),0.,1.);}
 return vec4f(v.c.rgb,v.c.a*a);}
`;

/* ============================== F64 MATH (allocation-free, in-place) ============================== */
const qmul = (o, oi, a, ai, b, bi) => { // o = a*b (x,y,z,w)
  const ax = a[ai], ay = a[ai + 1], az = a[ai + 2], aw = a[ai + 3], bx = b[bi], by = b[bi + 1], bz = b[bi + 2], bw = b[bi + 3];
  o[oi] = aw * bx + ax * bw + ay * bz - az * by; o[oi + 1] = aw * by - ax * bz + ay * bw + az * bx;
  o[oi + 2] = aw * bz + ax * by - ay * bx + az * bw; o[oi + 3] = aw * bw - ax * bx - ay * by - az * bz;
};
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
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
  const st = def.star, list = [{ id: st.id, name: st.name, type: 'star', R: rad(st.radius), parent: -1, star: st, def: { fact: st.fact }, tilt: 0, spinP: 1e9, a: 0, ecc: 0, inc: 0, node: 0 }];
  const belts = [];
  for (const b of def.bodies) {
    if (b.type === 'belt') { belts.push({ inner: au(b.inner), outer: au(b.outer), count: b.count, thick: au(b.outer) * b.thickness }); continue; }
    const p = b.parent ? list.findIndex((x) => x.id === b.parent) : 0, o = b.orbit || {};
    const R = b.type === 'station' || b.type === 'comet' ? b.size : rad(b.radius);
    list.push({ id: b.id, name: b.name, type: b.type, R, parent: p, def: b,
      a: o.au ? au(o.au) : (o.pr || 0) * list[p].R, period: o.period || 1e9, inc: (o.inc || 0) * D2R, node: (o.node || 0) * D2R, phase: o.phase || 0, ecc: o.ecc || 0,
      spinP: (b.spin && b.spin.period) || 1e9, tilt: ((b.spin && b.spin.tilt) || 0) * D2R, jpl: def.id === 'sol' ? JPL[b.id] : undefined });
    const L = list[list.length - 1]; if (L.jpl) { L.a = au(L.jpl[0]); L.ecc = L.jpl[2]; }
  }
  for (const b of list) {
    b.sphere = b.type === 'star' || b.type === 'planet' || b.type === 'moon';
    const d = b.def || {}, at = d.atmosphere, ri = d.rings;
    b.box = b.type === 'star' ? 5 : Math.max(1 + (at ? at.height : 0) + 0.02, ri ? ri.outer + 0.02 : 0);
    b.soi = b.type === 'star' ? 0 : b.type === 'planet' ? 32 * b.R : b.type === 'moon' ? 7 * b.R : b.type === 'station' ? 25 * b.R : 10 * b.R;
    b.arrive = b.type === 'station' || b.type === 'comet' ? 5 * b.R : Math.max(2.6, b.box * 1.6) * b.R;
  }
  const lm = []; list.forEach((b, bi) => { const src = PLACES[b.id]; if (!src) return; for (const e of src.split(';')) { const f = e.split('|'), la = +f[1] * D2R, lo = +f[2] * D2R;
    lm.push({ name: f[0], bi, lat: +f[1], lon: +f[2], kind: f[3], rank: +f[4], elev: +f[5] || 0, dir: [Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo)] }); } });
  lm.sort((a, b) => a.rank - b.rank);
  return { def, list, belts, lm, au, n: list.length, idx: Object.fromEntries(list.map((b, i) => [b.id, i])) };
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
  set(12, at.rayleigh || [0, 0, 0], s.maps === 'earth' ? 1 : s.maps === 'moon' ? 2 : s.maps === 'mars' ? 3 : 0); // streamed real maps
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

  // ---- streamed map tiles: 256x256 texture array + open-addressing hash (key -> layer) ----
  const NTL = 256, tileTex = device.createTexture({ size: [256, 256, NTL], format: 'rgba8unorm', usage: T.TEXTURE_BINDING | T.COPY_DST | T.RENDER_ATTACHMENT });
  const thF = new Uint32Array(8192).fill(0xffffffff), thBuf = buf(thF.byteLength, U.STORAGE | U.COPY_DST); device.queue.writeBuffer(thBuf, 0, thF);
  const probeIn = new Float32Array(8), probeBuf = buf(32, U.STORAGE | U.COPY_DST | U.COPY_SRC), probeRd = buf(32, U.MAP_READ | U.COPY_DST);
  const VFC = VF | GPUShaderStage.COMPUTE;
  const bgl0 = device.createBindGroupLayout({ entries: [
    { binding: 0, visibility: VFC, buffer: {} }, { binding: 1, visibility: VFC, buffer: { type: 'read-only-storage' } },
    { binding: 2, visibility: VF, buffer: { type: 'read-only-storage' } }, { binding: 3, visibility: VF, buffer: { type: 'read-only-storage' } },
    { binding: 4, visibility: VF, texture: {} }, { binding: 5, visibility: VFC, sampler: {} },
    { binding: 6, visibility: VFC, buffer: { type: 'read-only-storage' } }, { binding: 7, visibility: VFC, texture: { viewDimension: '2d-array' } }] });
  const bgl1 = device.createBindGroupLayout({ entries: [
    { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'unfilterable-float' } },
    { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } }] });
  const bg0 = device.createBindGroup({ layout: bgl0, entries: [
    { binding: 0, resource: { buffer: gBuf } }, { binding: 1, resource: { buffer: bBuf } }, { binding: 2, resource: { buffer: iBuf } },
    { binding: 3, resource: { buffer: hBuf } }, { binding: 4, resource: atlas.createView() }, { binding: 5, resource: device.createSampler({ magFilter: 'linear', minFilter: 'linear' }) },
    { binding: 6, resource: { buffer: thBuf } }, { binding: 7, resource: tileTex.createView({ dimension: '2d-array' }) }] });
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
  const bglP = device.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }] });
  const probeP = device.createComputePipeline({ layout: device.createPipelineLayout({ bindGroupLayouts: [bgl0, device.createBindGroupLayout({ entries: [] }), bglP] }), compute: { module: mod, entryPoint: 'csProbe' } });
  const bgP = device.createBindGroup({ layout: bglP, entries: [{ binding: 0, resource: { buffer: probeBuf } }] });

  // ---- render targets (recreated only on resize) ----
  let W = 0, H = 0, hdrT, depT, bg1, outT = null, dyn = 1, dynT = 0, fAvg = 1 / 60;
  const resize = () => {
    const dpr = opts.renderScale || (tc.on ? 1 : Math.min(window.devicePixelRatio || 1, 2)) * dyn; // phones: 1 canvas px per CSS px; dyn = adaptive resolution
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
  let sys = null, nAst = 0, simT = 0, target = 1, tgtT = 9, cruise = false, cruiseV = 0, warpVis = 0, thirdPerson = false, showHelp = true, lastDist = 0, closing = 0;
  let capReq = null, capBusy = false;
  // ---- tile streaming (only network use; procedural surface stays as fallback/offline) ----
  const TSRC = [(z, x, y) => `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2023_3857/default/g/${z}/${y}/${x}.jpg`, // Sentinel-2 cloudless (EOX), ~10 m/px
    (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`,
    (z, x, y) => `https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm/${z}/${y}/${x}.jpg`,
    (z, x, y) => `https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/default/default028mm/${z}/${y}/${x}.jpg`,
    (z, x, y) => `https://trek.nasa.gov/tiles/Moon/EQ/LRO_LOLA_ClrShade_Global_128ppd_v04/1.0.0/default/default028mm/${z}/${y}/${x}.png`, // LOLA colour-shaded altimetry
    (z, x, y) => `https://trek.nasa.gov/tiles/Mars/EQ/Mars_MGS_MOLA_ClrShade_merge_global_463m/1.0.0/default/default028mm/${z}/${y}/${x}.jpg`]; // MOLA colour-shaded altimetry
  const TZM = [13, 12, 8, 7, 5, 6], tKey = new Uint32Array(NTL).fill(0xffffffff), tUse = new Int32Array(NTL), tmap = new Map();
  let tFly = 0, thDirty = false, tilesSeen = false;
  const tileLoad = (k, kind, z, x, y) => {
    tFly++; tmap.set(k, -1);
    fetch(TSRC[kind](z, x, y), { mode: 'cors' }).then((r) => { if (!r.ok) throw new Error(r.status); return r.blob(); })
      .then((bl) => createImageBitmap(bl, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' })).then((bm) => {
        tFly--; if (dead) return; let sl = 0, old = Infinity;
        for (let i = 0; i < NTL; i++) { if (tKey[i] === 0xffffffff) { sl = i; break; } if (tUse[i] < old) { old = tUse[i]; sl = i; } }
        if (tKey[sl] !== 0xffffffff) tmap.delete(tKey[sl]);
        tKey[sl] = k; tUse[sl] = frame; tmap.set(k, sl); thDirty = true; tilesSeen = true;
        device.queue.copyExternalImageToTexture({ source: bm }, { texture: tileTex, origin: [0, 0, sl] }, [256, 256]); bm.close();
      }).catch(() => { tFly--; tmap.set(k, -2); }); // failed/offline: never retried, procedural fallback stays
  };
  const want = (kind, z, x, y) => { const k = (kind >= 4 ? ((kind - 2) << 30) | (z << 26) | ((y + 4096) << 13) | x : (kind << 30) | (z << 26) | (y << 13) | x) >>> 0, v = tmap.get(k); if (v === undefined) { if (tFly < 12) tileLoad(k, kind, z, x, y); } else if (v >= 0) tUse[v] = frame; };
  function tiles() { // LOD request set: whole globe at low zoom + 3x3 window per level around the sub-camera point
    let near = -1, nd = Infinity; for (let i = 0; i < sys.n; i++) { const b = sys.list[i]; if (b.def && b.def.surface && b.def.surface.maps && dist(i) / b.R < nd) { nd = dist(i) / b.R; near = i; } }
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < sys.n; i++) { // nearest mapped body first
      if ((pass === 0) !== (i === near)) continue;
      const b = sys.list[i], mp = b.def && b.def.surface && b.def.surface.maps; if (!mp) continue;
      const eq = mp !== 'earth', ek = mp === 'mars' ? 3 : 2, o = i * 3, d = dist(i);
      for (let kk = 0; kk < 2; kk++) { const kind = eq ? (kk ? ek + 2 : ek) : kk;
        const zb = eq ? 1 : 2; for (let z = 0; z <= zb; z++) { const n = 1 << z; for (let y = 0; y < n; y++) for (let x = 0; x < n * (eq ? 2 : 1); x++) want(kind, z, x, y); }
        if (d > 8 * b.R) continue;
        const cx = cam[0] - pos[o], cy = cam[1] - pos[o + 1], cz = cam[2] - pos[o + 2], q = i * 4;
        tq[0] = -bq[q]; tq[1] = -bq[q + 1]; tq[2] = -bq[q + 2]; tq[3] = bq[q + 3]; qrot(t3, 0, tq, 0, cx / d, cy / d, cz / d);
        const lon = Math.atan2(-t3[2], t3[0]), lat = Math.asin(Math.max(-1, Math.min(1, t3[1]))), an = Math.max((d - b.R) / b.R, 1e-6);
        const zt = Math.min(TZM[kind], Math.floor(Math.log2((eq ? Math.PI : 2 * Math.PI) / (256 * an * gF[43] * 1.5))));
        for (let z = zb + 1; z <= zt; z++) {
          const n = 1 << z, w = eq ? 2 * n : n; let u, v;
          if (eq) { u = ((lon + Math.PI) / Math.PI) * n; v = ((Math.PI / 2 - lat) / Math.PI) * n; }
          else { const la = Math.max(-1.4844, Math.min(1.4844, lat)); u = ((lon + Math.PI) / (2 * Math.PI)) * n; v = ((1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2) * n; }
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const y = Math.floor(v) + dy; if (y >= 0 && y < n) want(kind, z, (((Math.floor(u) + dx) % w) + w) % w, y); }
        }
      }
    }
    if (thDirty) { thDirty = false; thF.fill(0xffffffff); // rebuild the GPU hash (rare: only when a tile arrives)
      for (let sl = 0; sl < NTL; sl++) { const k = tKey[sl]; if (k === 0xffffffff) continue; let h = Math.imul(k, 2654435761) >>> 20;
        for (let p = 0; p < 16; p++, h++) { const e = (h & 4095) * 2; if (thF[e] === 0xffffffff) { thF[e] = k; thF[e + 1] = sl; break; } } }
      device.queue.writeBuffer(thBuf, 0, thF); }
  }
  // ---- surface flight: GPU height probe + co-rotating frame ----
  let prBody = -1, prH = 0, prValid = false, prBusy = false, prSent = -1, rqRef = -1, landed = false, altT = Infinity;
  // ---- surface transition: eye clearance, atmospheric-entry heat, banners, touchdown ----
  let photo = false, clr = 25, heat = 0, thump = 0, eflash = 0, inAtm = -1, lowB = -1, bannerS = '', bannerT = 0, bannerHot = false, hs = 1, showStats = false;
  const banner = (txt, hot) => { bannerS = txt; bannerT = 3.2; bannerHot = hot; };
  const rq = new Float64Array(4), tpr = new Float64Array(3), tv = new Float64Array(3); let tpRef = -1, tpTgt = -1; // target velocity in the ship's reference frame
  const fpr = new Float64Array(3), fv = new Float64Array(3); let fRef = -1, anc = 0; // riding along: velocity of the ship's frame (small body) relative to its parent
  // ---- fun layer: exploration log, supercruise charge, flash, FOV kick, dust, procedural audio ----
  const disc = new Uint8Array(MAXB), dust = new Float64Array(480);
  for (let i = 0; i < 480; i++) dust[i] = hash(i, 77, 3);
  let nDisc = 0, toastI = -1, toastT = 0, toastAll = false, charge = -1, flash = 0;
  const LOGKEY = 'spaceroam.log.';
  const saveLog = () => { try { const ids = []; for (let i = 0; i < sys.n; i++) if (disc[i]) ids.push(sys.list[i].id); localStorage.setItem(LOGKEY + sys.def.id, ids.join(',')); } catch (e) { /* storage unavailable */ } };
  const loadLog = () => { disc.fill(0); nDisc = 0; let ids = ''; try { ids = localStorage.getItem(LOGKEY + sys.def.id) || ''; } catch (e) { /* ignore */ }
    for (const id of ids.split(',')) { const i = sys.idx[id]; if (i !== undefined && !disc[i]) { disc[i] = 1; nDisc++; } } };
  const au = { ctx: null, on: true };
  function audioInit() { // procedural WebAudio graph, built once on the first user gesture
    if (au.ctx) { if (au.ctx.state === 'suspended') au.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = au.ctx = new AC(), G = (v, to) => { const g = c.createGain(); g.gain.value = v; g.connect(to); return g; };
    const F = (type, f, to) => { const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.connect(to); return b; };
    const O = (type, f, to) => { const o = c.createOscillator(); o.type = type; o.frequency.value = f; o.connect(to); o.start(); return o; };
    au.m = G(au.on ? 0.5 : 0, c.destination); au.an = c.createAnalyser(); au.an.fftSize = 1024; au.m.connect(au.an); au.ab = new Float32Array(1024); // level meter (debug/tests)
    const nb = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const nz = c.createBufferSource(); nz.buffer = nb; nz.loop = true; nz.start();
    const bb = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), bd = bb.getChannelData(0); let lb = 0; for (let i = 0; i < bd.length; i++) { lb = (lb + 0.02 * (Math.random() * 2 - 1)) / 1.02; bd[i] = lb * 3.5; } // brown noise: deep, soft
    const bz = c.createBufferSource(); bz.buffer = bb; bz.loop = true; bz.start();
    au.eg = G(0, au.m); au.ef = F('lowpass', 300, au.eg); bz.connect(au.ef);                                                           // rocket: faint filtered brown noise
    au.hg = G(0, au.m); au.hf = F('bandpass', 700, au.hg); au.hf.Q.value = 0.8; nz.connect(au.hf);                                  // thrust hiss
    au.wg = G(0, au.m); au.wf = F('lowpass', 300, au.wg); bz.connect(au.wf);                                                         // warp roar
    au.pg = G(0, au.m); au.p1 = O('sine', 196, au.pg); au.p2 = O('triangle', 294, G(0.5, au.pg));
    au.sg = G(0, au.m); au.so = O('sine', 200, au.sg);                                                                              // charge whine
    const dg = G(0.01, au.m), df = F('lowpass', 400, dg); O('sine', 55, df); O('sine', 82.7, df); O('triangle', 110.3, G(0.3, df)); // ambient drone
    au.nb = nb;
  }
  function blip(f0, f1, dur, type, vol, delay) { // one-shot event sound (allocates only on events)
    const c = au.ctx; if (!c || !au.on) return; const t = c.currentTime + (delay || 0), o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(au.m); o.start(t); o.stop(t + dur + 0.05);
  }
  function whoosh(dur, f0, f1, vol) { const c = au.ctx; if (!c || !au.on) return; const t = c.currentTime, n = c.createBufferSource(), b = c.createBiquadFilter(), g = c.createGain();
    n.buffer = au.nb; b.type = 'bandpass'; b.Q.value = 1.2; b.frequency.setValueAtTime(f0, t); b.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); n.connect(b); b.connect(g); g.connect(au.m); n.start(t); n.stop(t + dur); }
  const chime = (big) => { blip(660, 660, 0.35, 'sine', 0.1); blip(990, 990, 0.5, 'sine', 0.09, 0.12); if (big) { blip(1320, 1320, 0.8, 'sine', 0.08, 0.26); blip(1760, 1760, 1.2, 'sine', 0.06, 0.42); } };
  function audioFrame(thr, boost, chg, ht, wf) {
    const c = au.ctx; if (!c) return; const t = c.currentTime, w = warpVis;
    au.eg.gain.setTargetAtTime((0.05 + thr * 0.22 + boost * 0.18) * (1 - w * 0.6), t, 0.25); au.ef.frequency.setTargetAtTime(600 + thr * 900 + boost * 1400, t, 0.3); // soft rocket wash, kept above ~500 Hz so phone speakers can play it
    au.hg.gain.setTargetAtTime(thr * 0.03 * (1 + boost * 1.5), t, 0.2); au.hf.frequency.setTargetAtTime(1200 + boost * 1500, t, 0.3);
    au.wg.gain.setTargetAtTime(w * 0.12 + chg * 0.06 + ht * 0.22, t, 0.2); au.wf.frequency.setTargetAtTime(180 + w * 2600 + chg * 800 + ht * 700, t, 0.2);
    au.sg.gain.setTargetAtTime(chg * 0.03 + w * 0.006, t, 0.08);
    au.pg.gain.setTargetAtTime(wf * 0.025, t, 0.3); au.p1.frequency.setTargetAtTime(196 + wf * 98, t, 0.6); au.p2.frequency.setTargetAtTime(294 + wf * 147 + Math.sin(t * 0.7) * 3, t, 0.6); // warp choir: a slow rising fifth
    if (wf > 0) { au.wg.gain.setTargetAtTime(wf * 0.26, t, 0.2); au.wf.frequency.setTargetAtTime(500 + wf * 1500 + Math.sin(t * 3) * 200, t, 0.2); } // tunnel roar au.so.frequency.setTargetAtTime(160 + chg * 1100 + w * 300, t, 0.1);
  }
  function dropCruise(v) { if (ap.pend) { if (sys.lm[ap.k].bi === target && dist(target) < sys.list[target].arrive * 1.25) apStart(); else ap.pend = false; } cruise = false; flash = 0.6; for (let j = 0; j < 3; j++) ship.vel[j] = fw[j] * v; whoosh(1.4, 3000, 120, 0.18); blip(160, 50, 0.7, 'sine', 0.14); }
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
    loadLog(); toastI = -1; charge = -1; { const k = STARS.findIndex((x) => x.id === id); here = k >= 0 ? k : 0; } wsel = -1;
    const sp = def.spawn || {}; target = sys.idx[sp.near] || 1; jd0 += simT * TS; simT = 0; updateOrbits(0);
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
  const TSF = 0.25, TSR = 1 / 86400; let TS = TSF, jd0 = Date.now() / 86400000 + 2440587.5; // game seconds -> real days (fast: 6 h per second; real time: 1:1)
  const el6 = new Float64Array(6), kp = new Float64Array(3);
  const jdNow = () => jd0 + simT * TS;
  function jplSet(b, T) { const j = b.jpl; for (let k = 0; k < 6; k++) el6[k] = j[k * 2] + j[k * 2 + 1] * T; }
  function jplPos(E, o) { // point on the real orbit at eccentric anomaly E -> game frame, distance compressed with the system's au() law
    const a = el6[0], e = el6[1], I = el6[2] * D2R, w = (el6[4] - el6[5]) * D2R, Om = el6[5] * D2R, xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
    const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(Om), sO = Math.sin(Om), cI = Math.cos(I), sI = Math.sin(I);
    const x = (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp, y = (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp, z = sw * sI * xp + cw * sI * yp, r = Math.hypot(x, y, z), k = sys.au(r) / r;
    o[0] = x * k; o[1] = z * k; o[2] = -y * k;
  }
  function updateOrbits(t) {
    const jd = jd0 + t * TS, T = (jd - 2451545) / 36525, dd = jd - 2451545;
    for (let i = 0; i < sys.n; i++) {
      const b = sys.list[i], o = i * 3;
      if (b.parent < 0) { pos[o] = pos[o + 1] = pos[o + 2] = 0; qaxis(bq, i * 4, 0, 1, 0, t * 0.01); continue; }
      if (b.jpl) { jplSet(b, T); const M = ((el6[3] - el6[4]) * D2R) % 6.283185307179586, e = el6[1]; let E = M; for (let k = 0; k < 8; k++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
        jplPos(E, kp); pos[o] = kp[0]; pos[o + 1] = kp[1]; pos[o + 2] = kp[2];
        if (b.id === 'earth') { qaxis(tq, 0, 1, 0, 0, -OBL); qaxis(sq, 0, 0, 1, 0, TS === TSR ? (280.46061837 + 360.98564736629 * dd) * D2R : (6.283185307179586 * t) / b.spinP); } // real axis; real sidereal rotation in real-time mode
        else { qaxis(tq, 0, 0, 0, 1, b.tilt); qaxis(sq, 0, 0, 1, 0, (6.283185307179586 * t) / b.spinP); }
        qmul(bq, i * 4, tq, 0, sq, 0); continue; }
      if (b.id === 'luna') { // real lunar phase/position (low-precision mean elements), compressed distance kept
        const Lm = (218.316 + 13.176396 * dd) * D2R, Mm = (134.963 + 13.064993 * dd) * D2R, Fm = (93.272 + 13.22935 * dd) * D2R, lon = Lm + 6.289 * D2R * Math.sin(Mm), lat = 5.128 * D2R * Math.sin(Fm), p = b.parent * 3;
        pos[o] = pos[p] + b.a * Math.cos(lat) * Math.cos(lon); pos[o + 1] = pos[p + 1] + b.a * Math.sin(lat); pos[o + 2] = pos[p + 2] - b.a * Math.cos(lat) * Math.sin(lon);
        qaxis(tq, 0, 0, 0, 1, b.tilt); qaxis(sq, 0, 0, 1, 0, lon + Math.PI); qmul(bq, i * 4, tq, 0, sq, 0); continue; } // tidally locked: same face to Earth
      let M = b.phase + (6.283185307179586 * t) / b.period, x, z;
      if (b.ecc > 0) { let E = M; for (let k = 0; k < 6; k++) E -= (E - b.ecc * Math.sin(E) - M) / (1 - b.ecc * Math.cos(E)); x = b.a * (Math.cos(E) - b.ecc); z = b.a * Math.sqrt(1 - b.ecc * b.ecc) * Math.sin(E); }
      else { x = b.a * Math.cos(M); z = b.a * Math.sin(M); }
      const y = -z * Math.sin(b.inc), zi = z * Math.cos(b.inc), cn = Math.cos(b.node), sn = Math.sin(b.node), p = b.parent * 3;
      pos[o] = pos[p] + x * cn - zi * sn; pos[o + 1] = pos[p + 1] + y; pos[o + 2] = pos[p + 2] + x * sn + zi * cn;
      qaxis(tq, 0, 0, 0, 1, b.tilt); qaxis(sq, 0, 0, 1, 0, (6.283185307179586 * t) / b.spinP); qmul(bq, i * 4, tq, 0, sq, 0);
    }
  }

  // ---- input ----
  function setTgt(i) { if (i === target || i < 0) return; target = i; tgtT = 0; blip(880, 1320, 0.12, 'sine', 0.06); blip(1320, 1320, 0.15, 'sine', 0.05, 0.09); }
  function pick(x, y, rad) { // select the body whose marker/disc is closest to a screen point
    let bi = -1, bd = rad * rad;
    for (let i = 0; i < sys.n; i++) {
      const o = i * 3; if (!project(pos[o] - cam[0], pos[o + 1] - cam[1], pos[o + 2] - cam[2]) || hidden(i)) continue;
      const b = sys.list[i], pr = (b.R / scr[2]) / tanY() * H * 0.5, dx = scr[0] - x, dy = scr[1] - y, d2 = dx * dx + dy * dy;
      const loc = ship.ref > 0 ? (sys.list[ship.ref].parent > 0 ? sys.list[ship.ref].parent : ship.ref) : -1; // same visibility rules as the HUD markers
      if (pr < 8 && ((b.type === 'station' && dist(i) > 2e8) || (b.type === 'moon' && b.parent !== loc && b.parent !== ship.ref))) continue;
      const k = pr > 8 && d2 < pr * pr ? d2 * 0.25 : d2; // inside a visible disc counts as a strong hit
      if (k < bd) { bd = k; bi = i; }
    }
    if (bi >= 0) { setTgt(bi); return true; }
    let si = -1, sd = rad * rad; for (let k = 0; k < STARS.length; k++) { if (k === here || STARS[k].gal || STARS[here].gal) continue; starDir(k, sd3); if (!project(sd3[0] * 1e13, sd3[1] * 1e13, sd3[2] * 1e13)) continue; const d2 = (scr[0] - x) ** 2 + (scr[1] - y) ** 2; if (d2 < sd) { sd = d2; si = k; } }
    if (si >= 0) { wsel = si; blip(660, 990, 0.12, 'sine', 0.05); } return si >= 0;
  }
  const act = (code, back) => { // discrete actions shared by keyboard and touch buttons
    switch (code) {
      case 'Tab': setTgt((target + (back ? sys.n - 1 : 1)) % sys.n); break;
      case 'TabBack': setTgt((target + sys.n - 1) % sys.n); break;
      case 'Full': if (document.fullscreenElement) document.exitFullscreen(); else { const el = canvas.parentElement || canvas; if (el.requestFullscreen) el.requestFullscreen().catch(() => {}); } break; // wrapper, so the UI overlay stays visible
      case 'KeyF':
        if (cruise) dropCruise(Math.min(cruiseV, 5000)); else if (charge >= 0) { charge = -1; blip(500, 120, 0.3, 'sine', 0.07); }
        else if (dist(target) > sys.list[target].arrive * 1.2 && !bench.on) { charge = 1.2; cruiseV = 0; } else blip(330, 260, 0.15, 'sine', 0.06); // too close: denied beep
        break;
      case 'KeyM': au.on = !au.on; if (au.m) au.m.gain.setTargetAtTime(au.on ? 0.5 : 0, au.ctx.currentTime, 0.05); break;
      case 'KeyB': bench.on ? stopBench(false) : startBench(); break;
      case 'KeyV': thirdPerson = !thirdPerson; break;
      case 'KeyH': showHelp = !showHelp; break;
      case 'KeyG': showStats = !showStats; break;
      case 'KeyP': photo = !photo; break;
      case 'Time': { const nt = TS === TSF ? TSR : TSF; jd0 += simT * (TS - nt); TS = nt; break; } // keeps the current date
      case 'KeyJ': switchStarSystem(sys.def.id === 'sol' ? 'kestrel' : 'sol'); break;
      case 'BracketLeft': exposure /= 1.15; break; case 'BracketRight': exposure *= 1.15; break;
    }
  };
  const onKey = (e, d) => { if (e.target && e.target.tagName === 'INPUT') return; if (d) audioInit(); keys[e.code] = d; if (e.code === 'Tab') e.preventDefault(); if (d && !e.repeat) act(e.code, e.shiftKey); };
  const kd = (e) => onKey(e, 1), ku = (e) => onKey(e, 0);
  const mm = (e) => { if (document.pointerLockElement === canvas) { mdx += e.movementX; mdy += e.movementY; } };
  // ---- touch: floating thumbstick (left 40%), drag-to-look (right), HUD buttons. All state preallocated. ----
  const tc = { tid: -1, tx: 0, ty: 0, tt: 0, tm: 0, on: !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches), jid: -1, jox: 0, joy: 0, jx: 0, jy: 0, lid: -1, lx: 0, ly: 0 };
  const pc = (e) => { scr[0] = (e.offsetX * W) / (canvas.clientWidth || 1); scr[1] = (e.offsetY * H) / (canvas.clientHeight || 1); };
  const pd = (e) => {
    canvas.focus(); audioInit();
    if (gx.on) { e.preventDefault(); pc(e); mp.ptrs.set(e.pointerId, [scr[0], scr[1]]); mp.moved = 0; mp.t0 = performance.now(); if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId); if (mp.ptrs.size === 2) { const [a, b] = mp.ptrs.values(); mp.pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); } return; }
    if (mp.on) { e.preventDefault(); pc(e); mp.ptrs.set(e.pointerId, [scr[0], scr[1]]); mp.moved = 0; mp.t0 = performance.now(); if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
      if (mp.ptrs.size === 2) { const [a, b] = mp.ptrs.values(); mp.pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); } return; }
    if (e.pointerType === 'mouse') { // click: select what's under the cursor (or under the crosshair while flying with a locked mouse)
      if (document.pointerLockElement === canvas) pick(W / 2, H / 2, 70 * hs); else { pc(e); pick(scr[0], scr[1], 40 * hs); if (canvas.requestPointerLock) canvas.requestPointerLock(); }
      return; }
    e.preventDefault(); tc.on = true; pc(e); const x = scr[0], y = scr[1], id = e.pointerId;
    if (canvas.setPointerCapture) canvas.setPointerCapture(id); tc.tid = id; tc.tx = x; tc.ty = y; tc.tt = performance.now(); tc.tm = 0;
    if (x < W * 0.4 && tc.jid < 0) { tc.jid = id; tc.jox = x; tc.joy = y; tc.jx = tc.jy = 0; }
    else if (tc.lid < 0) { tc.lid = id; tc.lx = x; tc.ly = y; }
  };
  const pmv = (e) => {
    if (gx.on) { const o = mp.ptrs.get(e.pointerId); if (!o) return; pc(e); const x = scr[0], y = scr[1];
      if (mp.ptrs.size === 1) { gx.yaw -= ((x - o[0]) * 0.006) / hs; gx.pitch = Math.max(0.05, Math.min(1.52, gx.pitch + ((y - o[1]) * 0.006) / hs)); mp.moved += Math.abs(x - o[0]) + Math.abs(y - o[1]); o[0] = x; o[1] = y; }
      else { o[0] = x; o[1] = y; const [a, b] = mp.ptrs.values(), d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (mp.pinch > 0 && d > 0) gx.dist = Math.max(60, Math.min(9e6, gx.dist * mp.pinch / d)); mp.pinch = d; mp.moved += 99; } return; }
    if (mp.on) { const o = mp.ptrs.get(e.pointerId); if (!o) return; pc(e); const x = scr[0], y = scr[1];
      if (mp.ptrs.size === 1) { mp.yaw -= ((x - o[0]) * 0.006) / hs; mp.pitch += ((y - o[1]) * 0.006) / hs; mp.moved += Math.abs(x - o[0]) + Math.abs(y - o[1]); o[0] = x; o[1] = y; }
      else { o[0] = x; o[1] = y; const [a, b] = mp.ptrs.values(), d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (mp.pinch > 0 && d > 0) mp.zoom *= mp.pinch / d; mp.pinch = d; mp.moved += 99; } return; }
    if (e.pointerType === 'mouse') return; pc(e); const id = e.pointerId, R = 74 * hs;
    if (id === tc.tid) tc.tm = Math.max(tc.tm, Math.abs(scr[0] - tc.tx) + Math.abs(scr[1] - tc.ty));
    if (id === tc.jid) { tc.jx = Math.max(-1, Math.min(1, (scr[0] - tc.jox) / R)); tc.jy = Math.max(-1, Math.min(1, (scr[1] - tc.joy) / R)); }
    else if (id === tc.lid) { const k = 3.2 / W / 0.0022; mdx += (scr[0] - tc.lx) * k; mdy += (scr[1] - tc.ly) * k; tc.lx = scr[0]; tc.ly = scr[1]; }
  };
  const pu = (e) => {
    const id = e.pointerId; if (id === tc.jid) { tc.jid = -1; tc.jx = tc.jy = 0; } if (id === tc.lid) tc.lid = -1;
    if (gx.on) { const o = mp.ptrs.get(id); mp.ptrs.delete(id); if (o && mp.moved < 10 * hs && !mp.ptrs.size && performance.now() - mp.t0 < 450) gxPick(o[0], o[1]); return; }
    if (mp.on) { const o = mp.ptrs.get(id); mp.ptrs.delete(id); if (o && mp.moved < 10 * hs && !mp.ptrs.size && performance.now() - mp.t0 < 450) mp.sel = mapPick(o[0], o[1]); return; }
    if (id === tc.tid) { tc.tid = -1; if (tc.tm < 14 * hs && performance.now() - tc.tt < 320) pick(tc.tx, tc.ty, 46 * hs); } // short tap = select target
  };
  const noCtx = (e) => e.preventDefault(), whl = (e) => { if (gx.on) { e.preventDefault(); gx.dist = Math.max(60, Math.min(9e6, gx.dist * Math.exp(e.deltaY * 0.0015))); return; } if (mp.on) { e.preventDefault(); mp.zoom *= Math.exp(e.deltaY * 0.0015); } };
  window.addEventListener('keydown', kd); window.addEventListener('keyup', ku); window.addEventListener('mousemove', mm);
  canvas.addEventListener('pointerdown', pd); canvas.addEventListener('pointermove', pmv); canvas.addEventListener('pointerup', pu); canvas.addEventListener('pointercancel', pu); canvas.addEventListener('contextmenu', noCtx); canvas.addEventListener('wheel', whl, { passive: false });

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
  const circ = (x, y, r, th, cr, cg, cb, a) => { if (hn >= MAXH) return; const o = hn++ * HSTR; hudF[o] = x; hudF[o + 1] = y; hudF[o + 2] = r; hudF[o + 3] = 0; hudF[o + 4] = cr; hudF[o + 5] = cg; hudF[o + 6] = cb; hudF[o + 7] = a; hudF[o + 8] = -2; hudF[o + 9] = th; };
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
  const hidden = (i) => { // is body i behind the planet/moon we are flying over?
    if (!prValid || i === prBody) return false; const o = i * 3, q = prBody * 3, dx = pos[o] - cam[0], dy = pos[o + 1] - cam[1], dz = pos[o + 2] - cam[2], dl = Math.hypot(dx, dy, dz);
    const cx = pos[q] - cam[0], cy = pos[q + 1] - cam[1], cz = pos[q + 2] - cam[2], t = (cx * dx + cy * dy + cz * dz) / dl, Rb = sys.list[prBody].R;
    return t > 0 && t < dl && cx * cx + cy * cy + cz * cz - t * t < Rb * Rb; };
  const lab = (t, x, y) => { ts(t); tout(x, y + 3 * hs, 15 * hs, 0.5, 0.72, 0.9, 0.85, 0); }; // dim panel label
  const tanY = () => Math.tan(fov / 2);
  const project = (x, y, z) => { // camera-relative f64 point -> screen px in scr[], returns false if behind
    const vz = x * fw[0] + y * fw[1] + z * fw[2]; if (vz < 1e-3) return false;
    const ty = tanY(), tx = ty * W / H;
    scr[0] = (0.5 + 0.5 * (x * rt[0] + y * rt[1] + z * rt[2]) / (vz * tx)) * W; scr[1] = (0.5 - 0.5 * (x * up[0] + y * up[1] + z * up[2]) / (vz * ty)) * H; scr[2] = vz; return true;
  };
  function orbitPath(i, cr, cg, cb, a, w) { // projected orbit ellipse of body i around its parent
    const b = sys.list[i], p = b.parent * 3, N = b.ecc > 0 ? 160 : 128; let px = 0, py = 0, ok = false;
    if (b.jpl) { jplSet(b, (jdNow() - 2451545) / 36525); for (let k = 0; k <= 160; k++) { jplPos((k / 160) * 6.283185307179586, kp); const v = project(kp[0] - cam[0], kp[1] - cam[1], kp[2] - cam[2]);
      if (v && ok && Math.abs(scr[0] - px) + Math.abs(scr[1] - py) < 4 * W) seg(px, py, scr[0], scr[1], cr, cg, cb, a, w); ok = v; px = scr[0]; py = scr[1]; } return; }
    for (let k = 0; k <= N; k++) {
      const M = (k / N) * 6.283185307179586; let x, z;
      if (b.ecc > 0) { x = b.a * (Math.cos(M) - b.ecc); z = b.a * Math.sqrt(1 - b.ecc * b.ecc) * Math.sin(M); } else { x = b.a * Math.cos(M); z = b.a * Math.sin(M); }
      const y = -z * Math.sin(b.inc), zi = z * Math.cos(b.inc), cn = Math.cos(b.node), sn = Math.sin(b.node);
      const v = project(pos[p] + x * cn - zi * sn - cam[0], pos[p + 1] + y - cam[1], pos[p + 2] + x * sn + zi * cn - cam[2]);
      if (v && ok && Math.abs(scr[0] - px) + Math.abs(scr[1] - py) < 4 * W) seg(px, py, scr[0], scr[1], cr, cg, cb, a, w);
      ok = v; px = scr[0]; py = scr[1];
    }
  }
  const col3 = new Float32Array(3);
  const bodyCol = (i) => { const b = sys.list[i], c = b.type === 'star' ? b.star.color : b.type === 'station' ? null : b.def.surface && b.def.surface.c && b.def.surface.c[0];
    if (!c) { col3[0] = 0.55; col3[1] = 0.8; col3[2] = 1; } else for (let j = 0; j < 3; j++) col3[j] = Math.min(1, Math.pow(c[j], 0.6) * (b.type === 'star' ? 1.3 : 1.15)); return col3; };
  const lx = new Float32Array(MAXB), ly = new Float32Array(MAXB), lv = new Uint8Array(MAXB), lbx = new Float32Array(64 * 3);
  const inMap = (i) => i === mp.focus || sys.list[i].parent === mp.focus;
  const mapR = (i, pr, s) => { const b = sys.list[i]; return Math.max(pr, (i === mp.focus && i ? 10 : b.type === 'star' ? 9 : b.type === 'planet' ? Math.max(3.5, Math.min(9, 3 + Math.log10(b.R / 2e5) * 2.5)) : b.type === 'moon' ? 4 : 3) * s); };
  function mapPick(x, y) { let bi = -1, bd = (40 * hs) ** 2;
    for (let i = 0; i < sys.n; i++) { if (!inMap(i)) continue; const o = i * 3; if (!project(pos[o] - cam[0], pos[o + 1] - cam[1], pos[o + 2] - cam[2])) continue;
      const r = mapR(i, (sys.list[i].R / scr[2]) / tanY() * H * 0.5, hs), d2 = (scr[0] - x) ** 2 + (scr[1] - y) ** 2; if (d2 < Math.max(bd, r * r)) { bd = d2; bi = i; } }
    return bi; }
  const LMAX = { c: [0, 0.5, 0.2, 0.07], m: [0, 0.25, 0.1, 0.1], s: [0, 2.2, 0.8, 0.8], o: [0, 4, 4, 4], x: [0, 1.5, 0.5, 0.5], l: [0, 0.6, 0.25, 0.25] }, LMIN = { s: 0.015, o: 0.1 };
  function lmHud(s) { // landmark labels on the body you are near: rank-gated by altitude, horizon-culled, decluttered
    let nl = 0; const lh = 15 * s;
    for (let k = 0; k < sys.lm.length; k++) {
      const m = sys.lm[k], b = sys.list[m.bi], o = m.bi * 3, cx = cam[0] - pos[o], cy = cam[1] - pos[o + 1], cz = cam[2] - pos[o + 2], d = Math.hypot(cx, cy, cz), al = (d - b.R) / b.R;
      const mx = LMAX[m.kind][m.rank], mn = LMIN[m.kind] || 0; if (al > mx || al < mn * 0.7) continue;
      qrot(t3, 0, bq, m.bi * 4, m.dir[0], m.dir[1], m.dir[2]); const hz = (cx * t3[0] + cy * t3[1] + cz * t3[2]) / b.R; if (hz < 1.0002) continue; // behind the horizon
      const rr = b.R * (1 + m.elev * 5.5e-7 + 1e-4); if (!project(t3[0] * rr - cx, t3[1] * rr - cy, t3[2] * rr - cz)) continue;
      const x = scr[0], y = scr[1]; if (x < 0 || y < 0 || x > W || y > H) continue;
      const a = Math.min(1, (mx - al) / (mx * 0.25)) * (mn ? smooth(mn * 0.7, mn, al) : 1) * (ap.on && ap.k === k ? 1 : 0.9), wl = m.name.length * lh * 0.6; let hit = false;
      for (let j = 0; j < nl && !hit; j++) hit = Math.abs(lbx[j * 3] + lbx[j * 3 + 2] / 2 - x - wl / 2 - 9 * s) < (lbx[j * 3 + 2] + wl) / 2 + 6 * s && Math.abs(lbx[j * 3 + 1] - y) < lh * 1.2;
      if (hit || nl >= 64) continue; lbx[nl * 3] = x + 9 * s; lbx[nl * 3 + 1] = y; lbx[nl * 3 + 2] = wl; nl++;
      const w = m.kind === 's' || m.kind === 'o', cr = m.kind === 'm' ? 1 : w ? 0.6 : m.kind === 'l' ? 0.6 : 1, cg = m.kind === 'm' ? 0.75 : w ? 0.85 : 1, cb = m.kind === 'm' ? 0.45 : w ? 1 : m.kind === 'l' ? 0.7 : 1, tgt = ap.k === k && (ap.on || ap.pend);
      if (!w) circ(x, y, (tgt ? 6 : 3.5) * s, 1.6 * s, cr, cg, cb, a); if (tgt) circ(x, y, 12 * s, 2 * s, 1, 0.8, 0.3, a);
      ts(m.name); tout(w ? x - wl / 2 : x + 9 * s, y - 8 * s, lh, cr, cg, cb, a, 0);
    }
  }
  const sd3 = new Float64Array(3);
  function starHud(s) { // catalogue stars as soft glows; named near the crosshair or when selected for warp
    if (STARS[here].gal) return;
    for (let k = 0; k < STARS.length; k++) { if (k === here || STARS[k].gal) continue; const st = STARS[k], dl = starDir(k, sd3);
      if (!project(sd3[0] * 1e13, sd3[1] * 1e13, sd3[2] * 1e13)) continue; const x = scr[0], y = scr[1]; if (x < 0 || y < 0 || x > W || y > H) continue;
      let occ = false; for (let i = 0; i < sys.n && !occ; i++) { const b = sys.list[i]; if (!b.sphere) continue; const o = i * 3, qx = pos[o] - cam[0], qy = pos[o + 1] - cam[1], qz = pos[o + 2] - cam[2], tt = qx * sd3[0] + qy * sd3[1] + qz * sd3[2];
        occ = tt > 0 && qx * qx + qy * qy + qz * qz - tt * tt < b.R * b.R * 1.1; } if (occ) continue;
      const c = SCOL[st.cls], lum = Math.log10(st.rad * st.rad * ({ O: 30, B: 12, A: 3, F: 1.5, G: 1, K: 0.5, M: 0.15 })[st.cls] + 1e-3) - 2 * Math.log10(Math.max(dl, 1)), r = Math.max(1.5, Math.min(5, 3 + lum * 0.8)) * s, sel = k === wsel;
      circ(x, y, r * 2.2, 0, c[0], c[1], c[2], 0.12); circ(x, y, r, 0, c[0], c[1], c[2], 0.85);
      const near = Math.abs(x - W / 2) < W * 0.12 && Math.abs(y - H / 2) < H * 0.12;
      if (sel) { circ(x, y, r + 9 * s, 2 * s, 1, 0.8, 0.3, 0.95); }
      if (sel || near) { ts(st.name); ts('  '); tn(dl, dl < 100 ? 1 : 0); ts(' ly'); tout(x + r + 10 * s, y - 8 * s, 15 * s, sel ? 1 : c[0], sel ? 0.85 : c[1], sel ? 0.4 : c[2], sel ? 1 : 0.75, 0); } }
  }
  function mapHud(s) { // HUD while the camera is out in map view: bright orbits, coloured markers, labels, the ship
    const fa = smooth(0.25, 1, mp.a), f = mp.focus;
    for (let i = 1; i < sys.n; i++) if (sys.list[i].parent === f) orbitPath(i, i === target ? 0.5 : 0.4, i === target ? 1 : 0.7, i === target ? 0.8 : 1, fa * (i === target ? 0.85 : sys.list[i].type === 'comet' ? 0.3 : 0.45), (i === target ? 2 : 1.3) * s);
    for (let i = 0; i < sys.n; i++) {
      if (!inMap(i)) continue; const o = i * 3; if (!project(pos[o] - cam[0], pos[o + 1] - cam[1], pos[o + 2] - cam[2])) continue;
      const b = sys.list[i], x = scr[0], y = scr[1], pr = (b.R / scr[2]) / tanY() * H * 0.5, r = mapR(i, pr, s), c = bodyCol(i);
      if (pr < r) circ(x, y, r, 0, c[0], c[1], c[2], fa);
      if (i === mp.sel) circ(x, y, r + 7 * s, 2.5 * s, 1, 0.8, 0.3, fa); if (i === target) circ(x, y, r + (i === mp.sel ? 13 : 7) * s, 2 * s, 0.5, 1, 0.8, fa);
      lx[i] = x + r + 8 * s; ly[i] = y; lv[i] = 1;
    }
    if (!sys.byR) sys.byR = sys.list.map((_, i) => i).sort((a, b) => sys.list[b].R - sys.list[a].R); // label priority: big bodies first
    let nl = 0; const lh = 17 * s;
    for (let pass = 0; pass < 2; pass++) for (let q = 0; q < sys.n; q++) {
      const i = sys.byR[q], imp = i === target || i === mp.sel; if (!lv[i] || (pass === 0) !== imp) continue; lv[i] = 0;
      let nk = 0; if (f === 0 && i) for (let j = 1; j < sys.n; j++) if (sys.list[j].parent === i) nk++;
      const b = sys.list[i], wl = (b.name.length + (nk ? 4 : 0)) * lh * 0.6; let hit = false;
      for (let k = 0; k < nl && !hit; k++) hit = Math.abs(lbx[k * 3] + lbx[k * 3 + 2] / 2 - lx[i] - wl / 2) < (lbx[k * 3 + 2] + wl) / 2 + 4 * s && Math.abs(lbx[k * 3 + 1] - ly[i]) < lh * 1.1;
      if (hit || nl >= 64) continue; lbx[nl * 3] = lx[i]; lbx[nl * 3 + 1] = ly[i]; lbx[nl * 3 + 2] = wl; nl++;
      ts(b.name); if (nk) { ts('  +'); tn(nk, 0); } tout(lx[i], ly[i] - 9 * s, lh, disc[i] ? 0.8 : 1, disc[i] ? 0.92 : 0.78, disc[i] ? 1 : 0.35, fa, 0);
    }
    if (project(abs[0] - cam[0], abs[1] - cam[1], abs[2] - cam[2])) { // the ship: arrow along its heading
      const x = scr[0], y = scr[1], k = Math.hypot(abs[0] - cam[0], abs[1] - cam[1], abs[2] - cam[2]) * 0.03;
      let ax = 0, ay = -1; if (project(abs[0] + fw0[0] * k - cam[0], abs[1] + fw0[1] * k - cam[1], abs[2] + fw0[2] * k - cam[2])) { const l = Math.hypot(scr[0] - x, scr[1] - y); if (l > 1e-3) { ax = (scr[0] - x) / l; ay = (scr[1] - y) / l; } }
      const L = 13 * s; seg(x + ax * L, y + ay * L, x - ax * L * 0.6 - ay * L * 0.6, y - ay * L * 0.6 + ax * L * 0.6, 1, 0.76, 0.35, fa, 3 * s); seg(x + ax * L, y + ay * L, x - ax * L * 0.6 + ay * L * 0.6, y - ay * L * 0.6 - ax * L * 0.6, 1, 0.76, 0.35, fa, 3 * s);
      seg(x - ax * L * 0.6 - ay * L * 0.6, y - ay * L * 0.6 + ax * L * 0.6, x - ax * L * 0.6 + ay * L * 0.6, y - ay * L * 0.6 - ax * L * 0.6, 1, 0.76, 0.35, fa, 3 * s);
      ts('YOU'); tout(x + 14 * s, y + 6 * s, 15 * s, 1, 0.76, 0.35, fa, 0);
    }
  }
  function buildHud(dt, spd) {
    hn = 0; const ch = canvas.clientHeight || H, s = hs = (H / ch) * Math.max(0.85, Math.min(1.45, ch / 850)), cx = W / 2, cy = H / 2; // HUD scale from CSS size: readable on phones and 4K alike
    if (photo && !mp.on) return; // photo mode: no HUD at all
    if (wp.on) { const st = STARS[wp.dest], rem = wp.ly * (1 - smooth(0, 1, Math.min(1, Math.max(0, (wp.t - WT1) / WT2)))), a = wp.t > WT1 + WT2 ? Math.max(0, 1 - (wp.t - WT1 - WT2) / WT3 * 2) : 1;
      ts(wp.t < WT1 ? 'SPOOLING' : wp.t < WT1 + WT2 ? 'IN WARP' : 'ARRIVING'); tout(cx, H - 120 * s, 15 * s, 0.6, 0.85, 1, 0.8 * a, 0.5);
      ts(st.name); tout(cx, H - 98 * s, 28 * s, 1, 1, 1, a, 0.5); if (rem > 1e5) { tn(rem / 1e6, 2); ts(' million ly'); } else { tn(rem, rem < 10 ? 2 : 1); ts(' ly'); } tout(cx, H - 58 * s, 20 * s, 1, 0.8, 0.4, a, 0.5);
      const bw = 160 * s, pr = Math.min(1, wp.t / (WT1 + WT2)); seg(cx - bw, H - 28 * s, cx + bw, H - 28 * s, 0.3, 0.4, 0.5, 0.4 * a, 3 * s); seg(cx - bw, H - 28 * s, cx - bw + 2 * bw * pr, H - 28 * s, 1, 0.8, 0.4, a, 3 * s); return; }
    if (gx.a > 0.5) { gxHud(s); return; }
    if (mp.a > 0.02) { mapHud(s); return; }
    // orbit paths: planets around the star + moons/stations of the local planet
    const loc = ship.ref > 0 ? (sys.list[ship.ref].parent > 0 ? sys.list[ship.ref].parent : ship.ref) : -1;
    for (let i = 1; i < sys.n && !prValid; i++) { const b = sys.list[i]; if (b.parent === 0 || b.parent === loc) orbitPath(i, 0.35, 0.7, 1, i === target ? 0.55 : 0.16, 1.2 * s); }
    // body markers + names
    for (let i = 0; i < sys.n; i++) {
      const o = i * 3; if (!project(pos[o] - cam[0], pos[o + 1] - cam[1], pos[o + 2] - cam[2])) continue;
      const b = sys.list[i], prad = (b.R / scr[2]) / tanY() * H * 0.5;
      if (i === target || prad > 60 || scr[0] < 0 || scr[1] < 0 || scr[0] > W || scr[1] > H) continue;
      if (b.type === 'station' && dist(i) > 2e8) continue;
      if (b.type === 'moon' && b.parent !== loc && b.parent !== ship.ref) continue;
      if (hidden(i)) continue;
      const x = scr[0], y = scr[1], C = disc[i] ? 0.55 : 1, Cg = disc[i] ? 0.9 : 0.72, Cb = disc[i] ? 1 : 0.3; // amber = uncharted
      circ(x, y, 4.5 * s, 1.6 * s, C, Cg, Cb, 0.7);
      ts(b.name); tout(x + 10 * s, y - 9 * s, 17 * s, C, Cg, Cb, 0.8, 0);
    }
    if (sys.lm.length && !bench.on) lmHud(s);
    if (!bench.on) starHud(s);
    // target bracket / off-screen arrow
    const to = target * 3, tbdy = sys.list[target], td = dist(target);
    closing += ((lastDist - td) / Math.max(dt, 1e-4) - closing) * Math.min(1, dt * 4); lastDist = td;
    const tx = pos[to] - cam[0], ty = pos[to + 1] - cam[1], tz = pos[to + 2] - cam[2];
    const vis = project(tx, ty, tz) && scr[0] > 0 && scr[1] > 0 && scr[0] < W && scr[1] < H;
    if (vis && !(prValid && prBody === target)) {
      const e = smooth(0, 0.35, tgtT), x = scr[0], y = scr[1], r = Math.max(24 * s, (tbdy.R * (tbdy.sphere ? 1.05 : 2)) / scr[2] / tanY() * H * 0.5) * (1 + 2.5 * (1 - e)), l = Math.min(r * 0.4, 30 * s);
      if (tgtT < 1.6) { const a = 1 - smooth(0.8, 1.6, tgtT); seg(cx, cy, x, y, 0.5, 1, 0.8, 0.5 * a, 1.5 * s); circ(x, y, r * 1.15, 2 * s, 0.5, 1, 0.8, 0.6 * a * e); } // lock-on: brackets snap in, link line from the crosshair
      for (let k = 0; k < 4; k++) { const sx = k & 1 ? 1 : -1, sy = k & 2 ? 1 : -1; seg(x + sx * r, y + sy * r, x + sx * (r - l), y + sy * r, 0.5, 1, 0.8, 0.95, 2.2 * s); seg(x + sx * r, y + sy * r, x + sx * r, y + sy * (r - l), 0.5, 1, 0.8, 0.95, 2.2 * s); }
      const lx = Math.min(x + r + 10 * s, W - 260 * s), ly = Math.max(y - r, 70 * s);
      if (tgtT < 2) { ts('TARGET LOCKED'); tout(lx, ly - 22 * s, 14 * s, 0.5, 1, 0.8, 1 - smooth(1.2, 2, tgtT), 0); }
      ts(tbdy.name); tout(lx, ly, 22 * s, 0.65, 1, 0.85, 1, 0);
      tdist(td - tbdy.R); ts('   '); tdist(closing); ts('/s'); tout(lx, ly + 27 * s, 17 * s, 0.65, 1, 0.85, 0.85, 0);
      if (!disc[target]) { ts('UNCHARTED - fly close to log'); tout(lx, ly + 50 * s, 16 * s, 1, 0.72, 0.3, 0.9, 0); }
    } else if (!vis) {
      let ax = tx * rt[0] + ty * rt[1] + tz * rt[2], ay = -(tx * up[0] + ty * up[1] + tz * up[2]); const l = Math.hypot(ax, ay) || 1; ax /= l; ay /= l;
      const R = Math.min(W, H) * 0.4, x = cx + ax * R, y = cy + ay * R, k = 18 * s;
      seg(x, y, x - ax * k - ay * k * 0.6, y - ay * k + ax * k * 0.6, 0.5, 1, 0.8, 0.95, 3 * s); seg(x, y, x - ax * k + ay * k * 0.6, y - ay * k - ax * k * 0.6, 0.5, 1, 0.8, 0.95, 3 * s);
      ts(tbdy.name); tout(x - ax * 46 * s, y - ay * 46 * s - 9 * s, 18 * s, 0.65, 1, 0.85, 0.95, 0.5);
    }
    // space dust: world-anchored motes in a wrapped box around the camera (reference-body frame) → speed streaks
    const dvx = ship.vel[0] + fv[0], dvy = ship.vel[1] + fv[1], dvz = ship.vel[2] + fv[2], dsp = Math.hypot(dvx, dvy, dvz); // motion relative to the dust frame
    if (!bench.on && !cruise && dsp > 3 && !prValid) {
      const D = Math.max(256, Math.pow(4, Math.ceil(Math.log(dsp * 2.5) / Math.log(4)))), h = D / 2, kv = Math.min(0.12, (0.3 * D) / dsp), fa = Math.min(1, (dsp - 3) / 30);
      const ox = cam[0] - pos[anc * 3], oy = cam[1] - pos[anc * 3 + 1], oz = cam[2] - pos[anc * 3 + 2];
      for (let i = 0; i < 160; i++) {
        let x = dust[i * 3] * D - ox, y = dust[i * 3 + 1] * D - oy, z = dust[i * 3 + 2] * D - oz;
        x -= D * Math.floor(x / D) + h; y -= D * Math.floor(y / D) + h; z -= D * Math.floor(z / D) + h; // wrap into [-h, h)
        const r = Math.hypot(x, y, z) / h; if (r > 1 || !project(x, y, z)) continue; const ax = scr[0], ay = scr[1];
        if (!project(x + dvx * kv, y + dvy * kv, z + dvz * kv)) continue;
        const a = fa * 0.85 * (1 - r) * (1 - r); seg(ax, ay, scr[0], scr[1], 0.75, 0.85, 1, a, 1.4 * s);
      }
    }
    // flight HUD near a surface: artificial horizon + pitch ladder (local vertical), big ALT / V-SPEED / SPEED readouts
    if (prValid && !bench.on) {
      const o = prBody * 3, d = Math.hypot(cam[0] - pos[o], cam[1] - pos[o + 1], cam[2] - pos[o + 2]);
      const nx = (cam[0] - pos[o]) / d, ny = (cam[1] - pos[o + 1]) / d, nz = (cam[2] - pos[o + 2]) / d, fa = Math.min(1, (0.05 - altT / sys.list[prBody].R) * 60);
      const pitch = Math.asin(Math.max(-1, Math.min(1, nx * fw[0] + ny * fw[1] + nz * fw[2]))) / D2R;
      let ux = nx * rt[0] + ny * rt[1] + nz * rt[2], uy = -(nx * up[0] + ny * up[1] + nz * up[2]); const ul = Math.hypot(ux, uy);
      if (ul > 0.03 && fa > 0) { ux /= ul; uy /= ul; const fpx = (H * 0.5) / tanY(), px = -uy, py = ux;
        for (let p = -80; p <= 80; p += 10) {
          const dp = pitch - p; if (Math.abs(dp) > 26) continue; const off = Math.tan(dp * D2R) * fpx, mx = cx - ux * off, my = cy - uy * off;
          const hz = p === 0, half = hz ? Math.min(W * 0.3, 420 * s) : 80 * s, gap = hz ? 110 * s : 34 * s, a = fa * (hz ? 0.75 : 0.5) * (1 - smooth(18, 26, Math.abs(dp)));
          const nd = p < 0 ? 3 : 1, sl = (half - gap) / nd; // below-horizon rungs are dashed
          for (let k = 0; k < nd; k++) { const g0 = gap + k * sl, g1 = gap + (k + (nd > 1 ? 0.6 : 1)) * sl;
            seg(mx - px * g1, my - py * g1, mx - px * g0, my - py * g0, 0.55, 1, 0.7, a, (hz ? 2.4 : 1.6) * s); seg(mx + px * g0, my + py * g0, mx + px * g1, my + py * g1, 0.55, 1, 0.7, a, (hz ? 2.4 : 1.6) * s); }
          if (!hz) { const tk = (p > 0 ? 9 : -9) * s; seg(mx - px * half, my - py * half, mx - px * half + ux * tk, my - py * half + uy * tk, 0.55, 1, 0.7, a, 1.6 * s); seg(mx + px * half, my + py * half, mx + px * half + ux * tk, my + py * half + uy * tk, 0.55, 1, 0.7, a, 1.6 * s);
            tn(Math.abs(p), 0); tout(mx + px * (half + 24 * s), my + py * (half + 24 * s) - 8 * s, 16 * s, 0.55, 1, 0.7, a, 0.5); }
        }
      }
      const vr = ship.vel[0] * nx + ship.vel[1] * ny + ship.vel[2] * nz, rx = cx + 150 * s, lx2 = cx - 150 * s;
      ts(landed ? 'LANDED' : 'ALT'); tout(rx, cy - 44 * s, 15 * s, 0.55, 1, 0.7, 0.75 * fa, 0);
      if (!landed) { tdist(Math.max(0, altT - clr)); tout(rx, cy - 22 * s, 26 * s, 0.75, 1, 0.8, fa, 0); }
      ts('V/S '); if (vr > 0) ts('+'); tn(Math.abs(vr) < 1e4 ? vr : vr / 1e3, 0); ts(Math.abs(vr) < 1e4 ? ' m/s' : ' km/s'); tout(rx, cy + 14 * s, 17 * s, vr < -150 && altT < 3000 ? 1 : 0.55, vr < -150 && altT < 3000 ? 0.45 : 1, vr < -150 && altT < 3000 ? 0.35 : 0.7, 0.9 * fa, 0);
      ts('SPD'); tout(lx2, cy - 44 * s, 15 * s, 0.55, 1, 0.7, 0.75 * fa, 1); tdist(spd); ts('/s'); tout(lx2, cy - 22 * s, 26 * s, 0.75, 1, 0.8, fa, 1);
      ts('PITCH '); tn(pitch, 0); tout(lx2, cy + 14 * s, 17 * s, 0.55, 1, 0.7, 0.9 * fa, 1);
    }
    // supercruise charge ring
    if (charge >= 0) { const k = 1 - charge / 1.2, R = 50 * s, N = Math.max(1, Math.floor(40 * k));
      circ(cx, cy, R, 1.2 * s, 1, 0.8, 0.3, 0.25);
      for (let i = 0; i < N; i++) { const a0 = -1.5708 + (i / 40) * 6.2832, a1 = -1.5708 + ((i + 1) / 40) * 6.2832; seg(cx + Math.cos(a0) * R, cy + Math.sin(a0) * R, cx + Math.cos(a1) * R, cy + Math.sin(a1) * R, 1, 0.8, 0.3, 0.95, 4 * s); }
      ts('CHARGING SUPERCRUISE'); tout(cx, cy + 70 * s, 19 * s, 1, 0.8, 0.3, 0.95, 0.5); }
    // event banner (atmosphere entry/exit, surface approach, touchdown)
    if (bannerT > 0) { const a = Math.min(1, bannerT * 1.5, (3.2 - bannerT) * 5), by = H * 0.72, bw = Math.min(W * 0.5 - 10 * s, (bannerS.length * 15 + 60) * s);
      seg(cx - bw, by, cx + bw, by, 0.02, 0.03, 0.05, 0.5 * a, 46 * s); seg(cx - bw, by - 23 * s, cx + bw, by - 23 * s, bannerHot ? 1 : 0.5, bannerHot ? 0.55 : 1, bannerHot ? 0.2 : 0.8, 0.8 * a, 2 * s); seg(cx - bw, by + 23 * s, cx + bw, by + 23 * s, bannerHot ? 1 : 0.5, bannerHot ? 0.55 : 1, bannerHot ? 0.2 : 0.8, 0.8 * a, 2 * s);
      ts(bannerS); tout(cx, by - 12 * s, 24 * s, bannerHot ? 1 : 0.7, bannerHot ? 0.75 : 1, bannerHot ? 0.45 : 0.85, a, 0.5); }
    // discovery toast
    if (toastT > 0 && toastI >= 0) { const tb2 = sys.list[toastI], a = Math.min(1, toastT, (5 - toastT) * 4), ty0 = Math.max(H * 0.2, 185 * s), bw = Math.min(W * 0.5 - 10 * s, 400 * s);
      seg(cx - bw, ty0 + 52 * s, cx + bw, ty0 + 52 * s, 0.01, 0.02, 0.05, 0.6 * a, 135 * s); seg(cx - bw, ty0 - 15 * s, cx + bw, ty0 - 15 * s, 1, 0.75, 0.3, 0.8 * a, 2 * s);
      ts(toastAll ? 'SYSTEM SURVEYED - EVERY BODY LOGGED' : 'NEW DISCOVERY'); tout(cx, ty0, 18 * s, 1, 0.75, 0.3, a, 0.5);
      ts(tb2.name); tout(cx, ty0 + 25 * s, 40 * s, 1, 1, 1, a, 0.5);
      if (tb2.def && tb2.def.fact) { const fz = Math.min(19 * s, (bw * 2 - 20 * s) / (tb2.def.fact.length * 0.6)); ts(tb2.def.fact); tout(cx, ty0 + 74 * s, fz, 0.75, 0.9, 1, a * 0.95, 0.5); }
      ts('LOG '); tn(nDisc, 0); ts(' / '); tn(sys.n, 0); tout(cx, ty0 + 100 * s, 16 * s, 1, 0.75, 0.3, a * 0.85, 0.5); }
    // reticle + velocity vector
    const rr = 11 * s; seg(cx - 2.4 * rr, cy, cx - rr, cy, 0.75, 0.92, 1, 0.75, 2 * s); seg(cx + rr, cy, cx + 2.4 * rr, cy, 0.75, 0.92, 1, 0.75, 2 * s); seg(cx, cy + rr, cx, cy + 2 * rr, 0.75, 0.92, 1, 0.75, 2 * s);
    circ(cx, cy, 2 * s, 0, 0.75, 0.92, 1, 0.8);
    if (spd > 1 && !cruise && project(ship.vel[0], ship.vel[1], ship.vel[2])) { const x = scr[0], y = scr[1], k = 9 * s; circ(x, y, k * 0.6, 2 * s, 1, 0.8, 0.3, 0.85); seg(x - k * 1.6, y, x - k * 0.6, y, 1, 0.8, 0.3, 0.85, 2 * s); seg(x + k * 0.6, y, x + k * 1.6, y, 1, 0.8, 0.3, 0.85, 2 * s); seg(x, y - k * 0.6, x, y - k * 1.4, 1, 0.8, 0.3, 0.85, 2 * s); }
    // telemetry panel (top-left): dim labels, bright values, on a translucent backing
    const L = 18 * s, T = 16 * s, F = 19 * s, LH = 27 * s, VX = L + 16 * s + 84 * s, md = bench.on || cruise || charge >= 0, al = altT < 2e6;
    const ride = anc !== ship.ref && !cruise; let rows = 3 + (ride ? 1 : 0) + (md ? 1 : 0) + (al ? 1 : 0) + (cruise || bench.on ? 1 : 0) + (showStats ? (hasTS ? 3 : 2) : 0) + (bench.res ? 3.5 : 0);
    const PW = (bench.res ? 560 : 330) * s, PH = 46 * s + rows * LH; seg(L, T + PH / 2, L + PW, T + PH / 2, 0.01, 0.025, 0.05, 0.42, PH); seg(L, T, L, T + PH, 0.45, 0.85, 1, 0.85, 2.5 * s);
    let Y = T + 12 * s; const X = L + 16 * s;
    ts(sys.def.name); ts(' SYSTEM'); tout(X, Y, 14 * s, 0.5, 0.75, 0.95, 0.75, 0); Y += 24 * s;
    lab('SPEED', X, Y); tdist(spd); ts('/s'); tout(VX, Y - 4 * s, 25 * s, 0.85, 0.95, 1, 1, 0); Y += LH + 6 * s;
    if (md) { lab('MODE', X, Y); ts(bench.on ? 'BENCHMARK' : cruise ? 'SUPERCRUISE' : 'CHARGING'); tout(VX, Y, F, 1, 0.8, 0.3, 1, 0); Y += LH; }
    if (al) { lab('ALTITUDE', X, Y); if (landed) ts('LANDED'); else tdist(Math.max(0, altT - clr)); tout(VX, Y, F, 0.55, 1, 0.65, 1, 0); Y += LH; }
    if (ride) { lab('RIDING', X, Y); ts(sys.list[ship.ref].name); ts('  '); tdist(Math.hypot(fv[0], fv[1], fv[2])); ts('/s'); tout(VX, Y, F, 0.6, 0.85, 1, 1, 0); Y += LH; }
    lab('TARGET', X, Y); ts(tbdy.name); ts('  '); tdist(td - tbdy.R); tout(VX, Y, F, 0.65, 1, 0.85, 1, 0); Y += LH;
    if (cruise) { lab('ETA', X, Y); tn(Math.log(Math.max(td - tbdy.arrive, 1) / tbdy.arrive + 1) / 1.4 + 0.5, 1); ts(' s'); tout(VX, Y, F, 1, 0.8, 0.3, 1, 0); Y += LH; }
    if (bench.on) { lab('BENCH', X, Y); tn(60 - bench.t, 1); ts(' s left'); tout(VX, Y, F, 1, 0.8, 0.3, 1, 0); Y += LH; }
    lab('LOG', X, Y); tn(nDisc, 0); ts(' / '); tn(sys.n, 0); ts(' found'); tout(VX, Y, F, 1, 0.75, 0.3, 1, 0); Y += LH;
    if (showStats) {
      lab('FRAME', X, Y); ts(sys.list[ship.ref].name); tout(VX, Y, F, 0.85, 0.95, 1, 0.8, 0); Y += LH;
      lab('CPU', X, Y); tn(avgDt * 1000, 2); ts(' ms'); tout(VX, Y, F, 0.85, 0.95, 1, 0.8, 0); Y += LH;
      if (hasTS) { lab('GPU', X, Y); tn(gpuMs, 2); ts(' ms'); tout(VX, Y, F, gpuMs > 11 ? 1 : 0.85, gpuMs > 11 ? 0.5 : 0.95, gpuMs > 11 ? 0.4 : 1, 0.8, 0); Y += LH; }
    }
    if (bench.res) {
      Y += LH * 0.5; const r = bench.res;
      ts('BENCHMARK  '); tn(r.frames, 0); ts(' frames  '); tn(W, 0); ts('x'); tn(H, 0); tout(X, Y, F * 0.9, 1, 0.9, 0.5, 1, 0); Y += LH;
      ts('GPU avg '); tn(r.gpuAvg, 2); ts('  p99 '); tn(r.gpuP99, 2); ts('  max '); tn(r.gpuMax, 2); ts(' ms'); tout(X, Y, F * 0.9, 1, 0.9, 0.5, 1, 0); Y += LH;
      ts('CPU avg '); tn(r.cpuAvg, 2); ts('  p99 '); tn(r.cpuP99, 2); ts(' ms (interval)'); tout(X, Y, F * 0.9, 1, 0.9, 0.5, 1, 0); Y += LH;
    }
    let creditY = H - 12 * s;
    if (tc.on) { // on-screen controls: translucent filled discs with outline rings
      const R = 74 * s, jx = tc.jid >= 0 ? tc.jox : 130 * s, jy = tc.jid >= 0 ? tc.joy : H - 130 * s;
      circ(jx, jy, R, 0, 0.02, 0.05, 0.1, tc.jid >= 0 ? 0.3 : 0.18); circ(jx, jy, R, 2.5 * s, 0.55, 0.85, 1, tc.jid >= 0 ? 0.7 : 0.35);
      circ(jx + tc.jx * R, jy + tc.jy * R, 30 * s, 0, 0.55, 0.85, 1, tc.jid >= 0 ? 0.5 : 0.25);
      if (showHelp && tc.jid < 0) { ts('MOVE'); tout(jx, jy - 9 * s, 16 * s, 0.85, 0.95, 1, 0.8, 0.5); ts('DRAG RIGHT SIDE TO LOOK'); tout(W * 0.6, H - 34 * s, 16 * s, 0.75, 0.9, 1, 0.75, 0.5); }
    } else if (showHelp) {
      const l1 = 'W/S thrust   A/D strafe   SPACE/X up/down   Q/E roll   MOUSE look (click)   SHIFT boost', l2 = 'CLICK or T target   TAB next   F supercruise   V camera   M sound   B bench   J system   P photo   G stats   H help';
      const fz = Math.min(17 * s, (W - 40 * s) / (l2.length * 0.6)), by = H - 30 * s - fz * 2.6, bw = (l2.length * 0.6 * fz) / 2 + 20 * s;
      seg(cx - bw, by + fz * 1.15, cx + bw, by + fz * 1.15, 0.01, 0.025, 0.05, 0.4, fz * 3.2);
      ts(l1); tout(cx, by, fz, 0.8, 0.9, 1, 0.85, 0.5); ts(l2); tout(cx, by + fz * 1.45, fz, 0.8, 0.9, 1, 0.85, 0.5);
      creditY = H - 10 * s;
    }
    if (tilesSeen && altT < 3e6) { const mk = sys.list[prBody].def.surface.maps; ts(mk === 'moon' ? 'Imagery: NASA/GSFC/ASU LRO WAC (Moon Trek)' : mk === 'mars' ? 'Imagery: NASA/USGS Viking MDIM 2.1 (Mars Trek)' : 'Sentinel-2 cloudless by EOX (Copernicus Sentinel data 2023) - Elevation: AWS Terrain Tiles');
      tout(L, T + PH + 10 * s, 12 * s, 0.75, 0.85, 0.95, 0.7, 0); }
  }

  // ---- landmark autopilot: cruise to the body if needed, then a guided descent to a viewpoint beside the place ----
  const ap = { on: false, pend: false, k: -1, t: 0, a0: 1, a1: 1, ang: 0, d0: new Float64Array(3), d1: new Float64Array(3), ax: new Float64Array(3) };
  const VIEW = { c: [2500, 1500], m: [4500, 1300], s: [60000, 110000], o: [250000, 450000], x: [30000, 17000], l: [7000, 3500] }; // [stand-off distance, height] in game metres
  function apStart() {
    const m = sys.lm[ap.k], b = sys.list[m.bi], o = m.bi * 3, q = m.bi * 4, d = dist(m.bi), v = VIEW[m.kind], sc = b.R / 1.2e6;
    tq[0] = -bq[q]; tq[1] = -bq[q + 1]; tq[2] = -bq[q + 2]; tq[3] = bq[q + 3]; qrot(ap.d0, 0, tq, 0, (abs[0] - pos[o]) / d, (abs[1] - pos[o + 1]) / d, (abs[2] - pos[o + 2]) / d);
    const la = (m.lat + (m.lat > -60 ? -1 : 1) * (v[0] * Math.sqrt(sc) / b.R) / D2R) * D2R, lo = m.lon * D2R; ap.d1[0] = Math.cos(la) * Math.cos(lo); ap.d1[1] = Math.sin(la); ap.d1[2] = -Math.cos(la) * Math.sin(lo);
    ap.a0 = Math.max(d - b.R, 50); ap.a1 = b.R * m.elev * 5.5e-7 + v[1] * Math.sqrt(sc);
    const dt2 = Math.max(-1, Math.min(1, ap.d0[0] * ap.d1[0] + ap.d0[1] * ap.d1[1] + ap.d0[2] * ap.d1[2])); ap.ang = Math.acos(dt2);
    ap.ax[0] = ap.d0[1] * ap.d1[2] - ap.d0[2] * ap.d1[1]; ap.ax[1] = ap.d0[2] * ap.d1[0] - ap.d0[0] * ap.d1[2]; ap.ax[2] = ap.d0[0] * ap.d1[1] - ap.d0[1] * ap.d1[0];
    const l = Math.hypot(ap.ax[0], ap.ax[1], ap.ax[2]); if (l < 1e-6) { ap.ax[0] = 0; ap.ax[1] = 1; ap.ax[2] = 0; ap.ang = l < 1e-6 && dt2 < 0 ? Math.PI : 0; } else { ap.ax[0] /= l; ap.ax[1] /= l; ap.ax[2] /= l; }
    ap.on = true; ap.pend = false; ap.t = 0; ap.dur = 7 + ap.ang * 2.5; cruise = false; charge = -1; ship.ref = m.bi; ship.vel.fill(0); ship.w.fill(0); banner('AUTOPILOT - ' + m.name.toUpperCase(), false);
  }
  function apStep(dt) { // called every frame while on: position along the great circle with exponential altitude, look at the place
    const m = sys.lm[ap.k], b = sys.list[m.bi], o = m.bi * 3, q = m.bi * 4; ap.t = Math.min(1, ap.t + dt / ap.dur);
    const e = smooth(0, 1, ap.t), ea = smooth(0.15, 1, ap.t), alt2 = ap.a0 * Math.pow(ap.a1 / ap.a0, ea) + Math.sin(Math.PI * e) * ap.ang * b.R * 0.25; // arc up and over on long hops
    qaxis(dq, 0, ap.ax[0], ap.ax[1], ap.ax[2], ap.ang * e); qrot(t3, 0, dq, 0, ap.d0[0], ap.d0[1], ap.d0[2]); qrot(t3, 0, bq, q, t3[0], t3[1], t3[2]);
    const ux = t3[0], uy = t3[1], uz = t3[2], r = b.R + alt2; for (let j = 0; j < 3; j++) { abs[j] = pos[o + j] + t3[j] * r; ship.off[j] = abs[j] - pos[ship.ref * 3 + j]; } ship.vel.fill(0);
    qrot(t3, 0, bq, q, m.dir[0], m.dir[1], m.dir[2]); const rl = b.R * (1 + m.elev * 5.5e-7);
    qlook(dq, 0, pos[o] + t3[0] * rl - abs[0], pos[o + 1] + t3[1] * rl - abs[1], pos[o + 2] + t3[2] * rl - abs[2], ux, uy, uz); qslerp(ship.q, 0, dq, 0, 1 - Math.exp(-dt * (1 + 5 * e)));
    if (ap.t >= 1) { ap.on = false; rqRef = -1; banner('ARRIVED - ' + m.name.toUpperCase(), false); chime(false); }
  }
  function goPlace(k) { const m = sys.lm[k]; if (!m || bench.on) return; audioInit(); ap.k = k; ap.on = false; setTgt(m.bi);
    if (dist(m.bi) < sys.list[m.bi].arrive * 1.25) apStart(); else { ap.pend = true; if (!cruise && charge < 0) { charge = 1.2; cruiseV = 0; } } }
  // ---- interstellar warp: spool (turn + aberration builds) -> fold (near-c, starbow, ly pulses, system swap at mid) -> bloom (arrival flash) ----
  let here = 0, wsel = -1; const wp = { on: false, t: 0, dest: -1, ly: 0, beta: 0, fold: 0, pulse: 0, flash: 0, swapped: false, np: 0, dir: new Float64Array(3), end: new Float64Array(3), endQ: new Float64Array(4), sp: -1, st: new Float64Array(3) };
  const WT1 = 2.6, WT3 = 1.8; let WT2 = 9;
  const starDir = (k, o) => { const a = STARS[k].p, b = STARS[here].p; let x = a[0] - b[0], y = a[1] - b[1], z = a[2] - b[2]; const l = Math.hypot(x, y, z) || 1; o[0] = x / l; o[1] = y / l; o[2] = z / l; return l; };
  function warpTo(k) {
    if (k < 0 || k === here || wp.on || bench.on) return false; mp.on = false; audioInit(); mp.on = false; ap.on = ap.pend = false; cruise = false; charge = -1; wsel = -1;
    WT2 = STARS[k].gal || STARS[here].gal ? 15 : 9; gx.on = false; wp.on = true; wp.t = 0; wp.inT = false; wp.streak = 0; wp.dest = k; wp.ly = starDir(k, wp.dir); wp.swapped = false; wp.np = 0; wp.flash = 0; ship.vel.fill(0); ship.w.fill(0);
    banner('WARP - ' + STARS[k].name.toUpperCase(), true); whoosh(2.5, 120, 900, 0.14); return true;
  }
  function warpStep(dt) {
    wp.t += dt; const t = wp.t, st = STARS[wp.dest];
    if (t < WT1) { const u = t / WT1; wp.beta = 0.3 * u * u; wp.fold = 0; wp.streak = 0.35 * u * u; // spool: face the destination, stars begin to stretch
      qrot(up, 0, ship.q, 0, 0, 1, 0); qlook(dq, 0, wp.dir[0], wp.dir[1], wp.dir[2], up[0], up[1], up[2]); qslerp(ship.q, 0, dq, 0, 1 - Math.exp(-dt * 3)); }
    else if (t < WT1 + WT2) { const u = (t - WT1) / WT2; wp.beta = 0.3 + 0.35 * smooth(0, 0.1, u) * smooth(1, 0.85, u); wp.streak = 0.35 + 0.65 * smooth(0, 0.08, u); wp.fold = smooth(0.06, 0.16, u) * smooth(0.95, 0.84, u); // jump: streaks, then the tunnel
      if (u > 0.06 && !wp.inT) { wp.inT = true; wp.flash = 0.5; whoosh(2.2, 200, 3000, 0.22); } wp.flash *= Math.exp(-dt * 4);
      const np = Math.min(Math.max(4, Math.floor(wp.ly)), 24), pk = Math.floor(u * np); if (pk > wp.np) { wp.np = pk; blip(120, 60, 0.35, 'sine', 0.05); }
      if (!wp.swapped && u >= 0.5) { // mid-fold: swap to the destination system, start far out on the line towards the star
        wp.swapped = true; if (!STAR_SYSTEMS[st.id]) registerStarSystem(st.id === 'sol' ? STAR_SYSTEMS.sol : starDef(st)); switchStarSystem(st.id); here = wp.dest;
        wp.sp = ship.ref; for (let j = 0; j < 3; j++) wp.end[j] = ship.off[j]; wp.endQ.set(ship.q); // spawn pose (relative to its planet)
        let far = 0; for (let i = 1; i < sys.n; i++) far = Math.max(far, sys.list[i].a || 0); far = Math.max(far, sys.list[0].R * 40) * 6;
        for (let j = 0; j < 3; j++) wp.st[j] = -wp.dir[j] * far - pos[wp.sp * 3 + j]; // start offset relative to the spawn planet
      }
      if (!wp.swapped) { const v = 2e5 * Math.exp(19 * u); for (let j = 0; j < 3; j++) ship.off[j] += fw[j] * v * dt; } // racing away from home
      else { const w = (u - 0.5) / 0.5, rx = wp.st[0] - wp.end[0], ry = wp.st[1] - wp.end[1], rz = wp.st[2] - wp.end[2], K = Math.max(1, Math.log(Math.hypot(rx, ry, rz) / 400 + 1)), f = (Math.exp(-K * w) - Math.exp(-K)) / (1 - Math.exp(-K));
        ship.ref = wp.sp; ship.off[0] = wp.end[0] + rx * f; ship.off[1] = wp.end[1] + ry * f; ship.off[2] = wp.end[2] + rz * f; // exponential glide in
        qrot(up, 0, ship.q, 0, 0, 1, 0); qlook(dq, 0, -ship.off[0], -ship.off[1], -ship.off[2], up[0], up[1], up[2]); qslerp(ship.q, 0, smooth(0.6, 1, w) > 0 ? wp.endQ : dq, 0, 1 - Math.exp(-dt * 2)); }
    } else { const u = Math.min(1, (t - WT1 - WT2) / WT3); wp.beta = 0.3 * (1 - u) * (1 - u); wp.fold = 0; wp.streak = (1 - u) * (1 - u); wp.flash = u < 0.1 ? u / 0.1 * 0.6 : Math.max(0, 0.6 - (u - 0.1)); // exit: streaks retract to points
      if (u < 0.05 && wp.np >= 0) { wp.np = -1; whoosh(1.6, 2500, 150, 0.16); chime(true); }
      ship.ref = wp.sp; for (let j = 0; j < 3; j++) ship.off[j] = wp.end[j]; qslerp(ship.q, 0, wp.endQ, 0, 1 - Math.exp(-dt * 4));
      if (u >= 1) { wp.on = false; wp.beta = wp.fold = wp.flash = wp.streak = 0; banner('ARRIVED - ' + st.name.toUpperCase() + (st.id === 'sol' ? '' : ' SYSTEM'), false); } }
    ship.vel.fill(0); ship.w.fill(0);
  }
  // ---- galaxy view: an orbiting camera in galaxy space (light-years); zooms from the Sun out to the Local Group ----
  const gx = { on: false, a: 0, t: 0, focus: 0, yaw: 0.6, pitch: 0.9, dist: 150000, sel: -1, cam: new Float64Array(3), tg: new Float64Array(3), obs: new Float64Array(3) };
  const gxObs = () => { const st = STARS[here]; if (st.gal) { const G = GALAXIES.find((x) => x.id === st.id); gx.obs[0] = G.p[0] + G.R * 0.45; gx.obs[1] = G.p[1]; gx.obs[2] = G.p[2]; } else { const q = toGal(st.p); gx.obs[0] = SUN_G[0] + q[0]; gx.obs[1] = SUN_G[1] + q[1]; gx.obs[2] = SUN_G[2] + q[2]; } };
  function gxCam(dt) {
    gx.a = Math.max(0, Math.min(1, gx.a + (gx.on ? dt / 0.35 : -dt / 0.3))); if (gx.a <= 0) return; gx.t += dt; gxObs();
    const intro = gx.on ? smooth(0, 1.6, gx.t) : 1, D = gx.on ? Math.exp(Math.log(40) + (Math.log(gx.dist) - Math.log(40)) * intro) : gx.dist; // fly out from the ship's star
    const G = GALAXIES[gx.focus], k = gx.focus === 0 ? smooth(1500, 60000, D) : 1;
    for (let j = 0; j < 3; j++) gx.tg[j] = gx.obs[j] + (G.p[j] - gx.obs[j]) * k;
    const n = G.n, a1 = Math.abs(n[0]) > 0.9 ? [0, 0, 1] : [1, 0, 0], e1 = gnorm([n[1] * a1[2] - n[2] * a1[1], n[2] * a1[0] - n[0] * a1[2], n[0] * a1[1] - n[1] * a1[0]]), e2 = [n[1] * e1[2] - n[2] * e1[1], n[2] * e1[0] - n[0] * e1[2], n[0] * e1[1] - n[1] * e1[0]];
    const cp = Math.cos(gx.pitch), ox = cp * Math.sin(gx.yaw), oy = Math.sin(gx.pitch), oz = cp * Math.cos(gx.yaw); // orbit relative to the galaxy's own disk
    for (let j = 0; j < 3; j++) gx.cam[j] = gx.tg[j] + D * (e1[j] * ox + n[j] * oy + e2[j] * oz);
    if (gx.a > 0.5) { qlook(camQ, 0, gx.tg[0] - gx.cam[0], gx.tg[1] - gx.cam[1], gx.tg[2] - gx.cam[2], n[0], n[1], n[2]); }
  }
  const gxProj = (p) => project(p[0] - gx.cam[0], p[1] - gx.cam[1], p[2] - gx.cam[2]);
  function gxHud(s) {
    const fa = smooth(0.4, 1, gx.a), D = Math.hypot(gx.cam[0] - gx.tg[0], gx.cam[1] - gx.tg[1], gx.cam[2] - gx.tg[2]); let nl = 0;
    const put = (x, y, wl) => { for (let j = 0; j < nl; j++) if (Math.abs(lbx[j * 3] + lbx[j * 3 + 2] / 2 - x - wl / 2) < (lbx[j * 3 + 2] + wl) / 2 + 6 * s && Math.abs(lbx[j * 3 + 1] - y) < 26 * s) return false; if (nl < 64) { lbx[nl * 3] = x; lbx[nl * 3 + 1] = y; lbx[nl * 3 + 2] = wl; nl++; } return true; };
    gxObs(); if (gxProj(gx.obs)) { const x = scr[0], y = scr[1]; circ(x, y, 4 * s, 0, 1, 0.8, 0.35, fa); circ(x, y, 9 * s, 2 * s, 1, 0.8, 0.35, fa * 0.8); put(x + 14 * s, y, 13 * 15 * s * 0.6);
      ts('YOU ARE HERE'); tout(x + 14 * s, y - 8 * s, 15 * s, 1, 0.8, 0.35, fa, 0); ts(STARS[here].sn || STARS[here].name); tout(x + 14 * s, y + 10 * s, 13 * s, 1, 0.85, 0.6, fa * 0.8, 0); }
    for (const i of [0, 3, 4, 1, 2]) { const G = GALAXIES[i]; if (!gxProj(G.p)) continue; const x = scr[0], y = scr[1], pr = (G.R / scr[2]) / tanY() * H * 0.5;
      if (i === 0 && gx.focus === 0 && D < 600000) continue; if (i === gx.sel) circ(x, y, Math.max(pr * 0.35, 14 * s), 2.5 * s, 1, 0.8, 0.3, fa);
      const lx = x + Math.max(pr * 0.25, 10 * s); if (i !== gx.sel && !put(lx, y, G.name.length * 17 * s * 0.6)) continue;
      ts(G.name); tout(lx, y - 9 * s, 17 * s, 0.85, 0.92, 1, fa, 0); }
    if (D < 3000 && !STARS[here].gal) for (let k = 0; k < STARS.length; k++) { const st = STARS[k]; if (st.gal || k === here) continue; // nearby stars, when zoomed in on the Sun
      { const q = st.gp || (st.gp = toGal(st.p)); sd3[0] = SUN_G[0] + q[0]; sd3[1] = SUN_G[1] + q[1]; sd3[2] = SUN_G[2] + q[2]; } if (!gxProj(sd3)) continue; const c = SCOL[st.cls], x = scr[0], y = scr[1];
      circ(x, y, 2.5 * s, 0, c[0], c[1], c[2], fa); if (k === wsel) circ(x, y, 9 * s, 2 * s, 1, 0.8, 0.3, fa); if (D < 900 || k === wsel) { ts(st.name); tout(x + 7 * s, y - 7 * s, 12 * s, c[0], c[1], c[2], fa * 0.8, 0); } }
  }
  function gxPick(x, y) { let bi = -1, bd = (44 * hs) ** 2; const D = Math.hypot(gx.cam[0] - gx.tg[0], gx.cam[1] - gx.tg[1], gx.cam[2] - gx.tg[2]);
    for (let i = 0; i < GALAXIES.length; i++) { if (!gxProj(GALAXIES[i].p)) continue; const pr = (GALAXIES[i].R / scr[2]) / tanY() * H * 0.5, d2 = (scr[0] - x) ** 2 + (scr[1] - y) ** 2;
      if (d2 < Math.max(bd, i === 0 && D < 600000 ? 0 : (pr * 0.5) ** 2)) { bd = d2; bi = i; } } // a galaxy's disk counts as a hit (not the Milky Way while orbiting inside it)
    if (bi < 0 && D < 3000) { for (let k = 0; k < STARS.length; k++) { const st = STARS[k]; if (st.gal || k === here) continue; { const q = st.gp || (st.gp = toGal(st.p)); sd3[0] = SUN_G[0] + q[0]; sd3[1] = SUN_G[1] + q[1]; sd3[2] = SUN_G[2] + q[2]; }
      if (!gxProj(sd3)) continue; const d2 = (scr[0] - x) ** 2 + (scr[1] - y) ** 2; if (d2 < bd) { bd = d2; bi = -2 - k; } } }
    if (bi <= -2) { gx.sel = -1; wsel = -2 - bi; } else { gx.sel = bi; wsel = -1; } }
  // ---- 3D system map: the real camera flies out of the ship to an orbiting overview and back ----
  const mp = { on: false, a: 0, b: 1, focus: 0, yaw: 0, pitch: 0.95, zoom: 1, sel: -1, ptrs: new Map(), moved: 0, pinch: 0, t0: 0 }, NK = Object.freeze({});
  const mpS = new Float64Array(3), mpSQ = new Float64Array(4), mpP = new Float64Array(3), mpQ = new Float64Array(4), fw0 = new Float64Array(3);
  const mapBase = (f) => { let r = 0; for (let i = 1; i < sys.n; i++) { const b = sys.list[i]; if (b.parent === f && b.type !== 'comet') r = Math.max(r, b.a * (1 + b.ecc)); } return Math.max(r * 2.4, sys.list[f].R * 12); };
  function blendCam(P0, Q0, P1, Q1, t, oP, oQ) { // exponential-distance path (feels like a continuous zoom across scales) + eased turn
    const e = t * t * (3 - 2 * t), d = Math.hypot(P1[0] - P0[0], P1[1] - P0[1], P1[2] - P0[2]), K = Math.max(1, Math.min(30, Math.log(d / 30 + 1)));
    const w = (Math.exp(K * e) - 1) / (Math.exp(K) - 1); for (let j = 0; j < 3; j++) oP[j] = P0[j] + (P1[j] - P0[j]) * w;
    if (oQ !== Q0) oQ.set(Q0); qslerp(oQ, 0, Q1, 0, smooth(0, 0.6, e));
  }
  function mapCam(dt) {
    mp.a = Math.max(0, Math.min(1, mp.a + (mp.on ? dt : -dt) / 0.9)); mp.b = Math.min(1, mp.b + dt / 0.8); if (mp.a <= 0) return;
    mp.pitch = Math.max(0.12, Math.min(1.5, mp.pitch)); mp.zoom = Math.max(0.02, Math.min(4, mp.zoom));
    const f = mp.focus * 3, D = mapBase(mp.focus) * mp.zoom, cp = Math.cos(mp.pitch), ox = D * cp * Math.sin(mp.yaw), oy = D * Math.sin(mp.pitch), oz = D * cp * Math.cos(mp.yaw);
    mpP[0] = pos[f] + ox; mpP[1] = pos[f + 1] + oy; mpP[2] = pos[f + 2] + oz; qlook(mpQ, 0, -ox, -oy, -oz, 0, 1, 0);
    if (mp.b < 1) blendCam(mpS, mpSQ, mpP, mpQ, mp.b, mpP, mpQ);
    if (mp.a < 1) blendCam(cam, camQ, mpP, mpQ, mp.a, cam, camQ); else { cam.set(mpP); camQ.set(mpQ); }
  }
  // ---- per-frame update ----
  let last = 0, raf = 0, avgDt = 0.016, dead = false;
  function tick(now) {
    if (dead) return; if (!opts.offscreen) raf = requestAnimationFrame(tick);
    const rawDt = last ? (now - last) / 1000 : 1 / 60; last = now; const dt = Math.min(rawDt, 0.1);
    avgDt += (rawDt - avgDt) * 0.05;
    if (!opts.offscreen && !opts.renderScale && !bench.on && rawDt < 0.5) { // adaptive resolution: hold ~45+ fps by scaling the render target
      fAvg += (rawDt - fAvg) * 0.08; dynT += rawDt;
      if (dynT > 1 && fAvg > 1 / 40 && dyn > 0.5) { dyn = Math.max(0.5, dyn * 0.85); dynT = 0; }
      else if (dynT > 3 && fAvg < 1 / 56 && dyn < 1) { dyn = Math.min(1, dyn * 1.1); dynT = 0; }
    }
    resize();
    if (bench.on) { if (bench.n < NSLOT) bench.cpu[bench.n] = rawDt * 1000; }
    simT += dt; updateOrbits(simT);
    // reference frame (sphere of influence): deepest body whose SOI contains the ship
    const ro = ship.ref * 3; abs[0] = pos[ro] + ship.off[0]; abs[1] = pos[ro + 1] + ship.off[1]; abs[2] = pos[ro + 2] + ship.off[2];
    let nr = 0, best = Infinity;
    for (let i = 1; i < sys.n; i++) { const b = sys.list[i]; if (b.soi < best && dist(i) < b.soi) { best = b.soi; nr = i; } }
    if (nr !== ship.ref) { const o = nr * 3; ship.off[0] = abs[0] - pos[o]; ship.off[1] = abs[1] - pos[o + 1]; ship.off[2] = abs[2] - pos[o + 2]; ship.ref = nr; }
    { // co-rotate with solid bodies so the ground doesn't slide underneath (ship pos, velocity and attitude follow the spin)
      const rb = sys.list[ship.ref], q = ship.ref * 4, solid = rb.sphere && rb.type !== 'star' && !(rb.def.surface && rb.def.surface.gas);
      if (solid && rqRef === ship.ref && !bench.on) {
        tq[0] = -rq[0]; tq[1] = -rq[1]; tq[2] = -rq[2]; tq[3] = rq[3]; qmul(dq, 0, bq, q, tq, 0); // delta = now * prev^-1
        qrot(ship.off, 0, dq, 0, ship.off[0], ship.off[1], ship.off[2]); qrot(ship.vel, 0, dq, 0, ship.vel[0], ship.vel[1], ship.vel[2]);
        qmul(sq, 0, dq, 0, ship.q, 0); ship.q.set(sq); qnorm(ship.q, 0);
        abs[0] = pos[ro] + ship.off[0]; abs[1] = pos[ro + 1] + ship.off[1]; abs[2] = pos[ro + 2] + ship.off[2];
      }
      rqRef = solid ? ship.ref : -1; rq[0] = bq[q]; rq[1] = bq[q + 1]; rq[2] = bq[q + 2]; rq[3] = bq[q + 3];
    }
    { // velocity of the target relative to the current reference frame (finite difference, reset when either changes)
      const to = target * 3, ro2 = ship.ref * 3, ok = tpRef === ship.ref && tpTgt === target && dt > 0;
      for (let j = 0; j < 3; j++) { const r = pos[to + j] - pos[ro2 + j]; tv[j] = ok ? (r - tpr[j]) / dt : 0; tpr[j] = r; }
      if (!(Math.abs(tv[0]) + Math.abs(tv[1]) + Math.abs(tv[2]) < 1e9)) tv.fill(0); // time jumps
      tpRef = ship.ref; tpTgt = target;
      const rb = sys.list[ship.ref]; anc = rb.type === 'station' || rb.type === 'comet' ? Math.max(rb.parent, 0) : ship.ref;
      const ao = anc * 3, okf = fRef === ship.ref && dt > 0;
      for (let j = 0; j < 3; j++) { const r = pos[ro2 + j] - pos[ao + j]; fv[j] = okf ? (r - fpr[j]) / dt : 0; fpr[j] = r; }
      if (!(Math.abs(fv[0]) + Math.abs(fv[1]) + Math.abs(fv[2]) < 1e9)) fv.fill(0); fRef = ship.ref;
    }
    // nearest surface altitude (drives speed limits)
    let alt = Infinity; for (let i = 0; i < sys.n; i++) alt = Math.min(alt, dist(i) - sys.list[i].R * (i === prBody && prValid ? 1 + prH : 1));
    altT = prValid ? dist(prBody) - sys.list[prBody].R * (1 + prH) : Infinity;
    if (ap.on && (keys.KeyW || keys.KeyS || keys.KeyA || keys.KeyD || keys.Space || keys.KeyX || tc.jid >= 0)) { ap.on = false; rqRef = -1; banner('AUTOPILOT OFF', false); } // any thrust input takes over
    const lock = mp.on || ap.on || wp.on || gx.on; if (lock) mdx = mdy = 0; const K = lock ? NK : keys, jm = lock ? 0 : 1, inX = (K.KeyD ? 1 : 0) - (K.KeyA ? 1 : 0) + tc.jx * jm, inY = (K.Space ? 1 : 0) - (K.KeyX ? 1 : 0), inZ = (K.KeyS ? 1 : 0) - (K.KeyW ? 1 : 0) + tc.jy * jm;
    // rotation: quaternion integration of local angular velocity (no Euler angles anywhere)
    const sens = 0.0022 / Math.max(dt, 1e-3);
    const wx = -mdy * sens + ((K.ArrowUp ? 1 : 0) - (K.ArrowDown ? 1 : 0)) * 1.2, wy = -mdx * sens + ((K.ArrowLeft ? 1 : 0) - (K.ArrowRight ? 1 : 0)) * 1.2, wz = ((K.KeyQ ? 1 : 0) - (K.KeyE ? 1 : 0)) * 1.6;
    mdx = mdy = 0; const kw = 1 - Math.exp(-dt * 8); // rotational inertia
    ship.w[0] += (wx - ship.w[0]) * kw; ship.w[1] += (wy - ship.w[1]) * kw; ship.w[2] += (wz - ship.w[2]) * kw;
    const wl = Math.hypot(ship.w[0], ship.w[1], ship.w[2]);
    let sm = 0, nx = 0, ny = 1, nz = 0; // surface-flight blend (0 = free 6DoF in space, 1 = plane-like near the ground) and local vertical
    if (prValid && !cruise && !bench.on && !ap.on) { const o = prBody * 3, d = dist(prBody); nx = (abs[0] - pos[o]) / d; ny = (abs[1] - pos[o + 1]) / d; nz = (abs[2] - pos[o + 2]) / d; sm = smooth(0.045, 0.02, altT / sys.list[prBody].R); }
    if (!cruise && !bench.on) {
      const yl = ship.w[1] * (1 - sm), l2 = Math.hypot(ship.w[0], yl, ship.w[2]);
      if (l2 > 1e-9) { qaxis(dq, 0, ship.w[0] / l2, yl / l2, ship.w[2] / l2, l2 * dt); qmul(sq, 0, ship.q, 0, dq, 0); ship.q.set(sq); }
      if (sm > 0) { // yaw turns around the local vertical; wings level themselves unless you roll
        if (Math.abs(ship.w[1]) > 1e-9) { qaxis(dq, 0, nx, ny, nz, ship.w[1] * sm * dt); qmul(sq, 0, dq, 0, ship.q, 0); ship.q.set(sq); }
        qrot(rt, 0, ship.q, 0, 1, 0, 0); qrot(up, 0, ship.q, 0, 0, 1, 0); qrot(fw, 0, ship.q, 0, 0, 0, -1);
        const rn = rt[0] * nx + rt[1] * ny + rt[2] * nz, un = up[0] * nx + up[1] * ny + up[2] * nz, fn = fw[0] * nx + fw[1] * ny + fw[2] * nz;
        if (!K.KeyQ && !K.KeyE) { qaxis(dq, 0, 0, 0, -1, Math.atan2(rn, un) * (1 - Math.exp(-dt * 3)) * sm * smooth(0.985, 0.9, Math.abs(fn))); qmul(sq, 0, ship.q, 0, dq, 0); ship.q.set(sq); }
      }
      qnorm(ship.q, 0);
    }
    qrot(fw, 0, ship.q, 0, 0, 0, -1);
    if (charge >= 0 && !bench.on) { // supercruise charge-up: align to target, then jump
      const to = target * 3; qrot(up, 0, ship.q, 0, 0, 1, 0); qlook(dq, 0, pos[to] - abs[0], pos[to + 1] - abs[1], pos[to + 2] - abs[2], up[0], up[1], up[2]); qslerp(ship.q, 0, dq, 0, 1 - Math.exp(-dt * 3));
      charge -= dt; if (charge <= 0) { charge = -1; cruise = true; cruiseV = 2000; flash = 1; whoosh(1.6, 150, 4000, 0.2); blip(90, 500, 0.9, 'sine', 0.08); }
    }
    if (cruise && !bench.on) { // supercruise with auto-alignment + exponential auto-deceleration
      const tbd = sys.list[target], to = target * 3, dx = pos[to] - abs[0], dy = pos[to + 1] - abs[1], dz = pos[to + 2] - abs[2], d = Math.hypot(dx, dy, dz);
      let wx = dx, wy = dy, wz = dz, ob = -1, oba = d; // aim: the target, or a waypoint around the nearest body blocking the straight line
      for (let i = 0; i < sys.n; i++) { const b = sys.list[i]; if (i === target || !b.sphere) continue;
        const o = i * 3, cx = pos[o] - abs[0], cy = pos[o + 1] - abs[1], cz = pos[o + 2] - abs[2], along = (cx * dx + cy * dy + cz * dz) / d; if (along <= 0 || along >= oba) continue;
        const rr = Math.min(b.R * Math.max(b.box, 1.05) * 1.2, Math.hypot(pos[to] - pos[o], pos[to + 1] - pos[o + 1], pos[to + 2] - pos[o + 2]) * 0.9); // rings/atmosphere included; never past a target orbiting it
        const px = cx - (dx / d) * along, py = cy - (dy / d) * along, pz = cz - (dz / d) * along, pd = Math.hypot(px, py, pz); if (pd >= rr) continue;
        let nx = -px, ny = -py, nz = -pz, nl = pd; if (nl < rr * 0.01) { nx = dz; ny = 0; nz = -dx; nl = Math.hypot(nx, nz) || 1; } // dead centre: go round sideways
        ob = i; oba = along; wx = cx + (nx / nl) * rr * 1.45; wy = cy + (ny / nl) * rr * 1.45; wz = cz + (nz / nl) * rr * 1.45; }
      const wd = Math.hypot(wx, wy, wz);
      qrot(up, 0, ship.q, 0, 0, 1, 0); qlook(dq, 0, wx, wy, wz, up[0], up[1], up[2]); qslerp(ship.q, 0, dq, 0, 1 - Math.exp(-dt * 2.5));
      qrot(fw, 0, ship.q, 0, 0, 0, -1); const al = (fw[0] * wx + fw[1] * wy + fw[2] * wz) / wd, surf = Math.max(d - tbd.arrive, 0);
      const home = d < 200 * tbd.arrive, vdes = surf * 1.4 * Math.max(Math.pow(Math.max(0, (al - 0.85) / 0.15), 2), home ? 0.35 : 0); // final approach: guaranteed closing speed
      cruiseV = Math.min(vdes, Math.max(cruiseV, 2000) * Math.exp(dt * 2.2), Math.max(alt, 200) * 3); // never faster than 3x the nearest surface distance per second → can't skip through a planet in one frame
      const st = home || ob >= 0, ux = st ? wx / wd : fw[0], uy = st ? wy / wd : fw[1], uz = st ? wz / wd : fw[2]; // home on the aim point when close or detouring
      for (let j = 0; j < 3; j++) { ship.off[j] += ((j === 0 ? ux : j === 1 ? uy : uz) * cruiseV + tv[j]) * dt; ship.vel[j] = fw[j] * Math.min(cruiseV, 5e4); } // cruise in the target's frame: fast movers can't outrun us; inside its SOI we co-move
      if (d < tbd.arrive * 1.03 || (K.KeyS && !K.KeyW)) dropCruise(Math.min(cruiseV, Math.max(alt * 0.2, 200)));
      warpVis += (Math.min(1, Math.log10(Math.max(cruiseV, 1)) / 9) - warpVis) * Math.min(1, dt * 3);
    } else { // flight-assisted 6DoF Newtonian thrust; speed cap scales with altitude
      warpVis += (0 - warpVis) * Math.min(1, dt * 3); cruiseV = 0;
      const bst = K.ShiftLeft || K.ShiftRight ? 4 + 2 * smooth(3e4, 3e5, alt) : 1, vmax = Math.min(Math.max(30, alt * (0.12 + 0.23 * smooth(3e4, 3e5, alt))), 3e7) * bst, acc = Math.max(vmax * (1.2 + sm), 60) * dt; // 1 km up: 120 m/s; brakes never weaker than 60 m/s2
      qrot(t3, 0, ship.q, 0, inX, inY, inZ); const n = Math.max(1, Math.hypot(inX, inY, inZ)); // analog stick keeps partial throttle
      for (let j = 0; j < 3; j++) { const dv = (t3[j] / n) * vmax - ship.vel[j]; ship.vel[j] += Math.max(-acc, Math.min(acc, dv)); }
      { const sp = Math.hypot(ship.vel[0], ship.vel[1], ship.vel[2]); if (sp > vmax) { const k = Math.max(vmax / sp, Math.exp(-dt * 2.5)); ship.vel[0] *= k; ship.vel[1] *= k; ship.vel[2] *= k; } } // drag: arriving too fast for this altitude bleeds off within a second or two
      for (let j = 0; j < 3; j++) ship.off[j] += ship.vel[j] * dt;
      ship.thrust += ((inZ < 0 ? 1 : 0) - ship.thrust) * Math.min(1, dt * 5);
    }
    if (ap.on && !bench.on) apStep(dt);
    if (wp.on) warpStep(dt);
    // collision: soft cushion + hard floor that keeps the eye a clearance above the probed ground (never inside the terrain)
    abs[0] = pos[ship.ref * 3] + ship.off[0]; abs[1] = pos[ship.ref * 3 + 1] + ship.off[1]; abs[2] = pos[ship.ref * 3 + 2] + ship.off[2];
    const v0 = Math.hypot(ship.vel[0], ship.vel[1], ship.vel[2]); clr += (25 + Math.min(v0, 2000) * 0.03 - clr) * Math.min(1, dt * 3);
    for (let i = 0; i < sys.n; i++) {
      const b = sys.list[i], d = dist(i), o = i * 3, gas = b.def && b.def.surface && b.def.surface.gas;
      const mr = i === prBody && prValid ? b.R * (1 + prH) + clr : b.type === 'station' ? b.R * 1.1 : b.type === 'star' ? b.R * 1.03 : gas ? b.R * 1.004 : b.R + clr;
      if (bench.on || d > mr * 1.5 + 1e4) continue;
      const nx = (abs[0] - pos[o]) / d, ny = (abs[1] - pos[o + 1]) / d, nz = (abs[2] - pos[o + 2]) / d, vr = ship.vel[0] * nx + ship.vel[1] * ny + ship.vel[2] * nz;
      const vd = 3 + Math.max(d - mr, 0) * 1.2; // max descent rate shrinks smoothly to 3 m/s at the floor → gentle settle instead of a crash
      if (vr < -vd) { const k = -vd - vr; ship.vel[0] += nx * k; ship.vel[1] += ny * k; ship.vel[2] += nz * k; }
      if (d < mr) { const k = mr / d; for (let j = 0; j < 3; j++) { abs[j] = pos[o + j] + (abs[j] - pos[o + j]) * k; ship.off[j] = abs[j] - pos[ship.ref * 3 + j]; } }
    }
    if (prValid) altT = dist(prBody) - sys.list[prBody].R * (1 + prH);
    const wasLanded = landed; landed = prValid && !cruise && !bench.on && altT < clr + (landed ? 8 : 3); // hysteresis
    if (landed && !wasLanded && v0 < 400) { thump = 1; blip(80, 32, 0.6, 'sine', 0.22); whoosh(0.7, 500, 90, 0.12); banner('TOUCHDOWN - ' + sys.list[prBody].name, false); }
    if (landed && inY <= 0 && inZ >= 0 && Math.abs(inX) < 0.1) { ship.vel.fill(0); } // resting on the ground
    // atmosphere entry / exit + low-orbit banners and re-entry heat
    let ia = -1, ial = 0;
    for (let i = 1; i < sys.n; i++) { const b = sys.list[i], at = b.def && b.def.atmosphere; if (!at || !b.sphere) continue;
      const al = dist(i) - b.R * (i === prBody && prValid ? 1 + prH : 1); if (al < b.R * at.height) { ia = i; ial = al; } }
    if (!bench.on && ia !== inAtm) { if (ia >= 0) { banner('ENTERING ' + sys.list[ia].name.toUpperCase() + ' ATMOSPHERE', true); whoosh(2.4, 180, 1400, 0.16); eflash = 0.35; }
      else banner('LEAVING ' + sys.list[inAtm].name.toUpperCase() + ' ATMOSPHERE', false); }
    inAtm = ia;
    const lb = prValid && !(sys.list[prBody].def.atmosphere) ? prBody : -1; if (!bench.on && lb >= 0 && lb !== lowB) banner('SURFACE APPROACH - ' + sys.list[lb].name.toUpperCase(), false); lowB = lb;
    let heatT = 0;
    if (ia >= 0 && !bench.on && !cruise) { const b = sys.list[ia], f = 1 - ial / (b.R * b.def.atmosphere.height), o = ia * 3, d = dist(ia);
      const dens = smooth(0.02, 0.15, f) * (1 - smooth(0.6, 0.93, f)), vr = -(ship.vel[0] * (abs[0] - pos[o]) + ship.vel[1] * (abs[1] - pos[o + 1]) + ship.vel[2] * (abs[2] - pos[o + 2])) / d;
      heatT = dens * smooth(0.08, 0.22, (Math.max(vr, 0) + 0.3 * v0) / Math.max(ial, 1)); }
    heat += (heatT - heat) * Math.min(1, dt * (heatT > heat ? 2.5 : 1.2)); thump *= Math.exp(-dt * 5); eflash *= Math.exp(-dt * 3); bannerT -= dt;
    // camera
    if (bench.on) { bench.t += dt; benchCam(dt); if (bench.t >= 60) stopBench(true); bench.n++; abs.set(cam); } // HUD distances from the tour camera
    else {
      camQ.set(ship.q);
      if (thirdPerson) { qrot(t3, 0, ship.q, 0, 0, 9, 52); for (let j = 0; j < 3; j++) cam[j] = abs[j] + t3[j];
        if (prValid) { const o = prBody * 3, d = Math.hypot(cam[0] - pos[o], cam[1] - pos[o + 1], cam[2] - pos[o + 2]), g = sys.list[prBody].R * (1 + prH) + 10; // chase cam never dips into the ground
          if (d < g) for (let j = 0; j < 3; j++) cam[j] = pos[o + j] + (cam[j] - pos[o + j]) * (g / d); }
      } else cam.set(abs);
      const sh = heat * 0.006 + thump * 0.018 + (wp.on ? wp.fold * 0.004 + wp.flash * 0.012 : 0); // buffeting during re-entry, jolt on touchdown
      if (sh > 1e-4) { const t = now * 0.001, ax = Math.sin(t * 41) + Math.sin(t * 67 + 1), ay = Math.sin(t * 53 + 2) + Math.sin(t * 29 + 4), al = Math.hypot(ax, ay) || 1;
        qaxis(dq, 0, ax / al, ay / al, 0, sh * al * 0.5); qmul(sq, 0, camQ, 0, dq, 0); camQ.set(sq); }
    }
    qrot(fw0, 0, camQ, 0, 0, 0, -1); if (!bench.on) { mapCam(dt); gxCam(dt); } // fw0 = ship heading (map arrow)
    qrot(rt, 0, camQ, 0, 1, 0, 0); qrot(up, 0, camQ, 0, 0, 1, 0); qrot(fw, 0, camQ, 0, 0, 0, -1);
    const spd = bench.on ? Math.hypot(bench.v[0], bench.v[1], bench.v[2]) : cruise ? cruiseV : Math.hypot(ship.vel[0], ship.vel[1], ship.vel[2]);
    if (!bench.on) for (let i = 0; i < sys.n; i++) { // exploration log: get close to discover
      if (disc[i]) continue; const b = sys.list[i];
      if (dist(i) < (b.sphere ? Math.max(b.arrive * 1.3, 4 * b.R) : 15 * b.R)) {
        disc[i] = 1; nDisc++; toastI = i; toastT = 5; toastAll = nDisc === sys.n; chime(toastAll); saveLog();
      }
    }
    toastT -= dt; tgtT += dt; flash *= Math.exp(-dt * 3.5);
    const boosting = (K.ShiftLeft || K.ShiftRight) && spd > 50 && !cruise ? 1 : 0, thr = Math.min(1, Math.hypot(inX, inY, inZ));
    const fovT = (65 + boosting * 9 + warpVis * 16 + (wp.on ? wp.streak * 12 + wp.fold * 10 : 0) - (charge >= 0 ? (1.2 - charge) * 4 : 0)) * D2R; fov += (fovT - fov) * Math.min(1, dt * 4);
    audioFrame(thr, boosting, charge >= 0 ? 1 - charge / 1.2 : 0, heat, wp.on ? wp.fold : 0);

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
    gF[48] = warpVis; gF[49] = flash; gF[52] = heat; gF[53] = eflash; gF[54] = tc.on ? 0 : 1; gF[55] = (1 - 0.85 * mp.a) * (1 - wp.fold); gxObs(); if (gx.a > 0) { gF[60] = gx.cam[0]; gF[61] = gx.cam[1]; gF[62] = gx.cam[2]; } else { gF[60] = gx.obs[0]; gF[61] = gx.obs[1]; gF[62] = gx.obs[2]; } gF[63] = gx.a > 0.5 ? smooth(0.5, 1, gx.a) : 0; gF[56] = wp.beta; gF[57] = wp.on ? wp.streak : 0; gF[58] = wp.flash; gF[59] = wp.fold; // sun glare dimmed in map view; warp optics

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
    if (frame % 2 === 0) tiles();
    const enc = device.createCommandEncoder();
    // ground probe: nearest solid body, direction in its local (spin) frame
    let doProbe = false;
    if (!prBusy) {
      let bi = -1, bd = Infinity; for (let i = 1; i < sys.n; i++) { const b = sys.list[i]; if (!b.sphere || (b.def.surface && b.def.surface.gas)) continue; const d = (dist(i) - b.R) / b.R; if (d < bd) { bd = d; bi = i; } }
      if (bi > 0 && bd < 0.05) {
        const o = bi * 3, q = bi * 4, d = dist(bi); tq[0] = -bq[q]; tq[1] = -bq[q + 1]; tq[2] = -bq[q + 2]; tq[3] = bq[q + 3];
        qrot(t3, 0, tq, 0, (abs[0] - pos[o]) / d, (abs[1] - pos[o + 1]) / d, (abs[2] - pos[o + 2]) / d);
        probeIn[0] = t3[0]; probeIn[1] = t3[1]; probeIn[2] = t3[2]; probeIn[3] = slotOf[bi]; Q.writeBuffer(probeBuf, 0, probeIn);
        const cp = enc.beginComputePass(); cp.setPipeline(probeP); cp.setBindGroup(0, bg0); cp.setBindGroup(2, bgP); cp.dispatchWorkgroups(1); cp.end();
        enc.copyBufferToBuffer(probeBuf, 16, probeRd, 0, 16); doProbe = true; prSent = bi;
      } else if (bd >= 0.05) { prValid = false; prBody = -1; }
    }
    let p = enc.beginRenderPass(sceneDesc);
    p.setBindGroup(0, bg0);
    p.setPipeline(skyP); p.draw(3);
    if (gx.a < 1) { if (nOpaque) { p.setPipeline(sdfP); p.draw(36, nOpaque, 0, 0); }
    p.setPipeline(bodyP); for (let k = 0; k < nb; k++) p.draw(36, 1, 0, order[k]); }
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
    if (doProbe) { prBusy = true; probeRd.mapAsync(GPUMapMode.READ, 0, 16).then(onProbe, onProbeErr); }
    if (doRead) { rdBusy = true; rdBuf.mapAsync(GPUMapMode.READ, 0, 16).then(onRead, onReadErr); }
  }
  const onProbe = () => { const v = new Float32Array(probeRd.getMappedRange(0, 16)); prH = v[0]; prBody = prSent; prValid = v[3] > 0.5; probeRd.unmap(); prBusy = false; };
  const onProbeErr = () => { prBusy = false; };
  const nextOff = () => { raf = requestAnimationFrame(tick); };
  const onRead = () => { const v = new BigUint64Array(rdBuf.getMappedRange(0, 16)); const d = Number(v[1] - v[0]) / 1e6; if (d > 0 && d < 1000) gpuMs += (d - gpuMs) * 0.3; rdBuf.unmap(); rdBusy = false; };
  const onReadErr = () => { rdBusy = false; };

  switchStarSystem(STAR_SYSTEMS[systemId] ? systemId : 'sol');
  resize(); raf = requestAnimationFrame(tick);

  const api = {
    switchStarSystem, startBenchmark: startBench,
    get benchmark() { return bench.res; }, get frame() { return frame; }, get stats() { return { benchT: bench.on ? bench.t : -1, instances: nOpaque, tails: nTail, hud: hn, cam: Array.from(cam), ref: sys.list[ship.ref].id, cruiseV, tv: Math.hypot(tv[0], tv[1], tv[2]), al: (fw[0] * (pos[target * 3] - abs[0]) + fw[1] * (pos[target * 3 + 1] - abs[1]) + fw[2] * (pos[target * 3 + 2] - abs[2])) / dist(target), altT, clr, landed, heat, prValid, vel: Array.from(ship.vel) }; },
    capture: () => new Promise((res) => { capReq = { res }; }),
    get tileCache() { const o = {}; tmap.forEach((v, k) => { const kd = k >>> 30, z = (k >>> 26) & 15; o[kd + "/" + z] = (o[kd + "/" + z] || 0) + (v >= 0 ? 1 : 0); }); return o; }, // PNG data URL of the next frame
    setTarget: (id) => { if (sys.idx[id] !== undefined) setTgt(sys.idx[id]); },
    act: (code) => { audioInit(); act(code); }, hold: (code, on) => { audioInit(); keys[code] = on ? 1 : 0; },
    get ui() { const t = sys.list[target]; return { target: t.id, name: t.name, type: t.type, dist: dist(target) - t.R, cruise, charging: charge >= 0, canCruise: dist(target) > t.arrive * 1.2 && !bench.on,
      date: new Date((jdNow() - 2440587.5) * 86400000).toISOString().slice(0, 16).replace('T', ' ') + ' UTC', realTime: TS === TSR, photo, galaxy: gx.on ? { focus: gx.focus, sel: gx.sel < 0 ? null : { i: gx.sel, name: GALAXIES[gx.sel].name, fact: GALAXIES[gx.sel].fact, ly: GALAXIES[gx.sel].ly, home: gx.sel === 0 ? !STARS[here].gal : STARS[here].id === GALAXIES[gx.sel].id }, far: gx.dist > 600000 } : null, warp: wp.on, wsel: wsel < 0 ? null : { k: wsel, name: STARS[wsel].name, fact: STARS[wsel].fact, ly: starDir(wsel, sd3), known: !!STARS[wsel].planets }, auto: ap.on || ap.pend ? sys.lm[ap.k].name : null, third: thirdPerson, sound: au.on, touch: tc.on, help: showHelp, stats: showStats, bench: bench.on, system: sys.def.name, landed,
      map: { on: mp.on, a: mp.a, focus: sys.list[mp.focus].id, focusName: sys.list[mp.focus].name, sel: mp.sel < 0 ? null : (() => { const b = sys.list[mp.sel];
        return { id: b.id, name: b.name, type: b.type, dist: dist(mp.sel) - b.R, fact: b.def && b.def.fact, found: !!disc[mp.sel], kids: sys.list.some((x) => x.parent === mp.sel) && mp.sel !== mp.focus }; })() } }; },
    bodies: () => sys.list.map((b, i) => ({ id: b.id, name: b.name, type: b.type, parent: b.parent >= 0 ? sys.list[b.parent].id : null, dist: dist(i) - b.R, found: !!disc[i],
      color: b.type === 'star' ? b.star.color : (b.def.surface && b.def.surface.c && b.def.surface.c[0]) || null })),
    cruiseTo: (id) => { const i = sys.idx[id]; if (i === undefined || bench.on) return false; audioInit(); setTgt(i); // from the map: lock + charge (or retarget an active cruise)
      if (cruise || charge >= 0) return true; if (dist(i) > sys.list[i].arrive * 1.2) { charge = 1.2; cruiseV = 0; return true; } return false; },
    mapOpen: () => { if (mp.on || bench.on) return; mp.on = true; mp.sel = -1; mp.focus = 0; mp.zoom = 0.6; mp.b = 1; mp.pitch = 1.05; mp.yaw = Math.atan2(-fw0[0], -fw0[2]); mp.ptrs.clear(); tc.jid = tc.lid = -1; tc.jx = tc.jy = 0; },
    mapClose: () => { mp.on = false; mp.ptrs.clear(); },
    mapFocus: (id) => { const i = sys.idx[id]; if (i === undefined || i === mp.focus) return; mpS.set(cam); mpSQ.set(camQ); mp.b = 0; mp.focus = i; mp.zoom = 1; mp.sel = -1; },
    mapSelect: (id) => { mp.sel = id == null ? -1 : sys.idx[id]; },
    screenPos: (id) => { const i = sys.idx[id], o = i * 3; if (!project(pos[o] - cam[0], pos[o + 1] - cam[1], pos[o + 2] - cam[2])) return null; const k = canvas.clientWidth / W; return [scr[0] * k, scr[1] * k]; },
    get audioLevel() { if (!au.an) return -1; au.an.getFloatTimeDomainData(au.ab); let e = 0; for (let i = 0; i < 1024; i++) e += au.ab[i] * au.ab[i]; return Math.sqrt(e / 1024); },
    places: () => sys.lm.map((m, k) => ({ k, name: m.name, kind: LMK[m.kind], body: sys.list[m.bi].name })), goPlace,
    stars: () => STARS.map((st, k) => ({ sk: k, name: st.name, kind: st.gal ? 'Galaxy' : 'Star', body: k === here ? 'you are here' : starDir(k, sd3).toFixed(1) + ' ly', here: k === here })),
    warpTo: (k) => warpTo(k),
    galaxyOpen: () => { if (bench.on || wp.on) return; mp.on = false; gx.on = true; gx.t = 0; gx.focus = 0; gx.dist = 150000; gx.sel = -1; mp.ptrs.clear(); tc.jid = tc.lid = -1; tc.jx = tc.jy = 0; },
    galaxyClose: () => { gx.on = false; mp.ptrs.clear(); }, galaxyFocus: (i) => { gx.focus = i; gx.dist = i ? GALAXIES[i].R * 4 : 150000; gx.sel = -1; },
    galaxyZoom: (k) => { gx.dist = Math.max(60, Math.min(9e6, gx.dist * k)); }, galaxyJump: (i) => warpTo(i === 0 ? 0 : STARS.findIndex((x) => x.id === GALAXIES[i].id)), clearWarpSel: () => { wsel = -1; },
    debugSky: () => { const e = sys.idx.earth, m = sys.idx.luna; if (e === undefined) return null; const o = e * 3, ex = pos[o], ey = pos[o + 1], ez = pos[o + 2], q = e * 4;
      tq[0] = -bq[q]; tq[1] = -bq[q + 1]; tq[2] = -bq[q + 2]; tq[3] = bq[q + 3]; const l = Math.hypot(ex, ey, ez); qrot(t3, 0, tq, 0, -ex / l, -ey / l, -ez / l); // sun direction in Earth's body frame
      const mo = m * 3, mx = pos[mo] - ex, my = pos[mo + 1] - ey, mz = pos[mo + 2] - ez, ml = Math.hypot(mx, my, mz), el = Math.acos((-ex * mx - ey * my - ez * mz) / (l * ml)) / D2R;
      return { date: new Date((jdNow() - 2440587.5) * 86400000).toISOString(), earthHelioLon: ((Math.atan2(-ez, ex) / D2R) + 360) % 360, subsolarLat: Math.asin(t3[1]) / D2R, subsolarLon: Math.atan2(-t3[2], t3[0]) / D2R, moonElongation: el,
        marsHelioLon: ((Math.atan2(-pos[sys.idx.mars * 3 + 2], pos[sys.idx.mars * 3]) / D2R) + 360) % 360, jupiterHelioLon: ((Math.atan2(-pos[sys.idx.jupiter * 3 + 2], pos[sys.idx.jupiter * 3]) / D2R) + 360) % 360 }; },
    get systemStar() { return sys.list[0].id; },
    unlockMouse: () => { if (document.pointerLockElement === canvas) document.exitPointerLock(); },
    teleport: (id, distRadii = 3, az, el, pitch) => { const i = sys.idx[id]; if (i !== undefined) { target = i; placeNear(i, distRadii, az, el, pitch); cruise = false; } },
    debugView: (id, dx, dy, dz, lx, ly, lz) => { const i = sys.idx[id]; if (i === undefined) return; const R = sys.list[i].R; ship.ref = i; ship.off[0] = dx * R; ship.off[1] = dy * R; ship.off[2] = dz * R; ship.vel.fill(0); ship.w.fill(0); cruise = false; qlook(ship.q, 0, lx === undefined ? -dx : lx, ly === undefined ? -dy : ly, lz === undefined ? -dz : lz, 0, 1, 0); },
    flyTo: (id, lat, lon, altM = 5000, pitchDeg = -25) => { // place the ship above a real location (lat/lon in degrees), looking north
      const i = sys.idx[id]; if (i === undefined) return; const b = sys.list[i], la = lat * D2R, lo = lon * D2R, q = i * 4, r = b.R + altM;
      qrot(t3, 0, bq, q, Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo)); const ux = t3[0], uy = t3[1], uz = t3[2];
      qrot(t3, 0, bq, q, -Math.sin(la) * Math.cos(lo), Math.cos(la), Math.sin(la) * Math.sin(lo)); // local north
      const p = pitchDeg * D2R, fx = t3[0] * Math.cos(p) + ux * Math.sin(p), fy = t3[1] * Math.cos(p) + uy * Math.sin(p), fz = t3[2] * Math.cos(p) + uz * Math.sin(p);
      target = i; cruise = false; charge = -1; ship.ref = i; rqRef = -1; prValid = false; ship.off[0] = ux * r; ship.off[1] = uy * r; ship.off[2] = uz * r; ship.vel.fill(0); ship.w.fill(0);
      qlook(ship.q, 0, fx, fy, fz, ux, uy, uz);
    },
    setTime: (t) => { simT = t; }, setExposure: (e) => { exposure = e; }, toggleThirdPerson: () => { thirdPerson = !thirdPerson; },
    destroy() {
      dead = true; cancelAnimationFrame(raf);
      window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); window.removeEventListener('mousemove', mm);
      canvas.removeEventListener('pointerdown', pd); canvas.removeEventListener('pointermove', pmv); canvas.removeEventListener('pointerup', pu); canvas.removeEventListener('pointercancel', pu); canvas.removeEventListener('contextmenu', noCtx); canvas.removeEventListener('wheel', whl);
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      if (au.ctx) au.ctx.close();
      device.destroy();
    },
  };
  device.lost.then((i) => { if (!dead) console.error('[SpaceRoam] device lost:', i.reason, i.message); });
  return api;
}

/* ============================== REACT COMPONENT ============================== */
/* ============================== UI OVERLAY (DOM: target chip + list, menu, touch action buttons) ============================== */
const fmtD = (m) => { const a = Math.abs(m); return a < 1e4 ? Math.round(m) + ' m' : a < 1e7 ? (m / 1e3).toFixed(1) + ' km' : a < 1e10 ? (m / 1e6).toFixed(1) + ' Mm' : (m / 1e9).toFixed(2) + ' Gm'; };
const ICON = { // 24x24 stroke icons
  cruise: 'M4 6l7 6-7 6M12 6l7 6-7 6', stop: 'M7 7h10v10H7z', boost: 'M13 3L5 14h6l-1 7 8-11h-6z', up: 'M6 15l6-6 6 6', down: 'M6 9l6 6 6-6',
  rl: 'M4 12a8 8 0 1 0 3-6.2M4 4v4h4', rr: 'M20 12a8 8 0 1 1-3-6.2M20 4v4h-4', menu: 'M4 7h16M4 12h16M4 17h16', close: 'M6 6l12 12M18 6L6 18',
  snd: 'M4 9h4l5-4v14l-5-4H4zM16 9a4 4 0 0 1 0 6', mute: 'M4 9h4l5-4v14l-5-4H4zM16 9l5 6M21 9l-5 6', cam: 'M4 8h4l2-3h4l2 3h4v11H4zM12 11a3 3 0 1 0 0 .1',
  full: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5', help: 'M9 9a3 3 0 1 1 4 2.8c-1 .4-1 1.2-1 2.2M12 17v.5', stats: 'M5 19V11M10 19V5M15 19v-6M20 19V9',
  sys: 'M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0M3 12c0-3 4-5 9-5s9 2 9 5-4 5-9 5-9-2-9-5', bench: 'M12 13l4-4M4 18a8 8 0 1 1 16 0', save: 'M12 4v11M7 11l5 5 5-5M5 20h14', map: 'M9 4L3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14', find: 'M10.5 10.5m-6.5 0a6.5 6.5 0 1 0 13 0a6.5 6.5 0 1 0-13 0M15.5 15.5L21 21', back: 'M15 5l-7 7 7 7', tgt: 'M12 3v4M12 17v4M3 12h4M17 12h4M12 12m-5 0a5 5 0 1 0 10 0a5 5 0 1 0-10 0' };
const Ico = ({ n, s = 24 }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d={ICON[n]} /></svg>;
const C = { fg: '#bfe8ff', dim: '#7fa8c4', acc: '#7dffc8', warn: '#ffc35a', bg: 'rgba(4,10,18,.62)', line: 'rgba(120,200,255,.45)' };
const panel = { background: C.bg, border: '1px solid ' + C.line, borderRadius: 14, backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', color: C.fg };
const TYPE_LBL = { star: 'Star', planet: 'Planet', moon: 'Moon', station: 'Station', comet: 'Comet' };
function GalaxyUI({ eng, gv, wsel }) { // DOM chrome for the galaxy view
  const selT = useRef(0), last = useRef(null), key = (gv.sel && gv.sel.name) || (wsel && wsel.name) || null;
  if (key !== last.current) { last.current = key; selT.current = performance.now(); }
  const ok = (fn) => () => { if (performance.now() - selT.current > 400) fn(); };
  const bt = (extra) => ({ ...panel, pointerEvents: 'auto', cursor: 'pointer', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, font: '600 13px ui-monospace,Consolas,monospace', letterSpacing: 1, ...extra });
  const card = (title, sub, dist, fact, btns) => <div style={{ ...panel, pointerEvents: 'auto', position: 'absolute', left: '50%', bottom: 16, transform: 'translateX(-50%)', width: 'min(460px, calc(100% - 24px))', padding: '14px 16px' }}>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}><span style={{ fontSize: 20, color: C.warn }}>{title}</span><span style={{ color: C.dim, fontSize: 12 }}>{sub}</span><span style={{ flex: 1 }} /><span style={{ color: C.dim, fontSize: 13 }}>{dist}</span></div>
    <div style={{ fontSize: 13, margin: '8px 0 12px', opacity: 0.85 }}>{fact}</div><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{btns}</div></div>;
  const ly = (v) => (v >= 1e6 ? (v / 1e6).toFixed(2) + ' million ly' : Math.round(v).toLocaleString('en') + ' ly');
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 6 }}>
      <div style={{ position: 'absolute', top: 12, left: 12, right: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
        {gv.focus !== 0 && <div onClick={() => eng.galaxyFocus(0)} style={bt()}><Ico n="back" s={18} />MILKY WAY</div>}
        <div style={{ ...panel, padding: '10px 14px', letterSpacing: 1 }}>{gv.far ? 'LOCAL GROUP' : 'MILKY WAY'}</div>
        <span style={{ flex: 1 }} />
        <div onClick={() => eng.galaxyZoom(4)} style={bt({ padding: 10 })} title="Zoom out">−</div><div onClick={() => eng.galaxyZoom(0.25)} style={bt({ padding: 10 })} title="Zoom in">+</div>
        <div onClick={() => eng.galaxyClose()} style={bt()}><Ico n="close" s={18} />CLOSE</div>
      </div>
      {gv.sel && card(gv.sel.name, 'Galaxy', ly(gv.sel.ly), gv.sel.fact + (gv.sel.home ? ' You are here.' : ' The star systems you visit there are generated.'), <>
        {!gv.sel.home && <div onClick={ok(() => eng.galaxyJump(gv.sel.i))} style={bt({ borderColor: C.warn, color: C.warn })}><Ico n="cruise" s={18} />{gv.sel.i === 0 ? 'JUMP HOME' : 'JUMP'}</div>}
        <div onClick={ok(() => eng.galaxyFocus(gv.sel.i))} style={bt()}><Ico n="find" s={18} />ZOOM IN</div></>)}
      {!gv.sel && wsel && card(wsel.name, 'Star', wsel.ly.toFixed(1) + ' ly', wsel.fact, <div onClick={ok(() => eng.warpTo(wsel.k))} style={bt({ borderColor: C.warn, color: C.warn })}><Ico n="cruise" s={18} />WARP</div>)}
      {!gv.sel && !wsel && <div style={{ position: 'absolute', bottom: 16, left: 0, right: 0, textAlign: 'center', color: C.dim, fontSize: 12, textShadow: '0 1px 3px #000' }}>Drag to rotate · pinch / scroll / − + to zoom · tap a galaxy (or a star near the Sun)</div>}
    </div>);
}
function MapUI({ eng, m, sysName, date }) { // DOM chrome for the 3D map: header, close, selected-body card (the map itself is the real 3D scene)
  const selT = useRef(0), last = useRef(null), sel = m.sel;
  if ((sel && sel.id) !== last.current) { last.current = sel && sel.id; selT.current = performance.now(); }
  const ok = (fn) => () => { if (performance.now() - selT.current > 400) fn(); }; // swallow the ghost click of the tap that selected
  const bt = (extra) => ({ ...panel, pointerEvents: 'auto', cursor: 'pointer', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, font: '600 13px ui-monospace,Consolas,monospace', letterSpacing: 1, ...extra });
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 6 }}>
      <div style={{ position: 'absolute', top: 12, left: 12, right: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
        {m.focus !== eng.systemStar && <div onClick={() => eng.mapFocus(eng.systemStar)} style={bt()}><Ico n="back" s={18} />SYSTEM</div>}
        <div style={{ ...panel, padding: '10px 14px', letterSpacing: 1 }}>{m.focus === eng.systemStar ? sysName.toUpperCase() + ' SYSTEM' : m.focusName.toUpperCase() + ' SYSTEM'}<span style={{ color: C.dim, fontSize: 11, marginLeft: 10 }}>{date}</span></div>
        <span style={{ flex: 1 }} />
        <div onClick={() => eng.galaxyOpen()} style={bt()} title="Galaxy view"><Ico n="sys" s={18} />GALAXY</div>
        <div onClick={() => eng.mapClose()} style={bt()} title="Close map (N)"><Ico n="close" s={18} />CLOSE</div>
      </div>
      {sel && <div style={{ ...panel, pointerEvents: 'auto', position: 'absolute', left: '50%', bottom: 16, transform: 'translateX(-50%)', width: 'min(460px, calc(100% - 24px))', padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}><span style={{ fontSize: 20, color: C.acc }}>{sel.name}</span><span style={{ color: C.dim, fontSize: 12 }}>{TYPE_LBL[sel.type]}</span>
          {!sel.found && <span style={{ color: C.warn, fontSize: 11 }}>UNCHARTED</span>}<span style={{ flex: 1 }} /><span style={{ color: C.dim, fontSize: 13 }}>{fmtD(sel.dist)}</span></div>
        {sel.fact && <div style={{ color: C.fg, fontSize: 13, margin: '8px 0 12px', opacity: 0.85 }}>{sel.fact}</div>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div onClick={ok(() => { eng.mapClose(); if (!eng.cruiseTo(sel.id)) eng.setTarget(sel.id); })} style={bt({ borderColor: C.warn, color: C.warn })}><Ico n="cruise" s={18} />CRUISE HERE</div>
          <div onClick={ok(() => eng.setTarget(sel.id))} style={bt()}><Ico n="tgt" s={18} />TARGET</div>
          {sel.kids && <div onClick={ok(() => eng.mapFocus(sel.id))} style={bt()}><Ico n="map" s={18} />MOONS</div>}
          <span style={{ flex: 1 }} /><div onClick={() => eng.mapSelect(null)} style={bt({ padding: '10px' })}><Ico n="close" s={16} /></div>
        </div></div>}
      {!sel && <div style={{ position: 'absolute', bottom: 16, left: 0, right: 0, textAlign: 'center', color: C.dim, fontSize: 12, textShadow: '0 1px 3px #000' }}>Tap a planet · drag to rotate · pinch / scroll to zoom</div>}
    </div>);
}
function Overlay({ eng }) {
  const [ui, setUi] = useState(null), [list, setList] = useState(null), [menu, setMenu] = useState(false), [help, setHelp] = useState(false), [find, setFind] = useState(null);
  useEffect(() => { const id = setInterval(() => { setUi(eng.ui); if (list) setList(eng.bodies()); }, 120); return () => clearInterval(id); }, [eng, list]);
  useEffect(() => { const k = (e) => { if (e.target && e.target.tagName === 'INPUT') { if (e.code === 'Escape') setFind(null); return; } if (e.code === 'Slash') { e.preventDefault(); openFind(); } else if (e.code === 'KeyT') { e.preventDefault(); openList(); } else if (e.code === 'KeyN') { eng.unlockMouse(); setList(null); setMenu(false); if (eng.ui.map.on) eng.mapClose(); else eng.mapOpen(); } else if (e.code === 'Escape') { setList(null); setMenu(false); setHelp(false); setFind(null); eng.mapClose(); eng.galaxyClose(); } };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); });
  const placesRef = useRef(null), sysRef = useRef(null);
  if (!ui) return null;
  if (sysRef.current !== ui.system) { sysRef.current = ui.system; placesRef.current = null; }
  function openFind() { eng.unlockMouse(); setMenu(false); setList(null); setFind((f) => (f === null ? '' : null)); }
  function openList() { eng.unlockMouse(); setMenu(false); setFind(null); setList((l) => (l ? null : eng.bodies())); }
  const btn = (extra) => ({ ...panel, pointerEvents: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, cursor: 'pointer',
    font: '600 11px ui-monospace,Consolas,monospace', letterSpacing: 1, userSelect: 'none', WebkitUserSelect: 'none', touchAction: 'none', ...extra });
  const hold = (code) => ({ onPointerDown: (e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); eng.hold(code, 1); },
    onPointerUp: () => eng.hold(code, 0), onPointerCancel: () => eng.hold(code, 0), onContextMenu: (e) => e.preventDefault() });
  const tap = (fn) => ({ onClick: (e) => { e.stopPropagation(); fn(); } });
  const round = (d, on, x) => btn({ width: d, height: d, borderRadius: '50%', ...(on ? { borderColor: C.warn, color: C.warn, background: 'rgba(60,40,5,.7)' } : {}), ...x });
  const mapOut = ui.map.on || ui.map.a > 0.02 || ui.warp || !!ui.galaxy;
  if (ui.photo && !mapOut) { // photo mode: clean view, two faint buttons only
    const pb = (x) => ({ ...panel, pointerEvents: 'auto', cursor: 'pointer', width: 44, height: 44, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.35, ...x });
    const snap = () => eng.capture().then((u) => { const a = document.createElement('a'); a.href = u; a.download = 'spaceroam-' + Date.now() + '.png'; a.click(); });
    return (<div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', color: C.fg }}>
      <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: 8 }}>
        <div {...tap(snap)} style={pb()} title="Save picture"><Ico n="save" s={20} /></div>
        <div {...tap(() => eng.act('KeyP'))} style={pb()} title="Exit photo mode (P)"><Ico n="close" s={20} /></div>
      </div></div>); }
  const cruiseLbl = ui.cruise ? 'STOP' : ui.charging ? 'CANCEL' : ui.canCruise ? 'CRUISE' : 'CLOSE';
  const rows = list ? list.filter((b) => b.type !== 'star' || true) : null;
  const depth = (b) => (b.type === 'star' ? 0 : b.parent && list.find((x) => x.id === b.parent).type !== 'star' ? 2 : 1);
  const order = rows ? (() => { const out = [], kids = (pid) => rows.filter((b) => b.parent === pid); const walk = (b) => { out.push(b); kids(b.id).forEach(walk); }; rows.filter((b) => !b.parent).forEach(walk); return out; })() : null;
  const dot = (b) => { const c = b.color ? 'rgb(' + b.color.map((v) => Math.round(Math.min(1, Math.pow(v, 0.6)) * 255)).join(',') + ')' : b.type === 'station' ? '#8cf' : '#ddd';
    return <span style={{ width: b.type === 'station' ? 10 : 14 - depth(b) * 2, height: b.type === 'station' ? 10 : 14 - depth(b) * 2, borderRadius: b.type === 'station' ? 2 : '50%', background: c, boxShadow: '0 0 6px ' + c, flex: 'none' }} />; };
  const item = (icon, label, on, fn) => <div {...tap(fn)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderRadius: 10, cursor: 'pointer', color: on ? C.acc : C.fg, background: on ? 'rgba(80,255,190,.08)' : 'transparent' }}><Ico n={icon} s={20} /><span>{label}</span></div>;
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', font: '14px ui-monospace,Consolas,monospace', color: C.fg }}>
      {/* target chip + menu (top right) */}
      <div style={{ position: 'absolute', top: 12, right: 12, display: mapOut ? 'none' : 'flex', gap: 8, alignItems: 'stretch' }}>
        <div {...tap(openList)} style={btn({ flexDirection: 'row', gap: 10, padding: '8px 14px', minHeight: 48, alignItems: 'center', borderColor: 'rgba(125,255,200,.55)' })} title="Choose target (T)">
          <span style={{ color: C.acc }}><Ico n="tgt" s={22} /></span>
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.15 }}>
            <span style={{ fontSize: 10, color: C.dim }}>TARGET  ▾</span>
            <span style={{ fontSize: 16, color: C.acc, letterSpacing: 0.5 }}>{ui.name}</span>
            <span style={{ fontSize: 11, color: C.dim, letterSpacing: 0 }}>{fmtD(ui.dist)}</span>
          </span>
        </div>
        <div {...tap(openFind)} style={btn({ width: 56, minHeight: 48, fontSize: 10 })} title="Search places (/)"><Ico n="find" s={22} />FIND</div>
        <div {...tap(() => { eng.unlockMouse(); setList(null); setMenu(false); setFind(null); eng.mapOpen(); })} style={btn({ width: 56, minHeight: 48, fontSize: 10 })} title="System map (N)"><Ico n="map" s={22} />MAP</div>
        <div {...tap(() => { eng.unlockMouse(); setList(null); setFind(null); setMenu(!menu); })} style={btn({ width: 52, minHeight: 48 })} title="Menu"><Ico n={menu ? 'close' : 'menu'} /></div>
      </div>
      {/* menu */}
      {menu && <div style={{ ...panel, pointerEvents: 'auto', position: 'absolute', zIndex: 5, top: 70, right: 12, width: 230, padding: 6 }}>
        {item(ui.sound ? 'snd' : 'mute', ui.sound ? 'Sound: on' : 'Sound: off', ui.sound, () => eng.act('KeyM'))}
        {item('cam', ui.third ? 'Camera: chase' : 'Camera: cockpit', ui.third, () => eng.act('KeyV'))}
        {item('cam', 'Photo mode (hide all text)', false, () => { eng.act('KeyP'); setMenu(false); })}
        {item('stats', ui.realTime ? 'Orbits: real time' : 'Orbits: fast (6 h / s)', ui.realTime, () => eng.act('Time'))}
        {item('full', 'Fullscreen', false, () => eng.act('Full'))}
        {item('help', 'Controls', help, () => { setHelp(!help); setMenu(false); })}
        {item('stats', 'Performance stats', ui.stats, () => eng.act('KeyG'))}
        {item('sys', 'Switch star system', false, () => { eng.act('KeyJ'); setMenu(false); })}
        {item('bench', ui.bench ? 'Stop benchmark' : 'Run benchmark', ui.bench, () => { eng.act('KeyB'); setMenu(false); })}
      </div>}
      {/* target list */}
      {list && <div style={{ ...panel, pointerEvents: 'auto', position: 'absolute', zIndex: 5, top: 70, right: 12, bottom: 12, width: 'min(340px, calc(100% - 24px))', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 14px', borderBottom: '1px solid ' + C.line }}>
          <span style={{ flex: 1, letterSpacing: 1 }}>CHOOSE TARGET</span><span {...tap(() => setList(null))} style={{ cursor: 'pointer', display: 'flex' }}><Ico n="close" s={22} /></span></div>
        <div style={{ overflowY: 'auto', padding: 6, WebkitOverflowScrolling: 'touch' }}>
          {order.map((b) => { const on = b.id === ui.target; return (
            <div key={b.id} {...tap(() => { eng.setTarget(b.id); setList(null); })} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 10px 10px ' + (10 + depth(b) * 18) + 'px', borderRadius: 10, cursor: 'pointer', background: on ? 'rgba(80,255,190,.12)' : 'transparent', border: on ? '1px solid rgba(125,255,200,.5)' : '1px solid transparent' }}>
              {dot(b)}
              <span style={{ flex: 1, display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
                <span style={{ color: on ? C.acc : C.fg, fontSize: depth(b) > 1 ? 13 : 15 }}>{b.name}{!b.found && <span style={{ color: C.warn, fontSize: 10, marginLeft: 6 }}>UNCHARTED</span>}</span>
                <span style={{ color: C.dim, fontSize: 11 }}>{TYPE_LBL[b.type]}</span></span>
              <span style={{ color: C.dim, fontSize: 12 }}>{fmtD(b.dist)}</span></div>); })}
        </div>
        <div style={{ padding: '8px 14px', fontSize: 11, color: C.dim, borderTop: '1px solid ' + C.line }}>Tip: you can also tap / click a planet on screen</div>
      </div>}
      {/* place search */}
      {find !== null && (() => { const q = find.trim().toLowerCase(), all = placesRef.current || (placesRef.current = eng.places().concat(eng.bodies().map((b) => ({ id: b.id, name: b.name, kind: TYPE_LBL[b.type], body: ui.system + ' system' })), eng.stars().filter((x) => !x.here).map((x) => ({ ...x, kind: 'Star - warp' }))));
        const res = (q ? all.filter((p) => p.name.toLowerCase().includes(q)).sort((a, b) => (a.name.toLowerCase().startsWith(q) ? 0 : 1) - (b.name.toLowerCase().startsWith(q) ? 0 : 1)) : all).slice(0, 40);
        const go = (p) => { if (p.sk !== undefined) eng.warpTo(p.sk); else if (p.id) { if (!eng.cruiseTo(p.id)) eng.setTarget(p.id); } else eng.goPlace(p.k); setFind(null); };
        return (<div style={{ ...panel, pointerEvents: 'auto', position: 'absolute', zIndex: 5, top: 70, right: 12, bottom: 12, width: 'min(360px, calc(100% - 24px))', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: '1px solid ' + C.line }}>
            <Ico n="find" s={20} />
            <input autoFocus value={find} onChange={(e) => setFind(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && res[0]) go(res[0]); }} placeholder="Search a city, mountain, sea, planet..."
              style={{ flex: 1, minWidth: 0, background: 'transparent', border: 0, outline: 'none', color: C.fg, font: '16px ui-monospace,Consolas,monospace' }} />
            <span {...tap(() => setFind(null))} style={{ cursor: 'pointer', display: 'flex' }}><Ico n="close" s={22} /></span></div>
          <div style={{ overflowY: 'auto', padding: 6, WebkitOverflowScrolling: 'touch' }}>
            {res.map((p, i) => <div key={i} {...tap(() => go(p))} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px', borderRadius: 10, cursor: 'pointer', background: i === 0 && q ? 'rgba(80,255,190,.1)' : 'transparent' }}>
              <span style={{ flex: 1, display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}><span style={{ fontSize: 15 }}>{p.name}</span><span style={{ color: C.dim, fontSize: 11 }}>{p.kind} · {p.body}</span></span>
              <span style={{ color: C.warn, fontSize: 11, letterSpacing: 1 }}>GO ›</span></div>)}
            {!res.length && <div style={{ padding: 14, color: C.dim }}>No match</div>}
          </div>
          <div style={{ padding: '8px 14px', fontSize: 11, color: C.dim, borderTop: '1px solid ' + C.line }}>GO flies you there: cruise to the planet, then an automatic descent</div>
        </div>); })()}
      {ui.auto && !mapOut && <div style={{ ...panel, position: 'absolute', left: '50%', top: 72, transform: 'translateX(-50%)', padding: '8px 14px', fontSize: 12, color: C.warn, borderColor: C.warn, whiteSpace: 'nowrap' }}>AUTOPILOT › {ui.auto}<span style={{ color: C.dim }}> · thrust to take over</span></div>}
      {ui.wsel && !mapOut && <div style={{ ...panel, pointerEvents: 'auto', position: 'absolute', zIndex: 4, left: '50%', bottom: ui.touch ? 130 : 16, transform: 'translateX(-50%)', width: 'min(440px, calc(100% - 24px))', padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}><span style={{ fontSize: 20, color: C.warn }}>{ui.wsel.name}</span><span style={{ color: C.dim, fontSize: 12 }}>Star</span><span style={{ flex: 1 }} /><span style={{ color: C.dim, fontSize: 13 }}>{ui.wsel.ly.toFixed(1)} light-years</span></div>
        <div style={{ fontSize: 13, margin: '8px 0 12px', opacity: 0.85 }}>{ui.wsel.fact} {ui.wsel.known ? 'Its known planets are modelled from real data.' : 'Its planets are generated.'}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div {...tap(() => eng.warpTo(ui.wsel.k))} style={{ ...panel, cursor: 'pointer', padding: '10px 16px', borderColor: C.warn, color: C.warn, display: 'flex', alignItems: 'center', gap: 8, font: '600 13px ui-monospace,Consolas,monospace', letterSpacing: 1 }}><Ico n="cruise" s={18} />WARP</div>
          <span style={{ flex: 1 }} /><div {...tap(() => eng.clearWarpSel())} style={{ ...panel, cursor: 'pointer', padding: 10, display: 'flex' }}><Ico n="close" s={16} /></div></div></div>}
      {/* controls help */}
      {help && <div {...tap(() => setHelp(false))} style={{ ...panel, pointerEvents: 'auto', position: 'absolute', zIndex: 5, left: '50%', top: '50%', transform: 'translate(-50%,-50%)', padding: '18px 22px', maxWidth: 'calc(100% - 32px)', lineHeight: 1.7, fontSize: 13 }}>
        {ui.touch ? <div><b style={{ color: C.acc }}>Touch</b><br />Left thumb: move stick (anywhere on the left)<br />Right side: drag to look<br />Tap a planet or label: select target<br />Tap a star in the sky: warp there<br />Target button (top right): list of all targets<br />FIND: search a city, mountain or planet and fly there<br />MAP: live system map, tap a planet to cruise there<br />CRUISE: fly fast to the target, STOP to drop out<br />Hold BOOST / ▲ ▼ / ⟲ ⟳ for boost, up/down, roll</div>
          : <div><b style={{ color: C.acc }}>Keyboard &amp; mouse</b><br />W/S thrust · A/D strafe · Space/X up/down · Q/E roll<br />Mouse look (click to capture) · Shift boost<br />Click a planet or T: choose target · Tab: next target<br />/ search · N map · F supercruise · V camera · M sound · P photo mode · G stats · B benchmark · J system · H hint bar</div>}
        <div style={{ color: C.dim, fontSize: 11, marginTop: 8 }}>Tap to close</div></div>}
      {ui.map.on && <MapUI eng={eng} m={ui.map} sysName={ui.system} date={ui.date} />}
      {ui.galaxy && <GalaxyUI eng={eng} gv={ui.galaxy} wsel={ui.wsel} />}
      {/* touch action cluster */}
      {ui.touch && !mapOut && <>
        <div {...tap(() => eng.act('KeyF'))} style={round(96, ui.cruise || ui.charging, { position: 'absolute', right: 18, bottom: 22, opacity: ui.canCruise || ui.cruise || ui.charging ? 1 : 0.45, fontSize: 12 })}>
          <Ico n={ui.cruise || ui.charging ? 'stop' : 'cruise'} s={30} />{cruiseLbl}</div>
        <div {...hold('ShiftLeft')} style={round(70, false, { position: 'absolute', right: 128, bottom: 18 })}><Ico n="boost" s={26} />BOOST</div>
        <div {...hold('Space')} style={round(60, false, { position: 'absolute', right: 34, bottom: 196 })}><Ico n="up" s={28} />UP</div>
        <div {...hold('KeyX')} style={round(60, false, { position: 'absolute', right: 34, bottom: 128 })}><Ico n="down" s={28} />DOWN</div>
        <div {...hold('KeyQ')} style={round(56, false, { position: 'absolute', left: 'calc(40% - 64px)', bottom: 16 })}><Ico n="rl" s={24} />ROLL</div>
        <div {...hold('KeyE')} style={round(56, false, { position: 'absolute', left: 'calc(40% + 8px)', bottom: 16 })}><Ico n="rr" s={24} />ROLL</div>
      </>}
    </div>);
}

export default function SpaceRoam({ systemId = 'sol', onReady, style, offscreen = false, renderScale = 0 }) {
  const ref = useRef(null), eng = useRef(null), [err, setErr] = useState(null), [api, setApi] = useState(null);
  useEffect(() => {
    let dead = false, e = null;
    createEngine(ref.current, systemId, { offscreen, renderScale }).then((x) => { if (dead) return x.destroy(); eng.current = e = x; setApi(x); onReady && onReady(x); }).catch((x) => setErr(String((x && x.message) || x)));
    return () => { dead = true; eng.current = null; e && e.destroy(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { eng.current && eng.current.switchStarSystem(systemId); }, [systemId]); // V2 interstellar hook
  if (err) return <div style={{ color: '#9cf', font: '16px monospace', padding: 24, background: '#000', height: '100%' }}>SpaceRoam: {err}</div>;
  return (<div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#000', ...style }}>
    <canvas ref={ref} tabIndex={0} style={{ width: '100%', height: '100%', display: 'block', outline: 'none', cursor: 'crosshair', touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }} />
    {api && <Overlay eng={api} />}</div>);
}
