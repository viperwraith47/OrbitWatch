/**
 * GlobeScene — a self-contained three.js scene that renders an interactive 3D
 * Earth with satellites propagated client-side by satellite.js (SGP4).
 *
 * React-agnostic on purpose: the React layer only calls setters and receives
 * throttled callbacks, so the 60 fps loop never triggers React re-renders.
 *
 * Coordinate conventions
 * ----------------------
 * The scene is Earth-fixed: the globe never rotates, positions are computed
 * in ECEF/geodetic coordinates for the current (possibly simulated) time.
 *   - lat/lng → scene:  standard equirectangular mapping (see latLonToVec3)
 *   - ECEF    → scene:  (x, z, -y)   (ECI→ECEF uses gmst)
 *   - Orbit ellipses are sampled in ECI, mapped with (x, z, -y) and the whole
 *     line object is rigidly rotated by rotation.y = -gmst each frame, which
 *     keeps the ellipse glued to the satellite dot.
 */

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import * as satellite from "satellite.js";

import type { GlobeTle } from "@/hooks/use-tle";

const EARTH_RADIUS_KM = 6371;
const EARTH_R = 1; // scene units

export interface GlobeOptions {
  showOrbits: boolean;
  showTracks: boolean;
  showLabels: boolean;
  autoRotate: boolean;
}

/** Live telemetry for one satellite (throttled push to React at ~2 Hz). */
export interface SatLive {
  noradId: number;
  name: string;
  color: string;
  valid: boolean;
  lat: number; // deg
  lng: number; // deg
  altKm: number;
  speedKmS: number;
  periodMin: number;
  inclDeg: number;
}

export interface SceneTle extends GlobeTle {
  color: string;
}

interface SatRecord {
  tle: SceneTle;
  color: THREE.Color;
  satrec: satellite.SatRec;
  periodMin: number;
  inclDeg: number;
  group: THREE.Group;
  dot: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  glow: THREE.Sprite;
  ring: THREE.Sprite;
  hit: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  orbitLine: THREE.Line;
  trackLine: THREE.Line;
  orbitBuiltAt: number; // sim ms
  trackBuiltAt: number; // sim ms
  valid: boolean;
  /** Latest propagated snapshot, updated every frame. */
  live?: { lat: number; lng: number; altKm: number; speedKmS: number };
}

function latLonToVec3(latDeg: number, lonDeg: number, r: number, out = new THREE.Vector3()): THREE.Vector3 {
  const phi = ((90 - latDeg) * Math.PI) / 180;
  const theta = ((lonDeg + 180) * Math.PI) / 180;
  return out.set(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
}

/** ECI/ECF (x, y, z) → scene (x, z, -y). */
function ecefToScene(v: { x: number; y: number; z: number }, r = 1, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(v.x * r, v.z * r, -v.y * r);
}

/** Radial-gradient sprite texture (glow dots, sun, selection pulse). */
function glowTexture(size = 128, inner = 0.06, ring = false): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, size * inner, size / 2, size / 2, size / 2);
  if (ring) {
    g.addColorStop(0.0, "rgba(255,255,255,0)");
    g.addColorStop(0.72, "rgba(255,255,255,0)");
    g.addColorStop(0.82, "rgba(255,255,255,0.9)");
    g.addColorStop(1.0, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  } else {
    g.addColorStop(0.0, "rgba(255,255,255,1)");
    g.addColorStop(0.25, "rgba(255,255,255,0.55)");
    g.addColorStop(0.6, "rgba(255,255,255,0.12)");
    g.addColorStop(1.0, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function starField(): THREE.Points {
  const N = 2600;
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const dir = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    dir.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
    if (dir.lengthSq() < 1e-4) dir.set(1, 0, 0);
    dir.normalize().multiplyScalar(42 + Math.random() * 14);
    pos.set([dir.x, dir.y, dir.z], i * 3);
    const b = 0.35 + Math.random() * 0.65;
    const warm = Math.random() < 0.18;
    col.set(warm ? [b, b * 0.85, b * 0.7] : [b * 0.85, b * 0.92, b], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({ size: 0.16, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false });
  return new THREE.Points(geo, mat);
}

const EARTH_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vUv = uv;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vPosW = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const EARTH_FRAG = /* glsl */ `
  uniform sampler2D dayTex;
  uniform sampler2D nightTex;
  uniform vec3 sunDir;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vec3 n = normalize(vNormalW);
    float sunAmt = dot(n, normalize(sunDir));
    float dayMix = smoothstep(-0.06, 0.28, sunAmt);
    vec3 day = texture2D(dayTex, vUv).rgb;
    vec3 night = texture2D(nightTex, vUv).rgb;
    // boost the city lights, warm them slightly
    vec3 nightGlow = night * vec3(1.25, 1.08, 0.82) * 1.7;
    vec3 color = mix(nightGlow, day * 0.96, dayMix);
    // warm tint along the terminator
    float term = smoothstep(-0.14, 0.10, sunAmt) * (1.0 - smoothstep(0.10, 0.38, sunAmt));
    color += vec3(0.28, 0.13, 0.04) * term * 0.55;
    // atmospheric rim, stronger on the day side
    vec3 viewDir = normalize(cameraPosition - vPosW);
    float fres = pow(1.0 - max(dot(n, viewDir), 0.0), 3.2);
    color += vec3(0.16, 0.33, 0.52) * fres * (0.30 + 0.70 * dayMix);
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

const ATMO_VERT = /* glsl */ `
  varying vec3 vNormalV;
  void main() {
    vNormalV = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ATMO_FRAG = /* glsl */ `
  varying vec3 vNormalV;
  void main() {
    float intensity = pow(0.62 - dot(vNormalV, vec3(0.0, 0.0, 1.0)), 4.2);
    gl_FragColor = vec4(0.24, 0.46, 0.78, 1.0) * clamp(intensity, 0.0, 1.4);
    #include <colorspace_fragment>
  }
`;

export class GlobeScene {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private earthMat: THREE.ShaderMaterial;
  private stars: THREE.Points;
  private sunSprite: THREE.Sprite;
  private observerGroup = new THREE.Group();
  private observerPulse?: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private sats = new Map<number, SatRecord>();
  private labelEls = new Map<number, HTMLElement>();
  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private resizeObs?: ResizeObserver;
  private raf = 0;
  private disposed = false;
  private w = 0;
  private h = 0;

  private options: GlobeOptions = { showOrbits: true, showTracks: true, showLabels: true, autoRotate: true };
  private selected: number | null = null;
  private getTime: () => number;
  private onTick?: (sats: SatLive[]) => void;
  private onPick?: (noradId: number | null) => void;

  private lastTickAt = 0;
  private lastRebuildWall = 0;
  private downPos = { x: 0, y: 0, t: 0 };
  private focusTween?: { from: THREE.Vector3; to: THREE.Vector3; t0: number; dur: number; wasAuto: boolean };
  private tmpA = new THREE.Vector3();
  private tmpB = new THREE.Vector3();
  private tmpC = new THREE.Vector3();

  private observer = { lat: 0, lng: 0 };

  constructor(
    container: HTMLElement,
    opts: {
      tles: SceneTle[];
      observer: { lat: number; lng: number };
      options: GlobeOptions;
      selected: number | null;
      getTime: () => number;
      onTick?: (sats: SatLive[]) => void;
      onPick?: (noradId: number | null) => void;
    },
  ) {
    this.container = container;
    this.getTime = opts.getTime;
    this.onTick = opts.onTick;
    this.onPick = opts.onPick;
    this.options = opts.options;
    this.selected = opts.selected;
    this.observer = opts.observer;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x04060a, 1);
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.renderer.domElement.setAttribute("aria-label", "Interactive 3D globe showing satellite positions");
    this.renderer.domElement.setAttribute("role", "img");
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
    this.camera.position.set(0.9, 1.15, 3.05);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.minDistance = 1.45;
    this.controls.maxDistance = 9;
    this.controls.rotateSpeed = 0.55;
    this.controls.zoomSpeed = 0.7;
    this.controls.autoRotate = this.options.autoRotate;
    this.controls.autoRotateSpeed = 0.45;

    // --- Earth -------------------------------------------------------------
    const loader = new THREE.TextureLoader();
    const dayTex = loader.load("/textures/earth-day.jpg");
    const nightTex = loader.load("/textures/earth-night.jpg");
    dayTex.colorSpace = THREE.SRGBColorSpace;
    nightTex.colorSpace = THREE.SRGBColorSpace;
    dayTex.anisotropy = 8;
    nightTex.anisotropy = 8;
    this.earthMat = new THREE.ShaderMaterial({
      uniforms: {
        dayTex: { value: dayTex },
        nightTex: { value: nightTex },
        sunDir: { value: new THREE.Vector3(1, 0, 0) },
      },
      vertexShader: EARTH_VERT,
      fragmentShader: EARTH_FRAG,
    });
    const earth = new THREE.Mesh(new THREE.SphereGeometry(EARTH_R, 96, 64), this.earthMat);
    this.scene.add(earth);

    // subtle graticule brightness reference sphere is skipped; topology would
    // need a bump-mapped standard material — the shader look is intentional.

    const atmo = new THREE.Mesh(
      new THREE.SphereGeometry(EARTH_R * 1.085, 64, 48),
      new THREE.ShaderMaterial({
        vertexShader: ATMO_VERT,
        fragmentShader: ATMO_FRAG,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.scene.add(atmo);

    // --- Background & sun --------------------------------------------------
    this.stars = starField();
    this.scene.add(this.stars);
    this.sunSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture(128, 0.02),
        color: 0xfff2d0,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.sunSprite.scale.setScalar(6.5);
    this.scene.add(this.sunSprite);

    // --- Observer ------------------------------------------------------------
    this.buildObserver();
    this.scene.add(this.observerGroup);

    // --- Satellites ----------------------------------------------------------
    this.setTles(opts.tles);

    // --- Events ---------------------------------------------------------------
    const el = this.renderer.domElement;
    el.addEventListener("pointerdown", this.onPointerDown);
    el.addEventListener("pointerup", this.onPointerUp);

    this.resizeObs = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      this.resize(width, height);
    });
    this.resizeObs.observe(container);
    this.resize(container.clientWidth, container.clientHeight);

    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  // ---------------------------------------------------------------- public --

  setTles(tles: SceneTle[]) {
    const want = new Set(tles.map((t) => t.noradId));
    for (const [id, rec] of this.sats) {
      if (!want.has(id)) {
        this.disposeSat(rec);
        this.sats.delete(id);
      }
    }
    for (const t of tles) {
      const existing = this.sats.get(t.noradId);
      if (existing) {
        if (existing.tle.line1 !== t.line1 || existing.tle.line2 !== t.line2) {
          this.disposeSat(existing);
          this.sats.delete(t.noradId);
        } else {
          continue;
        }
      }
      this.addSat(t);
    }
    this.applyVisibility();
  }

  setObserver(lat: number, lng: number) {
    this.observer = { lat, lng };
    const normal = latLonToVec3(lat, lng, 1).normalize();
    this.observerGroup.position.copy(normal).multiplyScalar(EARTH_R);
    this.observerGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
    this.observerGroup.updateMatrixWorld();
  }

  setOptions(patch: Partial<GlobeOptions>) {
    this.options = { ...this.options, ...patch };
    this.controls.autoRotate = this.options.autoRotate && !this.focusTween;
    this.applyVisibility();
  }

  setSelected(noradId: number | null) {
    this.selected = noradId;
    for (const [id, rec] of this.sats) {
      const on = id === noradId;
      rec.ring.visible = on;
      rec.dot.scale.setScalar(on ? 1.5 : 1);
      (rec.orbitLine.material as THREE.LineBasicMaterial).opacity = on ? 0.75 : 0.32;
      (rec.trackLine.material as THREE.LineBasicMaterial).opacity = on ? 0.8 : 0.42;
    }
  }

  setLabels(els: Map<number, HTMLElement>) {
    this.labelEls = els;
  }

  /** Fly the camera so the given satellite sits between the eye and Earth. */
  focusOn(noradId: number) {
    const rec = this.sats.get(noradId);
    if (!rec) return;
    const dir = rec.group.position.clone().normalize();
    if (dir.lengthSq() < 1e-6) return;
    const dist = Math.max(this.camera.position.length(), 2.1);
    this.focusTween = {
      from: this.camera.position.clone(),
      to: dir.multiplyScalar(dist),
      t0: performance.now(),
      dur: 750,
      wasAuto: this.controls.autoRotate,
    };
    this.controls.autoRotate = false;
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObs?.disconnect();
    const el = this.renderer.domElement;
    el.removeEventListener("pointerdown", this.onPointerDown);
    el.removeEventListener("pointerup", this.onPointerUp);
    for (const rec of this.sats.values()) this.disposeSat(rec);
    this.sats.clear();
    this.stars.geometry.dispose();
    (this.stars.material as THREE.Material).dispose();
    this.earthMat.uniforms.dayTex.value?.dispose?.();
    this.earthMat.uniforms.nightTex.value?.dispose?.();
    this.earthMat.dispose();
    this.observerGroup.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    this.controls.dispose();
    this.renderer.dispose();
    if (el.parentElement === this.container) this.container.removeChild(el);
  }

  // --------------------------------------------------------------- private --

  private buildObserver() {
    const amber = 0xf59e0b;
    const pin = new THREE.Mesh(
      new THREE.ConeGeometry(0.013, 0.055, 20),
      new THREE.MeshBasicMaterial({ color: amber }),
    );
    pin.position.y = 0.028; // cone tip outward (+Y local = surface normal)
    const base = new THREE.Mesh(
      new THREE.SphereGeometry(0.009, 20, 14),
      new THREE.MeshBasicMaterial({ color: 0xfde68a }),
    );
    base.position.y = 0.002;
    const pulse = new THREE.Mesh(
      new THREE.RingGeometry(0.022, 0.03, 48),
      new THREE.MeshBasicMaterial({ color: amber, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }),
    );
    pulse.rotation.x = -Math.PI / 2; // ring in local XZ plane (tangent to surface)
    pulse.position.y = 0.004;
    this.observerPulse = pulse;
    this.observerGroup.add(pin, base, pulse);
  }

  private addSat(t: SceneTle) {
    let satrec: satellite.SatRec;
    try {
      satrec = satellite.twoline2satrec(t.line1, t.line2);
    } catch {
      return; // unparsable — skip silently, list shows all selected
    }
    const color = new THREE.Color(t.color);
    const periodMin = Math.min(Math.max(1440 / (satrec.no || 1), 80), 60 * 24 * 30);

    const group = new THREE.Group();
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.0125, 20, 14),
      new THREE.MeshBasicMaterial({ color }),
    );
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture(96, 0.05),
        color,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      }),
    );
    glow.scale.setScalar(0.085);
    const ring = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture(128, 0, true),
        color,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      }),
    );
    ring.scale.setScalar(0.09);
    ring.visible = false;
    const hit = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 8, 6),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    hit.userData.noradId = t.noradId;
    group.add(dot, glow, ring, hit);

    const orbitLine = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.32 }),
    );
    const trackLine = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.42, depthWrite: false }),
    );
    this.scene.add(group, orbitLine, trackLine);

    this.sats.set(t.noradId, {
      tle: t,
      color,
      satrec,
      periodMin,
      inclDeg: (satrec.inclo * 180) / Math.PI,
      group,
      dot,
      glow,
      ring,
      hit,
      orbitLine,
      trackLine,
      orbitBuiltAt: -Infinity,
      trackBuiltAt: -Infinity,
      valid: false,
    });
  }

  private disposeSat(rec: SatRecord) {
    for (const o of [rec.group, rec.orbitLine, rec.trackLine] as THREE.Object3D[]) {
      this.scene.remove(o);
      o.traverse((c) => {
        if (c instanceof THREE.Mesh || c instanceof THREE.Line || c instanceof THREE.Sprite) {
          c.geometry?.dispose?.();
          const m = c.material as THREE.Material | THREE.Material[];
          if (Array.isArray(m)) m.forEach((x) => x.dispose());
          else m.dispose();
        }
      });
    }
  }

  private applyVisibility() {
    for (const rec of this.sats.values()) {
      rec.orbitLine.visible = this.options.showOrbits;
      rec.trackLine.visible = this.options.showTracks;
    }
    if (!this.options.showLabels) {
      for (const el of this.labelEls.values()) el.style.opacity = "0";
    }
  }

  private resize(w: number, h: number) {
    if (w < 2 || h < 2) {
      this.w = 0;
      this.h = 0;
      return;
    }
    this.w = w;
    this.h = h;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  private onPointerDown = (e: PointerEvent) => {
    this.downPos = { x: e.clientX, y: e.clientY, t: performance.now() };
  };

  private onPointerUp = (e: PointerEvent) => {
    if (!this.onPick) return;
    const moved = Math.hypot(e.clientX - this.downPos.x, e.clientY - this.downPos.y);
    if (moved > 6 || performance.now() - this.downPos.t > 600) return; // drag, not a click
    if (this.w < 2 || this.h < 2) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const hits = this.raycaster.intersectObjects(
      [...this.sats.values()].map((r) => r.hit),
      false,
    );
    this.onPick(hits.length > 0 ? ((hits[0].object.userData.noradId as number) ?? null) : null);
  };

  /** Sun direction in Earth-fixed scene coords for a given date. */
  private sunDirection(date: Date, out: THREE.Vector3): THREE.Vector3 {
    const { rsun } = satellite.sunPos(satellite.jday(date));
    const ecf = satellite.eciToEcf(rsun as unknown as { x: number; y: number; z: number }, satellite.gstime(date));
    return ecefToScene(ecf, 1, out).normalize();
  }

  private rebuildOrbit(rec: SatRecord, sim: number) {
    const n = 220;
    const pts: THREE.Vector3[] = [];
    const periodMs = rec.periodMin * 60_000;
    const t0 = sim;
    for (let i = 0; i <= n; i++) {
      const t = t0 + (i / n) * periodMs;
      const pv = satellite.propagate(rec.satrec, new Date(t));
      if (!pv || !pv.position) continue;
      // ECI at gmst=0 reference frame → rigid rotation applied per frame
      pts.push(this.tmpA.set(pv.position.x, pv.position.z, -pv.position.y).multiplyScalar(1 / EARTH_RADIUS_KM).clone());
    }
    if (pts.length > 4) {
      rec.orbitLine.geometry.dispose();
      rec.orbitLine.geometry = new THREE.BufferGeometry().setFromPoints(pts);
    }
    rec.orbitBuiltAt = sim;
  }

  private rebuildTrack(rec: SatRecord, sim: number) {
    const halfWinMs = Math.min(rec.periodMin / 2, 45) * 60_000;
    const stepMs = 30_000;
    const n = Math.max(2, Math.ceil((halfWinMs * 2) / stepMs));
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= n; i++) {
      const t = sim - halfWinMs + (i / n) * halfWinMs * 2;
      const pv = satellite.propagate(rec.satrec, new Date(t));
      if (!pv || !pv.position) continue;
      const gmst = satellite.gstime(new Date(t));
      const gd = satellite.eciToGeodetic(pv.position, gmst);
      pts.push(
        latLonToVec3(
          (gd.latitude * 180) / Math.PI,
          (gd.longitude * 180) / Math.PI,
          1.004,
          this.tmpA,
        ).clone(),
      );
    }
    if (pts.length > 4) {
      rec.trackLine.geometry.dispose();
      rec.trackLine.geometry = new THREE.BufferGeometry().setFromPoints(pts);
    }
    rec.trackBuiltAt = sim;
  }

  private updateSat(rec: SatRecord, sim: number, wall: number) {
    const date = new Date(sim);
    const pv = satellite.propagate(rec.satrec, date);
    rec.valid = !!(pv && pv.position);
    if (!rec.valid) {
      rec.group.visible = false;
      return;
    }
    rec.group.visible = true;
    const gmst = satellite.gstime(date);
    const gd = satellite.eciToGeodetic(pv.position, gmst);
    const lat = (gd.latitude * 180) / Math.PI;
    const lng = (gd.longitude * 180) / Math.PI;
    const r = 1 + gd.height / EARTH_RADIUS_KM;
    latLonToVec3(lat, lng, r, this.tmpB);
    rec.group.position.copy(this.tmpB);
    const v = pv.velocity;
    const speed = Math.hypot(v.x, v.y, v.z);

    // Keep the displayed ellipse glued to the dot (rigid ECI → ECEF rotation).
    rec.orbitLine.rotation.y = -gmst;

    if (Math.abs(sim - rec.orbitBuiltAt) > 10 * 60_000) this.rebuildOrbit(rec, sim);
    if (Math.abs(sim - rec.trackBuiltAt) > 60_000 && wall - this.lastRebuildWall > 250) {
      this.rebuildTrack(rec, sim);
      this.lastRebuildWall = wall;
    }

    // live snapshot for React (read by the throttled tick)
    rec.live = { lat, lng, altKm: gd.height, speedKmS: speed };
  }

  private pushTick(wall: number) {
    if (!this.onTick || wall - this.lastTickAt < 500) return;
    this.lastTickAt = wall;
    const out: SatLive[] = [];
    for (const [id, rec] of this.sats) {
      out.push({
        noradId: id,
        name: rec.tle.name,
        color: rec.tle.color,
        valid: rec.valid,
        lat: rec.live?.lat ?? 0,
        lng: rec.live?.lng ?? 0,
        altKm: rec.live?.altKm ?? 0,
        speedKmS: rec.live?.speedKmS ?? 0,
        periodMin: rec.periodMin,
        inclDeg: rec.inclDeg,
      });
    }
    this.onTick(out);
  }

  private updateLabels() {
    if (this.w < 2 || this.h < 2) return;
    const camPos = this.tmpA.copy(this.camera.position);
    const camDist = camPos.length();
    for (const [id, el] of this.labelEls) {
      if (id === -1) {
        // observer label
        this.placeLabel(el, this.observerGroup.position, 1, camPos, camDist);
        continue;
      }
      const rec = this.sats.get(id);
      if (!rec || !rec.valid) {
        el.style.opacity = "0";
        continue;
      }
      this.placeLabel(el, rec.group.position, rec.group.position.length(), camPos, camDist);
    }
  }

  private placeLabel(el: HTMLElement, worldPos: THREE.Vector3, r: number, camPos: THREE.Vector3, camDist: number) {
    if (!this.options.showLabels) {
      el.style.opacity = "0";
      return;
    }
    // occlusion: point visible when it clears the horizon plane of the sphere
    const visible = worldPos.dot(camPos) / (r * camDist) > (EARTH_R * EARTH_R) / (r * camDist) - 0.06;
    this.tmpB.copy(worldPos).project(this.camera);
    if (!visible || this.tmpB.z > 1 || Math.abs(this.tmpB.x) > 1.15 || Math.abs(this.tmpB.y) > 1.15) {
      el.style.opacity = "0";
      return;
    }
    const x = (this.tmpB.x * 0.5 + 0.5) * this.w;
    const y = (-this.tmpB.y * 0.5 + 0.5) * this.h;
    el.style.opacity = "1";
    el.style.transform = `translate(-50%, -135%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  }

  private loop() {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const wall = performance.now();
    const hidden = this.container.offsetParent === null || this.w < 2 || this.h < 2;
    if (hidden) return;

    const sim = this.getTime();
    const simDate = new Date(sim);

    // Earth lighting follows the (simulated) sun
    const sunDir = this.sunDirection(simDate, this.tmpC);
    (this.earthMat.uniforms.sunDir.value as THREE.Vector3).copy(sunDir);
    this.sunSprite.position.copy(sunDir).multiplyScalar(38);

    for (const rec of this.sats.values()) this.updateSat(rec, sim, wall);

    // camera focus tween
    if (this.focusTween) {
      const k = Math.min(1, (wall - this.focusTween.t0) / this.focusTween.dur);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      this.camera.position.lerpVectors(this.focusTween.from, this.focusTween.to, e);
      if (k >= 1) {
        this.controls.autoRotate = this.options.autoRotate;
        this.focusTween = undefined;
      }
    }

    // observer pulse
    if (this.observerPulse) {
      const t = (wall % 1800) / 1800;
      this.observerPulse.scale.setScalar(1 + t * 1.6);
      this.observerPulse.material.opacity = 0.85 * (1 - t);
    }

    // selection ring pulse
    if (this.selected != null) {
      const rec = this.sats.get(this.selected);
      if (rec && rec.ring.visible) {
        const t = (wall % 1200) / 1200;
        rec.ring.scale.setScalar(0.07 + t * 0.07);
        (rec.ring.material as THREE.SpriteMaterial).opacity = 0.95 * (1 - t);
      }
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.updateLabels();
    this.pushTick(wall);
  }
}
