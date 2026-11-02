// Smoke test: satellite.js v7 under bun — propagate, look angles, sun, shadow
import {
  twoline2satrec,
  propagate,
  gstime,
  geodeticToEcf,
  eciToEcf,
  ecfToLookAngles,
  eciToGeodetic,
  sunPos,
  shadowFraction,
  radiansToDegrees,
  jday,
} from "satellite.js";

const ISS_TLE1 =
  "1 25544U 98067A   26305.40213001  .00006924  00000+0  13304-3 0  9991";
const ISS_TLE2 =
  "2 25544  51.6333 341.0833 0007085 335.3698  24.6951 15.49140766593021";

const satrec = twoline2satrec(ISS_TLE1, ISS_TLE2);
const now = new Date();
const pv = propagate(satrec, now);
if (!pv) {
  console.error("PROPAGATE FAILED");
  process.exit(1);
}
console.log("pos ECI km:", pv.position.x.toFixed(1), pv.position.y.toFixed(1), pv.position.z.toFixed(1));

// Observer: New York
const observerGd = {
  latitude: (40.7128 * Math.PI) / 180,
  longitude: (-74.006 * Math.PI) / 180,
  height: 0.01,
};
const gmst = gstime(now);
const satEcf = eciToEcf(pv.position, gmst);
const look = ecfToLookAngles(observerGd, satEcf);
console.log(
  "az/el/range:",
  radiansToDegrees(look.azimuth).toFixed(2),
  radiansToDegrees(look.elevation).toFixed(2),
  look.rangeSat.toFixed(1),
);

const geo = eciToGeodetic(pv.position, gmst);
console.log(
  "subpoint lat/lon/alt km:",
  radiansToDegrees(geo.latitude).toFixed(3),
  radiansToDegrees(geo.longitude).toFixed(3),
  geo.height.toFixed(1),
);

// Sun + shadow
const jd = jday(now);
const { rsun } = sunPos(jd);
const sf = shadowFraction(rsun, pv.position);
console.log("shadowFraction (0=lit,1=umbra):", sf.toFixed(3));

// Observer sun elevation via ECF: sun ECI(km) -> ECF
const sunKm = { x: rsun.x * 149597870.7, y: rsun.y * 149597870.7, z: rsun.z * 149597870.7 };
const sunEcf = eciToEcf(sunKm, gmst);
const sunLook = ecfToLookAngles(observerGd, sunEcf);
console.log("sun az/el at observer:", radiansToDegrees(sunLook.azimuth).toFixed(1), radiansToDegrees(sunLook.elevation).toFixed(1));

// Speed check: 10k propagations
const t0 = performance.now();
let acc = 0;
for (let i = 0; i < 10000; i++) {
  const d = new Date(now.getTime() + i * 30000);
  const r = propagate(satrec, d);
  if (r) acc += r.position.x;
}
const dt = performance.now() - t0;
console.log(`10k propagations in ${dt.toFixed(0)} ms => ${(dt / 10).toFixed(1)} us/call (acc=${acc.toFixed(0)})`);
console.log("SMOKE OK");
