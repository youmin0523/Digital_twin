import React, { useRef, useEffect, useImperativeHandle, forwardRef, useCallback } from 'react';
import * as THREE from 'three';

// ── Constants ────────────────────────────────────────────────────────────────
const MOUSE_SENS = 0.0004;
const MAX_ROT = 0.03;
const ZOOM_MIN = -80;
const ZOOM_MAX = 500;

const BASE_GM = 3.2;
const BASE_OMEGA_R = 0.176;
const BASE_OMEGA_P = 0.21;

const METERS_PER_DEGREE_LAT = 111132.954;
const METERS_PER_DEGREE_LON_AT_EQUATOR = 111319.491;

const FOAM_COUNT = 60;
const MAX_LOCAL_ICEBERGS = 180;

const ICE_TYPES = [
  { name: 'tabular', prob: 0.08, w: [400, 900], d: [350, 800], h: [120, 250], subRatio: 5 },
  { name: 'large',   prob: 0.12, w: [200, 500], d: [180, 450], h: [400, 800], subRatio: 6 },
  { name: 'medium',  prob: 0.30, w: [80, 200],  d: [70, 180],  h: [180, 400], subRatio: 7 },
  { name: 'small',   prob: 0.35, w: [25, 80],   d: [22, 70],   h: [60, 160],  subRatio: 5 },
  { name: 'growler', prob: 0.15, w: [6, 25],    d: [5, 22],    h: [15, 50],   subRatio: 4 },
];

// ── Utility ──────────────────────────────────────────────────────────────────
function rng(a, b) {
  return a + Math.random() * (b - a);
}

function pickType() {
  let r = Math.random(), cum = 0;
  for (const t of ICE_TYPES) {
    cum += t.prob;
    if (r < cum) return t;
  }
  return ICE_TYPES[ICE_TYPES.length - 1];
}

// ── Bathymetry / color mapping ───────────────────────────────────────────────
function estimateBathymetry(lon, lat) {
  const latN = Math.max(0, Math.min(1, (lat - 60) / 30));
  let depth;
  if (latN < 0.3) depth = 60 + (latN / 0.3) * 250;
  else if (latN < 0.5) depth = 310 + ((latN - 0.3) / 0.2) * 2200;
  else depth = 2500 + ((latN - 0.5) / 0.5) * 1500;
  const ridgeLon = -40 + (lat - 78) * 5;
  const dRidge = Math.abs(lon - ridgeLon);
  if (dRidge < 15 && lat > 78) depth = Math.min(depth, 1200 + dRidge * 100);
  depth +=
    Math.sin(lon * 0.8 + lat * 0.3) * 200 +
    Math.cos(lon * 0.3 - lat * 0.6) * 150 +
    Math.sin((lon + lat) * 0.5) * 100;
  return Math.max(10, Math.min(6500, depth));
}

function depthToRGB(d) {
  let r, g, b;
  if (d < 50) {
    const t = d / 50;
    r = 255; g = 51 + t * 119; b = 0;
  } else if (d < 200) {
    const t = (d - 50) / 150;
    r = 255 - t * 51; g = 170 + t * 85; b = 0;
  } else if (d < 1000) {
    const t = (d - 200) / 800;
    r = 204 - t * 204; g = 255 - t * 51; b = t * 102;
  } else if (d < 2000) {
    const t = (d - 1000) / 1000;
    r = 0; g = 204 - t * 51; b = 102 + t * 153;
  } else if (d < 4000) {
    const t = (d - 2000) / 2000;
    r = 0; g = 153 - t * 153; b = 255;
  } else {
    const t = Math.min(1, (d - 4000) / 2000);
    r = t * 102; g = 0; b = 255 - t * 51;
  }
  return [r / 255, g / 255, b / 255];
}

function iceToRGB(conc) {
  let r, g, b;
  if (conc < 0.25) {
    const t = conc / 0.25;
    r = 10 - t * 10; g = 25 + t * 60; b = 47 + t * 208;
  } else if (conc < 0.50) {
    const t = (conc - 0.25) / 0.25;
    r = 0; g = 85 + t * 85; b = 255;
  } else if (conc < 0.75) {
    const t = (conc - 0.50) / 0.25;
    r = t * 224; g = 170 + t * 77; b = 255 - t * 5;
  } else {
    const t = (conc - 0.75) / 0.25;
    r = 224 + t * 31; g = 247 + t * 8; b = 250 + t * 5;
  }
  return [r / 255, g / 255, b / 255];
}

// ── Sea state / ship motion helpers ──────────────────────────────────────────
function getSeaState(lat) {
  if (lat > 78) return { Hs: 0.6, Tp: 8, label: 'icy waters - low waves' };
  if (lat > 68) return { Hs: 1.5, Tp: 10, label: 'ice edge - moderate waves' };
  if (lat > 50) return { Hs: 2.8, Tp: 12, label: 'arctic open ocean - high waves' };
  return { Hs: 1.8, Tp: 9, label: 'coastal waters' };
}

function fovFromSpeed(kn) {
  if (kn <= 0) return 85;
  if (kn <= 8) return 85 + (kn / 8) * 3;
  if (kn <= 15) return 88 + ((kn - 8) / 7) * 4;
  if (kn <= 20) return 92 + ((kn - 15) / 5) * 5;
  return Math.min(103, 97 + (kn - 20) * 0.6);
}

// ── Iceberg geometry builder ─────────────────────────────────────────────────
function makeIceGeo(typeName, w, h, d) {
  const segs = typeName === 'growler' ? 6 : 9;
  const layers = typeName === 'tabular' ? 2 : 5;
  const g = new THREE.ConeGeometry(w * 0.52, h, segs, layers);
  const p = g.attributes.position;

  const xzAmp = Math.min(w * 0.22, 25);
  const yAmp = Math.min(h * 0.18, 25);

  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const t = Math.max(0, Math.min(1, y / h + 0.5));
    const bulge = Math.sin(t * Math.PI) * 0.8 + 0.2;
    const xzNoise = 1 + (Math.random() - 0.5) * (xzAmp / w) * bulge;
    p.setX(i, p.getX(i) * xzNoise * (d / w));
    p.setZ(i, p.getZ(i) * xzNoise);
    const yNoise = 1 + (Math.random() - 0.5) * (yAmp / h) * bulge;
    p.setY(i, y * yNoise);
  }
  p.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

// =============================================================================
// ThreeOverlay Component
// =============================================================================
const ThreeOverlay = forwardRef(function ThreeOverlay({ visible, shipState, mode }, ref) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);

  // All Three.js objects stored in a mutable ref so they survive re-renders
  // without triggering them.
  const ctx = useRef({
    renderer: null,
    scene: null,
    camera: null,
    // ocean
    waveGeo: null,
    waveMesh: null,
    // ship
    shipGroup3: null,
    shipMesh3: null,
    cameraPivot3: null,
    // icebergs
    tIcebergs: [],
    realBergs: [],
    // foam
    foamGeo: null,
    foamPoints: null,
    // lighting (kept for night mode)
    ambientLight: null,
    sunLight: null,
    // land
    landGroup: null,
    // time accumulator
    tTime: 0,
    // motion state
    shipRoll: 0,
    shipRollVel: 0,
    shipPitch: 0,
    shipPitchVel: 0,
    shipHeave: 0,
    shipHeaveVel: 0,
    motionWavePhase: Math.random() * Math.PI * 2,
    impactRoll: 0,
    impactPitch: 0,
    impactActive: false,
    screenShakeT: 0,
    fovImpactBoost: 0,
    nightFactor: 0,
    nearestIceDist: Infinity,
    omegaR: BASE_OMEGA_R,
    omegaP: BASE_OMEGA_P,
    shipGM: 3.2,
    // ocean overlay
    oceanColorMode: 'none',
    overlayFrame: 119,
    // shared materials (created once)
    iceMat: null,
    subMat: null,
    realBergMat: null,
    discMat: null,
    ringMat: null,
    // disposables tracking
    disposables: [],
  });

  // ── Build helpers (closures over ctx) ────────────────────────────────────

  const trackDisposable = useCallback((obj) => {
    ctx.current.disposables.push(obj);
    return obj;
  }, []);

  // -- Sky dome --
  const buildSky = useCallback(() => {
    const { scene } = ctx.current;
    const skyGeo = trackDisposable(new THREE.SphereGeometry(400000, 16, 8));
    const skyMat = trackDisposable(
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          skyTop: { value: new THREE.Color(0x3a6080) },
          skyMid: { value: new THREE.Color(0x6a9ab8) },
          skyHorizon: { value: new THREE.Color(0x8ab0c8) },
        },
        vertexShader: `varying float vH;void main(){vH=position.y;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
        fragmentShader: `varying float vH;uniform vec3 skyTop,skyMid,skyHorizon;void main(){if(vH<0.0) discard; float t1=clamp(vH/400000.0,0.0,1.0);float t2=clamp(vH/80000.0,0.0,1.0);vec3 c=mix(skyHorizon,skyMid,t2);gl_FragColor=vec4(mix(c,skyTop,t1*t1),1.0);}`,
      }),
    );
    scene.add(new THREE.Mesh(skyGeo, skyMat));
  }, [trackDisposable]);

  // -- Lighting --
  const buildLighting = useCallback(() => {
    const { scene } = ctx.current;

    const ambient = new THREE.AmbientLight(0x8aaabb, 1.1);
    scene.add(ambient);
    ctx.current.ambientLight = ambient;

    const sun = new THREE.DirectionalLight(0xffeedd, 0.65);
    sun.position.set(500, 200, -800);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 100000;
    sun.shadow.camera.left = -40000;
    sun.shadow.camera.right = 40000;
    sun.shadow.camera.top = 40000;
    sun.shadow.camera.bottom = -40000;
    scene.add(sun);
    ctx.current.sunLight = sun;

    const sky = new THREE.DirectionalLight(0x6699bb, 0.45);
    sky.position.set(-300, 800, 400);
    scene.add(sky);
  }, []);

  // -- Ocean --
  const buildOcean = useCallback(() => {
    const { scene } = ctx.current;
    const waveGeo = trackDisposable(new THREE.PlaneGeometry(80000, 80000, 64, 64));
    waveGeo.rotateX(-Math.PI / 2);
    const mat = trackDisposable(
      new THREE.MeshPhongMaterial({
        color: 0x0a2a4a,
        specular: 0x4a8aaa,
        shininess: 80,
        transparent: false,
        opacity: 1.0,
      }),
    );
    const waveMesh = new THREE.Mesh(waveGeo, mat);
    waveMesh.receiveShadow = true;
    scene.add(waveMesh);
    ctx.current.waveGeo = waveGeo;
    ctx.current.waveMesh = waveMesh;
  }, [trackDisposable]);

  // -- Icebergs --
  const placeOnWater = useCallback((mesh, x, z) => {
    mesh.position.set(x, 0, z);
    const box = new THREE.Box3().setFromObject(mesh);
    mesh.position.y = -box.min.y;
  }, []);

  const spawnIceberg = useCallback(
    (ox, oz, type) => {
      const { scene, tIcebergs, iceMat, discMat, ringMat } = ctx.current;
      const w = rng(type.w[0], type.w[1]);
      const h = rng(type.h[0], type.h[1]);
      const d = rng(type.d[0], type.d[1]);
      const bR = Math.max(Math.max(w, d) * 0.45, 3);

      const geo = trackDisposable(makeIceGeo(type.name, w, h, d));
      const mesh = new THREE.Mesh(geo, iceMat);
      mesh.rotation.y = Math.random() * Math.PI * 2;
      if (type.name !== 'tabular') {
        mesh.rotation.z = (Math.random() - 0.5) * 0.07;
        mesh.rotation.x = (Math.random() - 0.5) * 0.05;
      }
      placeOnWater(mesh, ox, oz);

      const grp = new THREE.Group();
      grp.add(mesh);

      // Water-line contact layers (skip for growler / tiny small w<=40)
      if (w > 40) {
        const rr = Math.max(w, d) * 0.5;
        // Dark disc shadow beneath iceberg base
        const discGeo = trackDisposable(new THREE.CircleGeometry(rr * 0.9, 16));
        const disc = new THREE.Mesh(discGeo, discMat);
        disc.rotation.x = -Math.PI / 2;
        disc.position.set(ox, 0.1, oz);
        grp.add(disc);
        // Foam ring at waterline
        const ringGeo = trackDisposable(
          new THREE.RingGeometry(rr * 0.93, rr * 1.09, type.name === 'tabular' ? 20 : 14),
        );
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(ox, 0.3, oz);
        grp.add(ring);
      }

      scene.add(grp);
      tIcebergs.push({ grp, ox, oz, cx: ox, cz: oz, r: bR });
    },
    [trackDisposable, placeOnWater],
  );

  const buildIcebergs = useCallback(() => {
    const { scene, tIcebergs } = ctx.current;

    // Clear existing icebergs
    for (const ice of tIcebergs) {
      if (ice.grp.parent) ice.grp.parent.remove(ice.grp);
    }
    tIcebergs.length = 0;

    // Close range: small/medium only
    const closeRanges = [60, 100, 155, 220, 310, 420];
    for (const dist of closeRanges) {
      const angle = Math.PI / 3 + Math.random() * ((Math.PI * 4) / 3);
      const closeType = dist < 180 ? ICE_TYPES[3] : ICE_TYPES[2];
      spawnIceberg(Math.cos(angle) * dist, Math.sin(angle) * dist, closeType);
    }
    // Mid range: all types mixed
    for (let i = 0; i < 55; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = rng(500, 5000);
      spawnIceberg(Math.cos(angle) * dist, Math.sin(angle) * dist, pickType());
    }
    // Far range: tabular/large 45% priority
    for (let i = 0; i < 90; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = rng(5000, 90000);
      const farType =
        Math.random() < 0.45
          ? Math.random() < 0.4
            ? ICE_TYPES[0]
            : ICE_TYPES[1]
          : pickType();
      spawnIceberg(Math.cos(angle) * dist, Math.sin(angle) * dist, farType);
    }
  }, [spawnIceberg]);

  // -- Real iceberg data (yellow) --
  const updateRealBergs = useCallback((bergs, shipLat, shipLon) => {
    const { scene, realBergs, realBergMat } = ctx.current;
    if (!scene || !realBergMat) return;

    // Remove previous real berg meshes
    for (const grp of realBergs) {
      if (grp.parent) grp.parent.remove(grp);
    }
    realBergs.length = 0;

    if (!bergs || bergs.length === 0) return;

    const latRad = (shipLat * Math.PI) / 180;
    const mPerDegLon = METERS_PER_DEGREE_LON_AT_EQUATOR * Math.cos(latRad);
    const VISIBLE_RANGE = 50000; // 50km

    for (const berg of bergs) {
      const x = (berg.lon - shipLon) * mPerDegLon / 1.5;
      const z = -(berg.lat - shipLat) * METERS_PER_DEGREE_LAT / 1.5;
      const dist = Math.sqrt(x * x + z * z);
      if (dist > VISIBLE_RANGE) continue;

      const size = Math.max(berg.size || 5000, 500);
      const h = size * 0.15;
      const geo = new THREE.ConeGeometry(size * 0.3 / 1.5, h, 8);
      const mesh = new THREE.Mesh(geo, realBergMat);
      const grp = new THREE.Group();
      grp.add(mesh);
      grp.position.set(x, h / 2, z);
      scene.add(grp);
      realBergs.push(grp);
    }
  }, []);

  // -- Ship --
  const buildShip = useCallback(() => {
    const { scene } = ctx.current;
    if (ctx.current.shipGroup3) {
      scene.remove(ctx.current.shipGroup3);
    }

    const shipGroup3 = new THREE.Group();
    const shipMesh3 = new THREE.Group();
    const cameraPivot3 = new THREE.Object3D();

    const mk = (geo, mat, px, py, pz, ry = 0) => {
      trackDisposable(geo);
      trackDisposable(mat);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(px, py, pz);
      m.rotation.y = ry;
      m.castShadow = true;
      m.receiveShadow = true;
      shipMesh3.add(m);
    };

    // Red hull body
    mk(
      new THREE.BoxGeometry(28, 10, 160),
      new THREE.MeshPhongMaterial({ color: 0xcc2222 }),
      0, 0, 0,
    );
    // Bow cone
    mk(
      new THREE.CylinderGeometry(0, 14, 18, 4),
      new THREE.MeshPhongMaterial({ color: 0xaa1818 }),
      0, 0, -89,
      Math.PI / 4,
    );
    // Superstructure main block
    mk(
      new THREE.BoxGeometry(24, 18, 55),
      new THREE.MeshPhongMaterial({ color: 0xf0f0f0 }),
      0, 14, 15,
    );
    // Bridge deck
    mk(
      new THREE.BoxGeometry(22, 8, 16),
      new THREE.MeshPhongMaterial({ color: 0xe0e0e0 }),
      0, 27, 10,
    );
    // Funnel / smokestack
    mk(
      new THREE.CylinderGeometry(2.5, 3, 18, 8),
      new THREE.MeshPhongMaterial({ color: 0x222222 }),
      0, 32, 5,
    );
    // Boom / crane arm
    const bmGeo = trackDisposable(new THREE.BoxGeometry(1, 1, 30));
    const bmMat = trackDisposable(new THREE.MeshPhongMaterial({ color: 0xffcc00 }));
    const bm = new THREE.Mesh(bmGeo, bmMat);
    bm.rotation.z = Math.PI / 6;
    bm.position.set(10, 22, -30);
    bm.castShadow = true;
    shipMesh3.add(bm);
    // Radar dome
    mk(
      new THREE.SphereGeometry(3, 8, 6),
      new THREE.MeshPhongMaterial({ color: 0x888888 }),
      0, 36, 8,
    );

    shipGroup3.add(shipMesh3);
    shipGroup3.add(cameraPivot3);
    scene.add(shipGroup3);

    ctx.current.shipGroup3 = shipGroup3;
    ctx.current.shipMesh3 = shipMesh3;
    ctx.current.cameraPivot3 = cameraPivot3;
  }, [trackDisposable]);

  // -- Foam wake particles --
  const buildFoam = useCallback(() => {
    const { scene } = ctx.current;
    const foamGeo = trackDisposable(new THREE.BufferGeometry());
    const pos = new Float32Array(FOAM_COUNT * 3);
    for (let i = 0; i < FOAM_COUNT; i++) {
      pos[i * 3] = 0;
      pos[i * 3 + 1] = 0;
      pos[i * 3 + 2] = 0;
    }
    foamGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = trackDisposable(
      new THREE.PointsMaterial({
        color: 0xddf4ff,
        size: 4,
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
      }),
    );
    const foamPoints = new THREE.Points(foamGeo, mat);
    scene.add(foamPoints);
    ctx.current.foamGeo = foamGeo;
    ctx.current.foamPoints = foamPoints;
  }, [trackDisposable]);

  // -- Land masses --
  const buildLandMasses = useCallback(
    (baseLat, baseLon) => {
      const { scene } = ctx.current;
      if (ctx.current.landGroup) scene.remove(ctx.current.landGroup);
      const landGroup = new THREE.Group();

      const latRad = (baseLat * Math.PI) / 180;
      const mPerDegLon = METERS_PER_DEGREE_LON_AT_EQUATOR * Math.cos(latRad);

      function ll(lat, lon) {
        return {
          x: ((lon - baseLon) * mPerDegLon) / 1.5,
          z: (-(lat - baseLat) * METERS_PER_DEGREE_LAT) / 1.5,
        };
      }

      function addLand(lat1, lon1, lat2, lon2, h, color) {
        const p1 = ll(lat1, lon1);
        const p2 = ll(lat2, lon2);
        const w = Math.abs(p2.x - p1.x);
        const d = Math.abs(p2.z - p1.z);
        if (w < 100 || d < 100) return;
        const geo = trackDisposable(new THREE.BoxGeometry(w, h, d));
        const mat = trackDisposable(new THREE.MeshPhongMaterial({ color, shininess: 5 }));
        const m = new THREE.Mesh(geo, mat);
        m.position.set((p1.x + p2.x) / 2, h / 2, (p1.z + p2.z) / 2);
        m.receiveShadow = true;
        landGroup.add(m);
      }

      // Korean Peninsula
      addLand(34.0, 126.0, 38.5, 130.0, 800, 0x3a5a2a);
      // Japan Honshu
      addLand(33.0, 130.0, 40.0, 142.0, 1200, 0x3a5a2a);
      // Hokkaido
      addLand(41.5, 140.0, 45.5, 145.5, 900, 0x3a5a2a);
      // Russian Primorsky
      addLand(42.0, 130.0, 55.0, 145.0, 600, 0x4a6a3a);
      // Russian Chukchi / East Siberia
      addLand(60.0, 160.0, 72.0, 180.0, 500, 0x5a6a4a);
      addLand(60.0, -180.0, 70.0, -160.0, 500, 0x5a6a4a);
      // Kamchatka
      addLand(51.0, 156.0, 60.0, 163.0, 1500, 0x4a6a3a);
      // Alaska
      addLand(60.0, -168.0, 71.0, -141.0, 800, 0x5a6a4a);
      // Greenland
      addLand(60.0, -50.0, 83.0, -18.0, 2000, 0x8a9a9a);
      // Norway / Scandinavia
      addLand(57.0, 5.0, 71.0, 30.0, 800, 0x3a5a2a);
      // Svalbard
      addLand(76.5, 14.0, 80.5, 28.0, 500, 0x8a9a8a);
      // United Kingdom
      addLand(50.0, -6.0, 59.0, 2.0, 400, 0x3a5a2a);
      // Netherlands / German coast
      addLand(51.0, 3.0, 54.0, 10.0, 100, 0x4a6a3a);
      // Iceland
      addLand(63.5, -24.0, 66.5, -13.0, 600, 0x6a7a6a);
      // Northern Canada
      addLand(70.0, -100.0, 78.0, -60.0, 400, 0x5a6a4a);

      scene.add(landGroup);
      ctx.current.landGroup = landGroup;
    },
    [trackDisposable],
  );

  // ── Imperative methods exposed to parent via ref ──────────────────────────

  // animateOcean: wave vertex animation
  const animateOcean = useCallback((t, shipRef) => {
    const { waveGeo, waveMesh } = ctx.current;
    if (!waveGeo || !waveMesh) return;
    const sx = shipRef ? shipRef.x : 0;
    const sz = shipRef ? shipRef.z : 0;
    waveMesh.position.x = sx;
    waveMesh.position.z = sz;
    const pos = waveGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + sx;
      const z = pos.getZ(i) + sz;
      pos.setY(
        i,
        Math.sin(x * 0.00012 + t * 0.24) * 0.42 +
          Math.cos(z * 0.00015 + t * 0.16) * 0.3 +
          Math.sin((x + z) * 0.00008 + t * 0.12) * 0.24,
      );
    }
    pos.needsUpdate = true;
    waveGeo.computeVertexNormals();
  }, []);

  // updateOceanOverlay: depth / ice color overlay on ocean mesh
  const updateOceanOverlay = useCallback((colorMode, shipLon, shipLat, sampleIceConcentrationFn) => {
    const { waveGeo, waveMesh } = ctx.current;
    if (!waveMesh || !waveGeo) return;
    ctx.current.overlayFrame++;
    if (ctx.current.overlayFrame % 120 !== 0) return;

    const geo = waveGeo;
    const positions = geo.attributes.position;
    const count = positions.count;

    if (!geo.attributes.color) {
      const arr = new Float32Array(count * 3);
      for (let k = 0; k < count; k++) {
        arr[k * 3] = 10 / 255;
        arr[k * 3 + 1] = 42 / 255;
        arr[k * 3 + 2] = 63 / 255;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    }
    const colors = geo.attributes.color;

    if (colorMode === 'none') {
      for (let i = 0; i < count; i++) colors.setXYZ(i, 10 / 255, 42 / 255, 63 / 255);
      colors.needsUpdate = true;
      return;
    }

    const metersPerDeg = 111320;
    const cosLat = Math.cos((shipLat * Math.PI) / 180);

    for (let i = 0; i < count; i++) {
      const localX = positions.getX(i);
      const localZ = positions.getZ(i);
      const vLon = shipLon + (localX * 1.5) / (metersPerDeg * cosLat);
      const vLat = shipLat - (localZ * 1.5) / metersPerDeg;

      let rgb;
      if (colorMode === 'ice') {
        const conc = sampleIceConcentrationFn ? sampleIceConcentrationFn(vLon, vLat) : 0;
        rgb = iceToRGB(conc || 0);
      } else {
        rgb = depthToRGB(estimateBathymetry(vLon, vLat));
      }
      colors.setXYZ(i, rgb[0], rgb[1], rgb[2]);
    }
    colors.needsUpdate = true;
  }, []);

  // updateFoam: animate bow-spray particles
  const updateFoam = useCallback((dt, heading, speedMS, shipPosVec) => {
    const { foamGeo, foamPoints } = ctx.current;
    if (!foamGeo || !foamPoints) return;
    if (speedMS < 0.1) {
      foamPoints.visible = false;
      return;
    }
    foamPoints.visible = true;
    const fwdX = Math.sin(heading);
    const fwdZ = -Math.cos(heading);
    const bowX = shipPosVec.x + fwdX * 85;
    const bowZ = shipPosVec.z + fwdZ * 85;
    const pa = foamGeo.attributes.position;
    for (let i = 0; i < FOAM_COUNT; i++) {
      let px = pa.getX(i);
      let py = pa.getY(i);
      let pz = pa.getZ(i);
      px -= fwdX * speedMS * dt * (0.6 + Math.random() * 0.4);
      pz -= fwdZ * speedMS * dt * (0.6 + Math.random() * 0.4);
      py = Math.max(0, py - dt * 1.5);
      const dx = px - shipPosVec.x;
      const dz = pz - shipPosVec.z;
      const dotFwd = dx * fwdX + dz * fwdZ;
      if (dotFwd < -280 || Math.sqrt(dx * dx + dz * dz) > 380) {
        px = bowX + (Math.random() - 0.5) * 18;
        py = 0.5 + Math.random() * 2.5;
        pz = bowZ + (Math.random() - 0.5) * 18;
      }
      pa.setXYZ(i, px, py, pz);
    }
    pa.needsUpdate = true;
  }, []);

  // updateShipPosition: move ship group position + heading (smooth lerp)
  const updateShipPosition = useCallback((posVec, targetHeading) => {
    const { shipGroup3 } = ctx.current;
    if (!shipGroup3) return;
    shipGroup3.position.copy(posVec);

    // Smooth heading rotation (lerp with wrapping)
    let diff = -targetHeading - shipGroup3.rotation.y;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    shipGroup3.rotation.y += diff * 0.05;
  }, []);

  // updateShipMotion: roll, pitch, heave based on sea state
  const updateShipMotion = useCallback((dt, lat) => {
    const c = ctx.current;
    const st = getSeaState(lat);
    c.motionWavePhase += dt * ((2 * Math.PI) / st.Tp);

    const zetaR = 0.05;
    const zetaP = 0.04;
    const rollAmpScale = Math.sqrt(BASE_GM / Math.max(0.5, c.shipGM));

    const aR =
      st.Hs *
      rollAmpScale *
      (0.018 * Math.sin(c.motionWavePhase + 0.3) +
        0.008 * Math.sin(c.motionWavePhase * 1.7 + 1.1));
    const aP =
      st.Hs *
      (0.008 * Math.sin(c.motionWavePhase * 1.3 + 2.0) +
        0.004 * Math.sin(c.motionWavePhase * 0.8 + 0.5));
    const aH = st.Hs * 0.3 * Math.sin(c.motionWavePhase * 0.9 + 0.7);

    c.shipRollVel +=
      (-2 * zetaR * c.omegaR * c.shipRollVel - c.omegaR * c.omegaR * c.shipRoll + aR) * dt;
    c.shipRoll += c.shipRollVel * dt;

    c.shipPitchVel +=
      (-2 * zetaP * c.omegaP * c.shipPitchVel - c.omegaP * c.omegaP * c.shipPitch + aP) * dt;
    c.shipPitch += c.shipPitchVel * dt;

    c.shipHeaveVel +=
      (-0.08 * c.shipHeaveVel - c.omegaR * c.omegaR * c.shipHeave + aH) * dt;
    c.shipHeave += c.shipHeaveVel * dt;

    if (c.impactActive) {
      c.impactRoll *= 0.9;
      c.impactPitch *= 0.9;
      if (Math.abs(c.impactRoll) < 0.0005 && Math.abs(c.impactPitch) < 0.0005) {
        c.impactActive = false;
      }
    }
    if (c.screenShakeT > 0) c.screenShakeT = Math.max(0, c.screenShakeT - dt);
    if (c.fovImpactBoost > 0) {
      c.fovImpactBoost *= 0.92;
      if (c.fovImpactBoost < 0.05) c.fovImpactBoost = 0;
    }

    // Apply roll/pitch to shipMesh3
    if (c.shipMesh3) {
      c.shipMesh3.rotation.z = c.shipRoll + c.impactRoll;
      c.shipMesh3.rotation.x = c.shipPitch + c.impactPitch;
      c.shipMesh3.position.y = c.shipHeave;
    }
  }, []);

  // updateNightMode: polar night lighting transition
  const updateNightMode = useCallback((lat) => {
    const c = ctx.current;
    const tgt = lat > 82 ? 1 : 0;
    c.nightFactor += (tgt - c.nightFactor) * 0.005;

    if (c.ambientLight) {
      const tgtA = 0.15 + 0.55 * (1 - c.nightFactor);
      c.ambientLight.intensity += (tgtA - c.ambientLight.intensity) * 0.02;
    }
    if (c.sunLight) {
      const tgtS = 0.3 + 1.1 * (1 - c.nightFactor);
      c.sunLight.intensity += (tgtS - c.sunLight.intensity) * 0.02;
    }
    if (c.scene && c.scene.fog) {
      const nightC = new THREE.Color(0x050d18);
      const dayC = new THREE.Color(0x7a9fb5);
      c.scene.fog.color.lerp(c.nightFactor > 0.5 ? nightC : dayC, 0.02);
    }
  }, []);

  // syncThreeIcebergs: show/hide icebergs based on ice concentration
  const syncThreeIcebergs = useCallback((conc, shipPosVec, headingFn, cachedIceData) => {
    const c = ctx.current;
    const activeCount = Math.floor(conc * MAX_LOCAL_ICEBERGS);

    for (let i = 0; i < c.tIcebergs.length; i++) {
      const ice = c.tIcebergs[i];
      ice.grp.visible = i < activeCount;

      if (ice.grp.visible && shipPosVec) {
        const dx = ice.cx - shipPosVec.x;
        const dz = ice.cz - shipPosVec.z;
        const heading = typeof headingFn === 'function' ? headingFn() : headingFn;
        const dotFwd = dx * Math.sin(heading) + -dz * Math.cos(heading);

        if (dotFwd < -8000 || Math.sqrt(dx * dx + dz * dz) > 25000) {
          const angle = (Math.random() - 0.5) * Math.PI * 0.8;
          const h = heading + angle;
          const spawnDist = rng(8000, 20000);
          ice.cx = shipPosVec.x + Math.sin(h) * spawnDist;
          ice.cz = shipPosVec.z - Math.cos(h) * spawnDist;
          ice.grp.position.set(ice.cx, 0, ice.cz);
        }
      }
    }
  }, []);

  // checkAutoCollisions: iceberg collision detection
  const checkAutoCollisions = useCallback((shipPosVec, collisionOffset) => {
    const c = ctx.current;
    if (!c.shipGroup3) return;
    const SHIP_R = 20;
    const sx = c.shipGroup3.position.x;
    const sz = c.shipGroup3.position.z;
    let minD2 = Infinity;

    for (const ice of c.tIcebergs) {
      if (!ice.grp.visible || !ice.grp.parent) continue;
      const dx = sx - ice.cx;
      const dz = sz - ice.cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < minD2) minD2 = d2;
      const minDist = SHIP_R + (ice.r || 20);
      if (d2 < minDist * minDist && d2 > 0.01) {
        const dist = Math.sqrt(d2);
        const overlap = minDist - dist;
        const nx = dx / dist;
        const nz = dz / dist;
        if (collisionOffset) {
          collisionOffset.x += nx * overlap * 0.85;
          collisionOffset.z += nz * overlap * 0.85;
        }
        ice.cx -= nx * overlap * 0.15;
        ice.cz -= nz * overlap * 0.15;
        ice.grp.position.set(ice.cx, 0, ice.cz);
        if (!c.impactActive) {
          c.impactActive = true;
          c.impactRoll = (Math.random() > 0.5 ? 1 : -1) * 0.26;
          c.impactPitch = -0.14;
          c.screenShakeT = 0.5;
          c.fovImpactBoost = 15;
        }
      }
    }
    c.nearestIceDist = Math.sqrt(minD2);

    if (collisionOffset) {
      c.shipGroup3.position.x = shipPosVec.x + collisionOffset.x;
      c.shipGroup3.position.z = shipPosVec.z + collisionOffset.z;
    }
  }, []);

  // computeFovTarget
  const computeFovTarget = useCallback(
    (currentModeStr, isManual, binocularsActive, shipSpeedVal, shipThrottleVal, fovSliderOverride, fovBaseVal) => {
      const c = ctx.current;
      if (!isManual || currentModeStr !== 'BRIDGE') return 90;
      if (binocularsActive) return 15;
      const kn = Math.abs(shipSpeedVal) * 1.944;
      let fov = fovSliderOverride ? fovBaseVal : fovFromSpeed(kn);
      if (shipThrottleVal < -0.05) fov = Math.min(fov, 80);
      if (c.nearestIceDist < 500) fov += 5;
      fov += c.fovImpactBoost;
      fov -= c.nightFactor * 5;
      return Math.max(15, Math.min(120, fov));
    },
    [],
  );

  // render: single-frame render
  const render = useCallback(() => {
    const { renderer, scene, camera } = ctx.current;
    if (renderer && scene && camera) {
      renderer.render(scene, camera);
    }
  }, []);

  // ── Expose API via ref ────────────────────────────────────────────────────
  useImperativeHandle(
    ref,
    () => ({
      get scene() { return ctx.current.scene; },
      get camera() { return ctx.current.camera; },
      get renderer() { return ctx.current.renderer; },
      get shipPivot() { return ctx.current.shipGroup3; },
      get shipMesh() { return ctx.current.shipMesh3; },
      get cameraPivot() { return ctx.current.cameraPivot3; },
      get tIcebergs() { return ctx.current.tIcebergs; },
      get motionState() {
        const c = ctx.current;
        return {
          shipRoll: c.shipRoll,
          shipPitch: c.shipPitch,
          shipHeave: c.shipHeave,
          impactRoll: c.impactRoll,
          impactPitch: c.impactPitch,
          impactActive: c.impactActive,
          screenShakeT: c.screenShakeT,
          fovImpactBoost: c.fovImpactBoost,
          nightFactor: c.nightFactor,
          nearestIceDist: c.nearestIceDist,
        };
      },
      updateShipPosition,
      animateOcean,
      updateOceanOverlay,
      updateFoam,
      updateShipMotion,
      updateNightMode,
      syncThreeIcebergs,
      checkAutoCollisions,
      computeFovTarget,
      buildIcebergs,
      buildLandMasses,
      updateRealBergs,
      render,
    }),
    [
      updateShipPosition,
      animateOcean,
      updateOceanOverlay,
      updateFoam,
      updateShipMotion,
      updateNightMode,
      syncThreeIcebergs,
      checkAutoCollisions,
      computeFovTarget,
      buildIcebergs,
      buildLandMasses,
      updateRealBergs,
      render,
    ],
  );

  // ── Initialization on mount ───────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setClearColor(0x1a3a5c, 1);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    ctx.current.renderer = renderer;

    // Scene
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x7a9fb5, 0.000085);
    ctx.current.scene = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(
      90,
      window.innerWidth / window.innerHeight,
      0.01,
      500000,
    );
    ctx.current.camera = camera;

    // IBL environment map (arctic sky gradient for iceberg reflections)
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    const cv = Object.assign(document.createElement('canvas'), { width: 64, height: 32 });
    const cvCtx = cv.getContext('2d');
    const g = cvCtx.createLinearGradient(0, 0, 0, 32);
    g.addColorStop(0, '#07101e');
    g.addColorStop(0.38, '#0d2040');
    g.addColorStop(0.5, '#1a4a72');
    g.addColorStop(0.62, '#2a6a90');
    g.addColorStop(1, '#091420');
    cvCtx.fillStyle = g;
    cvCtx.fillRect(0, 0, 64, 32);
    const envTex = new THREE.CanvasTexture(cv);
    envTex.mapping = THREE.EquirectangularReflectionMapping;
    const envRT = pmrem.fromEquirectangular(envTex);
    scene.environment = envRT.texture;
    envTex.dispose();
    pmrem.dispose();

    // Shared iceberg materials (created once)
    ctx.current.iceMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    ctx.current.realBergMat = new THREE.MeshBasicMaterial({ color: 0xFFCC00 });
    ctx.current.subMat = new THREE.MeshBasicMaterial({
      color: 0x224466,
      transparent: true,
      opacity: 0.25,
      depthWrite: false,
    });
    ctx.current.discMat = new THREE.MeshBasicMaterial({
      color: 0x07141e,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    ctx.current.ringMat = new THREE.MeshBasicMaterial({
      color: 0xbad4e4,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    // 카메라 초기 위치 설정 (선박 뒤쪽 위에서 전방을 바라봄)
    camera.position.set(0, 60, 200);
    camera.lookAt(0, 10, -200);

    // Build scene elements
    buildSky();
    buildLighting();
    buildOcean();
    buildIcebergs();
    buildShip();
    buildFoam();
    buildLandMasses(35.1, 129.0); // Initial reference: Busan

    // Resize handler
    const handleResize = () => {
      renderer.setSize(window.innerWidth, window.innerHeight);
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', handleResize);

    canvas.style.cursor = 'grab';

    // Cleanup on unmount
    return () => {
      window.removeEventListener('resize', handleResize);

      // Dispose all tracked geometries and materials
      for (const obj of ctx.current.disposables) {
        if (obj && typeof obj.dispose === 'function') {
          obj.dispose();
        }
      }
      ctx.current.disposables.length = 0;

      // Dispose shared materials
      if (ctx.current.iceMat) ctx.current.iceMat.dispose();
      if (ctx.current.subMat) ctx.current.subMat.dispose();
      if (ctx.current.realBergMat) ctx.current.realBergMat.dispose();
      if (ctx.current.discMat) ctx.current.discMat.dispose();
      if (ctx.current.ringMat) ctx.current.ringMat.dispose();

      // Dispose renderer
      renderer.dispose();

      ctx.current.renderer = null;
      ctx.current.scene = null;
      ctx.current.camera = null;
    };
  }, [buildSky, buildLighting, buildOcean, buildIcebergs, buildShip, buildFoam, buildLandMasses]);

  // ── Update ship position/heading from props ───────────────────────────────
  useEffect(() => {
    if (!shipState || !ctx.current.shipGroup3) return;
    const { lat, lon, heading } = shipState;
    if (lat != null && lon != null && heading != null) {
      // Parent is responsible for converting lat/lon to Three.js world coords
      // and calling updateShipPosition via the ref. This effect just applies
      // the heading for convenience when mode is not BRIDGE.
      if (mode !== 'BRIDGE') {
        const g = ctx.current.shipGroup3;
        let diff = -heading - g.rotation.y;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        g.rotation.y += diff * 0.05;
      }
    }
  }, [shipState, mode]);

  // ── Adjust camera for different modes ─────────────────────────────────────
  useEffect(() => {
    const { camera, shipGroup3 } = ctx.current;
    if (!camera) return;

    if (mode === 'BRIDGE') {
      // 선교 1인칭: 브릿지 높이에서 뱃머리(-z) 방향을 봄
      camera.fov = 90;
      camera.near = 0.01;
      camera.position.set(0, 35, 10);
      camera.lookAt(0, 15, -500);
      camera.updateProjectionMatrix();
    } else if (mode === 'FOLLOW') {
      // 선미 추적: 선미 뒤(+z) 위에서 뱃머리(-z) 방향을 봄
      camera.fov = 75;
      camera.near = 0.1;
      camera.position.set(0, 80, 300);
      camera.lookAt(0, 10, -100);
      camera.updateProjectionMatrix();
    }
  }, [mode]);

  // ── 자체 렌더 루프: visible일 때만 실행 ────────────────────────────────
  useEffect(() => {
    if (!visible) return;
    let rafId;
    function loop(now) {
      rafId = requestAnimationFrame(loop);
      const { renderer, scene, camera } = ctx.current;
      if (!renderer || !scene || !camera) return;
      try {
        const t = now * 0.001;
        animateOcean(t);
        renderer.render(scene, camera);
      } catch (e) { /* ignore */ }
    }
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [visible, animateOcean]);

  // ── Render ────────────────────────────────────────────────────────────────
  const isVisible = visible === true;

  return (
    <div
      ref={wrapRef}
      id="three-wrap"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        zIndex: 2,
        opacity: isVisible ? 1 : 0,
        pointerEvents: isVisible ? 'auto' : 'none',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '100%' }}
      />
    </div>
  );
});

ThreeOverlay.displayName = 'ThreeOverlay';

export default ThreeOverlay;
