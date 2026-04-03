import React, { useRef, useEffect, useImperativeHandle, forwardRef, useCallback } from 'react';
import * as THREE from 'three';
// 테스트 주석
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
const SHIP_BASE_Y = 5; // 선체 기본 수선 높이 (수면 위로 올리기)

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

// NSIDC 팔레트 색상 스톱 — 연속 그라데이션 보간
const ICE_STOPS = [
  { at: 0.00, r:  13, g:  79, b: 139 },  // 바다
  { at: 0.15, r:  13, g:  79, b: 139 },  // 바다
  { at: 0.20, r: 106, g:  13, b: 173 },  // 보라
  { at: 0.30, r:   0, g:   0, b: 255 },  // 파랑
  { at: 0.45, r:   0, g: 204, b:   0 },  // 초록
  { at: 0.60, r: 255, g: 255, b:   0 },  // 노랑
  { at: 0.72, r: 255, g: 136, b:   0 },  // 주황
  { at: 0.85, r: 255, g:   0, b:   0 },  // 빨강
  { at: 1.00, r: 255, g: 105, b: 180 },  // 분홍
];

function iceToRGB(conc) {
  const c = Math.max(0, Math.min(1, conc));
  for (let i = 0; i < ICE_STOPS.length - 1; i++) {
    const a = ICE_STOPS[i], b = ICE_STOPS[i + 1];
    if (c <= b.at) {
      const t = (b.at - a.at) > 0 ? (c - a.at) / (b.at - a.at) : 0;
      return [
        (a.r + (b.r - a.r) * t) / 255,
        (a.g + (b.g - a.g) * t) / 255,
        (a.b + (b.b - a.b) * t) / 255,
      ];
    }
  }
  const last = ICE_STOPS[ICE_STOPS.length - 1];
  return [last.r / 255, last.g / 255, last.b / 255];
}

// 해빙 두께 색상 (Copernicus 팔레트: 남색→보라→연보라→흰)
function thicknessToRGB(thickM) {
  if (thickM < 0.1) return [13 / 255, 79 / 255, 139 / 255]; // 바다
  const t = Math.min(1, thickM / 5);
  const r = 30 + t * 225;
  const g = 27 + t * 180;
  const b = 75 + t * 180;
  return [r / 255, g / 255, b / 255];
}

// 해빙 경계선 색상 — 전체 주황 계열 그라데이션
function edgeToRGB(conc) {
  if (conc < 0.05) return [13 / 255, 79 / 255, 139 / 255]; // 바다
  const t = Math.min(1, (conc - 0.05) / 0.95);
  // 어두운 주황 → 밝은 주황 → 흰주황
  return [0.8 + t * 0.2, 0.3 + t * 0.5, t * 0.3];
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
    shipUpper3: null,
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
    const waveGeo = trackDisposable(new THREE.PlaneGeometry(80000, 80000, 128, 128));
    waveGeo.rotateX(-Math.PI / 2);
    const mat = trackDisposable(
      new THREE.MeshPhongMaterial({
        color: 0x0d4f8b,
        specular: 0x4a8aaa,
        shininess: 80,
        transparent: false,
        opacity: 1.0,
        vertexColors: true,
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
    const shipUpper3 = new THREE.Group(); // 상부구조 — BRIDGE 모드에서 숨김
    const cameraPivot3 = new THREE.Object3D();

    // 선체 파트를 shipMesh3에 직접 추가 (BRIDGE 모드에서도 표시)
    const mkH = (geo, mat, px, py, pz, rx = 0, ry = 0) => {
      trackDisposable(geo);
      trackDisposable(mat);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(px, py, pz);
      m.rotation.x = rx;
      m.rotation.y = ry;
      m.castShadow = true;
      m.receiveShadow = true;
      shipMesh3.add(m);
    };
    // 상부구조 파트를 shipUpper3에 추가 (BRIDGE 모드에서 숨김)
    const mkU = (geo, mat, px, py, pz, rx = 0, ry = 0) => {
      trackDisposable(geo);
      trackDisposable(mat);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(px, py, pz);
      m.rotation.x = rx;
      m.rotation.y = ry;
      m.castShadow = true;
      m.receiveShadow = true;
      shipUpper3.add(m);
    };

    // ── 색상 팔레트 (PKX-B 스타일 초계함) ──────────────────────────────────
    const C = {
      hull:    new THREE.MeshPhongMaterial({ color: 0x4a5c6a }),
      hullDk:  new THREE.MeshPhongMaterial({ color: 0x38484f }),
      red:     new THREE.MeshPhongMaterial({ color: 0x8b1a14 }),
      deck:    new THREE.MeshPhongMaterial({ color: 0x3c4d58 }),
      super1:  new THREE.MeshPhongMaterial({ color: 0x5c6d7a }),
      super2:  new THREE.MeshPhongMaterial({ color: 0x6a7b88 }),
      bridge:  new THREE.MeshPhongMaterial({ color: 0x727f8c }),
      window:  new THREE.MeshPhongMaterial({ color: 0x1a2430 }),
      dark:    new THREE.MeshPhongMaterial({ color: 0x252f38 }),
      black:   new THREE.MeshPhongMaterial({ color: 0x111111 }),
      gun:     new THREE.MeshPhongMaterial({ color: 0x4f5e6b }),
      white:   new THREE.MeshPhongMaterial({ color: 0xddddcc }),
    };
    Object.values(C).forEach(m => trackDisposable(m));

    // ── 선체 (HULL) — BRIDGE에서도 보임 ────────────────────────────────────
    // 주 선체
    mkH(new THREE.BoxGeometry(28, 9, 182), C.hull, 0, 0, 0);
    // 흘수선 아래 적갈색
    mkH(new THREE.BoxGeometry(29, 4, 182), C.red, 0, -5.5, 0);
    // 선저 킬
    mkH(new THREE.BoxGeometry(10, 1.5, 184), C.hullDk, 0, -8, 0);
    // 선수 (날카로운 bow — 4면 피라미드)
    mkH(new THREE.CylinderGeometry(0, 14, 28, 4), C.hullDk, 0, 0, -105, 0, Math.PI / 4);
    // 선수 하부 빨간 피라미드
    mkH(new THREE.CylinderGeometry(0, 14, 28, 4), C.red, 0, -5, -105, 0, Math.PI / 4);
    // 메인 갑판
    mkH(new THREE.BoxGeometry(28, 1.5, 182), C.deck, 0, 5, 0);
    // 함수 갑판 (elevated forward deck)
    mkH(new THREE.BoxGeometry(22, 1, 55), C.deck, 0, 6.8, -59);
    // 함수 갑판 측면 bulwark (좌)
    mkH(new THREE.BoxGeometry(1, 3, 55), C.hull, -11, 7.5, -59);
    // 함수 갑판 측면 bulwark (우)
    mkH(new THREE.BoxGeometry(1, 3, 55), C.hull, 11, 7.5, -59);
    // 함포 포탑 베이스 (Bofors 40mm 스타일)
    mkH(new THREE.CylinderGeometry(4.8, 5.5, 4, 12), C.gun, 0, 9, -68);
    // 함포 방패 (angular shield)
    mkH(new THREE.BoxGeometry(7, 5.5, 8), C.gun, 0, 12, -67);
    // 포신
    mkH(new THREE.CylinderGeometry(0.65, 0.9, 24, 6), C.dark, 0, 13, -80, -Math.PI / 2);
    // 선미 헬기 갑판
    mkH(new THREE.BoxGeometry(26, 1, 42), C.deck, 0, 9, 79);
    // 헬기 갑판 H 마킹 (가로)
    mkH(new THREE.BoxGeometry(18, 0.3, 1), C.white, 0, 9.8, 79);
    // 헬기 갑판 H 마킹 (세로)
    mkH(new THREE.BoxGeometry(1, 0.3, 18), C.white, 0, 9.8, 79);
    // 선미 transom
    mkH(new THREE.BoxGeometry(28, 9, 2), C.hullDk, 0, 0, 92);

    // ── 상부구조 (UPPER) — BRIDGE에서 숨김 ─────────────────────────────────
    // 1단 상부구조 (하부)
    mkU(new THREE.BoxGeometry(22, 12, 72), C.super1, 0, 11, 12);
    // 1단 상부구조 앞 경사면 (트랩 모양)
    mkU(new THREE.BoxGeometry(21, 12, 6), C.super1, 0, 11, -25);
    // 2단 (mid level)
    mkU(new THREE.BoxGeometry(20, 8, 46), C.super2, 0, 21, 8);
    // 3단 브릿지 블록
    mkU(new THREE.BoxGeometry(19, 7, 32), C.bridge, 0, 27, 3);
    // 브릿지 창문 띠 (어두운 유리)
    mkU(new THREE.BoxGeometry(18.5, 3, 30), C.window, 0, 26.5, -10);
    // 브릿지 최상단
    mkU(new THREE.BoxGeometry(17, 3.5, 28), C.bridge, 0, 31.5, 2);
    // 연돌 (angled funnel)
    mkU(new THREE.CylinderGeometry(1.5, 3, 12, 8), C.black, 0, 28, 20);
    // 연돌 연기 가이드
    mkU(new THREE.BoxGeometry(5, 2, 3), C.dark, 0, 34, 20);
    // 메인 마스트 폴
    mkU(new THREE.CylinderGeometry(0.7, 0.9, 32, 6), C.dark, 0, 38, 7);
    // 마스트 A-프레임 지지대 (좌)
    {
      const ag = trackDisposable(new THREE.CylinderGeometry(0.4, 0.4, 16, 4));
      const am = new THREE.Mesh(ag, C.dark);
      am.position.set(-6, 28, 7); am.rotation.z = 0.5;
      shipUpper3.add(am);
    }
    // 마스트 A-프레임 지지대 (우)
    {
      const ag = trackDisposable(new THREE.CylinderGeometry(0.4, 0.4, 16, 4));
      const am = new THREE.Mesh(ag, C.dark);
      am.position.set(6, 28, 7); am.rotation.z = -0.5;
      shipUpper3.add(am);
    }
    // 레이더 플랫폼 1
    mkU(new THREE.BoxGeometry(14, 1.5, 12), C.dark, 0, 55, 7);
    // 위상배열 레이더 (flat phased array — 앞면)
    mkU(new THREE.BoxGeometry(15, 11, 1.5), C.dark, 0, 54, 1);
    // 위상배열 레이더 (뒷면)
    mkU(new THREE.BoxGeometry(15, 11, 1.5), C.dark, 0, 54, 13);
    // 위상배열 레이더 (좌)
    mkU(new THREE.BoxGeometry(1.5, 11, 12), C.dark, -7.5, 54, 7);
    // 위상배열 레이더 (우)
    mkU(new THREE.BoxGeometry(1.5, 11, 12), C.dark, 7.5, 54, 7);
    // 회전 레이더 (SPS 스타일)
    mkU(new THREE.BoxGeometry(14, 2, 3), C.dark, 0, 62, 7);
    mkU(new THREE.CylinderGeometry(0.4, 0.4, 4, 4), C.dark, 0, 60, 7);
    // 화력통제 레이더 구 (STIR 스타일)
    mkU(new THREE.SphereGeometry(3, 10, 8), C.super1, 0, 44, -6);
    mkU(new THREE.CylinderGeometry(0.8, 0.8, 6, 6), C.dark, 0, 40, -6);
    // 측면 함대함 미사일 런처 (좌)
    mkU(new THREE.BoxGeometry(5, 4.5, 11), C.gun, -14, 11, 18);
    mkU(new THREE.BoxGeometry(4.5, 1, 10), C.dark, -14, 13.5, 18);
    // 측면 함대함 미사일 런처 (우)
    mkU(new THREE.BoxGeometry(5, 4.5, 11), C.gun, 14, 11, 18);
    mkU(new THREE.BoxGeometry(4.5, 1, 10), C.dark, 14, 13.5, 18);
    // 후방 CIWS / 소형 포 (선미 갑판)
    mkU(new THREE.CylinderGeometry(3, 3.5, 3, 10), C.gun, 0, 12, 60);
    mkU(new THREE.BoxGeometry(5, 4, 5), C.gun, 0, 14.5, 60);
    mkU(new THREE.CylinderGeometry(0.5, 0.7, 14, 6), C.dark, 0, 16, 55, -Math.PI / 2);

    shipMesh3.scale.set(1.4, 1.4, 1.4); // 선박 전체 스케일 업 (웅장함)
    shipMesh3.position.y = SHIP_BASE_Y;
    shipMesh3.add(shipUpper3);
    shipGroup3.add(shipMesh3);
    shipGroup3.add(cameraPivot3);
    scene.add(shipGroup3);

    ctx.current.shipGroup3 = shipGroup3;
    ctx.current.shipMesh3 = shipMesh3;
    ctx.current.shipUpper3 = shipUpper3;
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

  // updateOceanOverlay: DataTexture 방식 — GPU 선형 필터로 부드러운 그라데이션
  const ICE_TEX_SIZE = 256;

  const updateOceanOverlay = useCallback((colorMode, shipLon, shipLat, sampleIceConcentrationFn) => {
    const { waveGeo, waveMesh } = ctx.current;
    if (!waveMesh || !waveGeo) return;

    const modeChanged = ctx.current.oceanColorMode !== colorMode;
    ctx.current.oceanColorMode = colorMode;
    ctx.current.overlayFrame++;
    if (!modeChanged && ctx.current.overlayFrame % 120 !== 0) return;

    console.log('[OceanOverlay]', colorMode, 'lat:', shipLat?.toFixed(1), 'lon:', shipLon?.toFixed(1));

    const mat = waveMesh.material;
    if (!mat) return;

    // ── none 모드: 텍스처 제거, 원래 바다색 복원 ──
    if (colorMode === 'none') {
      mat.map = null;
      mat.vertexColors = false;
      mat.color.setHex(0x0d4f8b);
      mat.needsUpdate = true;
      return;
    }

    // ── ice/depth 모드: DataTexture 생성 또는 재사용 ──
    if (!ctx.current.iceTexData) {
      ctx.current.iceTexData = new Uint8Array(ICE_TEX_SIZE * ICE_TEX_SIZE * 4);
      ctx.current.iceTex = new THREE.DataTexture(
        ctx.current.iceTexData, ICE_TEX_SIZE, ICE_TEX_SIZE,
      );
      ctx.current.iceTex.magFilter = THREE.LinearFilter;
      ctx.current.iceTex.minFilter = THREE.LinearFilter;
      ctx.current.iceTex.wrapS = THREE.ClampToEdgeWrapping;
      ctx.current.iceTex.wrapT = THREE.ClampToEdgeWrapping;
    }

    const data = ctx.current.iceTexData;
    const tex = ctx.current.iceTex;
    const metersPerDeg = 111320;
    const cosLat = Math.cos((shipLat * Math.PI) / 180);
    // 바다 메시 크기 80000 × 80000, 스케일 1.5
    const halfSize = 40000;

    for (let ty = 0; ty < ICE_TEX_SIZE; ty++) {
      for (let tx = 0; tx < ICE_TEX_SIZE; tx++) {
        // 텍셀 → 로컬 좌표 → 위경도
        const localX = (tx / (ICE_TEX_SIZE - 1) - 0.5) * 2 * halfSize;
        const localZ = (ty / (ICE_TEX_SIZE - 1) - 0.5) * 2 * halfSize;
        const vLon = shipLon + (localX * 1.5) / (metersPerDeg * cosLat);
        const vLat = shipLat - (localZ * 1.5) / metersPerDeg;

        let rgb;
        const conc = sampleIceConcentrationFn ? sampleIceConcentrationFn(vLon, vLat) : 0;
        if (colorMode === 'ice') {
          rgb = iceToRGB(conc || 0);
        } else if (colorMode === 'thickness') {
          // 해빙 두께 추정: 농도 기반 (실데이터 없을 때 농도×5m으로 근사)
          const thickM = (conc || 0) * 5.0;
          rgb = thicknessToRGB(thickM);
        } else if (colorMode === 'edge') {
          rgb = edgeToRGB(conc || 0);
        } else {
          rgb = depthToRGB(estimateBathymetry(vLon, vLat));
        }

        const idx = (ty * ICE_TEX_SIZE + tx) * 4;
        data[idx]     = Math.round(rgb[0] * 255);
        data[idx + 1] = Math.round(rgb[1] * 255);
        data[idx + 2] = Math.round(rgb[2] * 255);
        data[idx + 3] = 255;
      }
    }

    tex.needsUpdate = true;
    mat.map = tex;
    mat.vertexColors = false;
    mat.color.setHex(0xffffff);
    mat.needsUpdate = true;
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
      c.shipMesh3.position.y = SHIP_BASE_Y + c.shipHeave;
    }
  }, []);

  // BRIDGE 모드에서 상부구조 숨기기 (선체/선수는 그대로 표시)
  useEffect(() => {
    if (ctx.current.shipUpper3) {
      ctx.current.shipUpper3.visible = mode !== 'BRIDGE';
    }
  }, [mode]);

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
      // 위도 기반 빙산 표시 — 60°N 이상에서만 빙산 보임
      const showIce = lat >= 60;
      for (const ice of ctx.current.tIcebergs) {
        ice.grp.visible = showIce;
      }
      for (const berg of ctx.current.realBergs) {
        if (berg.grp) berg.grp.visible = showIce;
      }
    }
  }, [shipState, mode]);

  // ── FOLLOW 줌 상태 (스크롤) ──────────────────────────────────────────────
  const followZoomTargetRef = useRef(220);
  const followZoomCurrentRef = useRef(220);

  useEffect(() => {
    function handleWheel(e) {
      if (mode !== 'FOLLOW') return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? 50 : -50;
      followZoomTargetRef.current = Math.max(60, Math.min(2000, followZoomTargetRef.current + delta));
    }
    const el = wrapRef.current;
    if (el) el.addEventListener('wheel', handleWheel, { passive: false });
    return () => { if (el) el.removeEventListener('wheel', handleWheel); };
  }, [mode]);

  // ── FOLLOW 오빗 상태 (드래그 회전) ────────────────────────────────────────
  const orbitRef = useRef({ yaw: 0, pitch: 0.06, dragging: false, lastX: 0, lastY: 0 });

  useEffect(() => {
    if (mode !== 'FOLLOW') return;
    const el = wrapRef.current;
    if (!el) return;
    const orbit = orbitRef.current;

    const onDown = (e) => {
      orbit.dragging = true;
      orbit.lastX = e.clientX;
      orbit.lastY = e.clientY;
      el.style.cursor = 'grabbing';
    };
    const onMove = (e) => {
      if (!orbit.dragging) return;
      const dx = e.clientX - orbit.lastX;
      const dy = e.clientY - orbit.lastY;
      orbit.yaw   -= dx * 0.006;
      orbit.pitch  = Math.max(-0.05, Math.min(0.9, orbit.pitch - dy * 0.004));
      orbit.lastX = e.clientX;
      orbit.lastY = e.clientY;
    };
    const onUp = () => {
      orbit.dragging = false;
      el.style.cursor = 'grab';
    };

    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      orbit.yaw = 0;
      orbit.pitch = 0.06;
      orbit.dragging = false;
    };
  }, [mode]);

  // ── Adjust camera for different modes ─────────────────────────────────────
  useEffect(() => {
    const { camera } = ctx.current;
    if (!camera) return;
    if (mode === 'BRIDGE') {
      camera.fov = 90;
      camera.near = 0.01;
      camera.position.set(0, 35, 10);
      camera.lookAt(0, 15, -500);
      camera.updateProjectionMatrix();
    } else if (mode === 'FOLLOW') {
      followZoomTargetRef.current = 220;
      followZoomCurrentRef.current = 220;
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
      const { renderer, scene, camera, shipGroup3 } = ctx.current;
      if (!renderer || !scene || !camera) return;
      try {
        const t = now * 0.001;
        animateOcean(t);

        // 배 heading 부드러운 보간 (FOLLOW/자동 모드)
        if (shipGroup3 && shipState) {
          const headingRad = -(shipState.heading || 0) * Math.PI / 180;
          let diff = headingRad - shipGroup3.rotation.y;
          while (diff < -Math.PI) diff += Math.PI * 2;
          while (diff > Math.PI) diff -= Math.PI * 2;
          shipGroup3.rotation.y += diff * 0.03;
        }

        // BRIDGE 카메라 — 선박 위치/방향에 맞춰 매 프레임 갱신
        if (mode === 'BRIDGE' && camera && shipGroup3) {
          const pos = shipGroup3.position;
          const ry = shipGroup3.rotation.y;
          // 로컬 브릿지 위치 (0, 35, 10) → 월드 좌표
          const bx = pos.x + 10 * Math.sin(ry);
          const bz = pos.z + 10 * Math.cos(ry);
          // 1.4× 스케일 기준 브릿지 높이 ≈ SHIP_BASE_Y + 27*1.4 ≈ 43
          camera.position.set(bx, pos.y + SHIP_BASE_Y + 38, bz);
          // 선수 방향을 수평으로 바라봄
          camera.lookAt(
            pos.x - Math.sin(ry) * 500,
            pos.y + SHIP_BASE_Y + 18,
            pos.z - Math.cos(ry) * 500,
          );
        }

        // FOLLOW 카메라 — 오빗 드래그 + 부드러운 줌
        if (mode === 'FOLLOW' && camera && shipGroup3) {
          followZoomCurrentRef.current += (followZoomTargetRef.current - followZoomCurrentRef.current) * 0.06;
          const dist = followZoomCurrentRef.current;
          const shipPos = shipGroup3.position;
          const ry = shipGroup3.rotation.y; // 선박 회전각
          const orbit = orbitRef.current;

          // 선미 기준 월드 각도 + 오빗 yaw 오프셋
          const angle = Math.PI / 2 + ry + orbit.yaw;
          const pitch = orbit.pitch; // 0=수평, 양수=위

          const camX = shipPos.x + Math.cos(angle) * dist * Math.cos(pitch);
          const camZ = shipPos.z + Math.sin(angle) * dist * Math.cos(pitch);
          // 수평에 가까운 낮은 카메라 높이 — 선박이 수면 위로 우뚝 서 보이도록
          const camY = shipPos.y + SHIP_BASE_Y + dist * 0.04 + 8 + Math.sin(pitch) * dist * 0.5;

          camera.position.set(camX, Math.max(SHIP_BASE_Y + 2, camY), camZ);
          // 선박 중간 높이(상부구조 하단)를 바라봄
          camera.lookAt(shipPos.x, shipPos.y + SHIP_BASE_Y * 1.4 + 20, shipPos.z);

          const pitchLerp = Math.min(1, dist / 1500);
          camera.fov = 75 - pitchLerp * 20;
          camera.updateProjectionMatrix();
        }

        renderer.render(scene, camera);
      } catch (e) { /* ignore */ }
    }
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [visible, animateOcean, mode, shipState]);

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
