import React, {
  useRef,
  useEffect,
  useImperativeHandle,
  forwardRef,
  useCallback,
} from 'react';
import * as THREE from 'three';
// 테스트 주석
// ── Constants ────────────────────────────────────────────────────────────────
const MOUSE_SENS = 0.0004;
const MAX_ROT = 0.03;
const ZOOM_MIN = 300;
const ZOOM_MAX = 5000;

const BASE_GM = 3.2;
const BASE_OMEGA_R = 0.176;
const BASE_OMEGA_P = 0.21;

const METERS_PER_DEGREE_LAT = 111132.954;
const METERS_PER_DEGREE_LON_AT_EQUATOR = 111319.491;

const FOAM_COUNT = 60;
const MAX_LOCAL_ICEBERGS = 180;
const SHIP_BASE_Y = 5; // 선체 기본 수선 높이 (수면 위로 올리기)

// //! [Original Code] 기존 빙산 종류별 크기 (높이가 비현실적으로 높게 설정됨)
// const ICE_TYPES = [
//   { name: 'tabular', prob: 0.08, w: [400, 900], d: [350, 800], h: [120, 250], subRatio: 5 },
//   { name: 'large',   prob: 0.12, w: [200, 500], d: [180, 450], h: [400, 800], subRatio: 6 },
//   { name: 'medium',  prob: 0.30, w: [80, 200],  d: [70, 180],  h: [180, 400], subRatio: 7 },
//   { name: 'small',   prob: 0.35, w: [25, 80],   d: [22, 70],   h: [60, 160],  subRatio: 5 },
//   { name: 'growler', prob: 0.15, w: [6, 25],    d: [5, 22],    h: [15, 50],   subRatio: 4 },
// ];

// //* [Modified Code] 현실적인 스케일에 맞춘 빙상 스케일 및 무작위성 부여(난수 분산)
const ICE_TYPES = [
  {
    name: 'tabular',
    prob: 0.1,
    w: [400, 900],
    d: [300, 800],
    h: [40, 80],
    subRatio: 5,
  },
  {
    name: 'large',
    prob: 0.15,
    w: [200, 450],
    d: [150, 400],
    h: [60, 140],
    subRatio: 6,
  },
  {
    name: 'medium',
    prob: 0.25,
    w: [80, 200],
    d: [60, 180],
    h: [25, 60],
    subRatio: 7,
  },
  {
    name: 'small',
    prob: 0.35,
    w: [25, 80],
    d: [20, 60],
    h: [10, 25],
    subRatio: 5,
  },
  {
    name: 'growler',
    prob: 0.15,
    w: [6, 25],
    d: [5, 20],
    h: [2, 8],
    subRatio: 4,
  },
];

// ── Utility ──────────────────────────────────────────────────────────────────
function rng(a, b) {
  return a + Math.random() * (b - a);
}

function pickType() {
  let r = Math.random(),
    cum = 0;
  for (const t of ICE_TYPES) {
    cum += t.prob;
    if (r < cum) return t;
  }
  return ICE_TYPES[ICE_TYPES.length - 1];
}

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
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
    r = 255;
    g = 51 + t * 119;
    b = 0;
  } else if (d < 200) {
    const t = (d - 50) / 150;
    r = 255 - t * 51;
    g = 170 + t * 85;
    b = 0;
  } else if (d < 1000) {
    const t = (d - 200) / 800;
    r = 204 - t * 204;
    g = 255 - t * 51;
    b = t * 102;
  } else if (d < 2000) {
    const t = (d - 1000) / 1000;
    r = 0;
    g = 204 - t * 51;
    b = 102 + t * 153;
  } else if (d < 4000) {
    const t = (d - 2000) / 2000;
    r = 0;
    g = 153 - t * 153;
    b = 255;
  } else {
    const t = Math.min(1, (d - 4000) / 2000);
    r = t * 102;
    g = 0;
    b = 255 - t * 51;
  }
  return [r / 255, g / 255, b / 255];
}

// 자연색 해빙 팔레트 — 위성사진 스타일 (흰색 얼음, 투명 바다)
function naturalIceRGBA(conc) {
  if (conc < 0.15) {
    // 15% 미만 → 완전 투명 (아래 Cesium 위성영상 노출)
    return [0, 0, 0, 0];
  }
  // 15%~100% → 반투명 회백색 → 불투명 순백
  const t = (conc - 0.15) / 0.85; // 0.0 ~ 1.0 정규화
  const alpha = Math.round((0.4 + t * 0.6) * 255); // 102 ~ 255
  const brightness = Math.round(200 + t * 55); // 200 ~ 255
  return [brightness, brightness, brightness, alpha];
}

// iceToRGB 호환 래퍼 (thickness/edge 모드 fallback용)
function iceToRGB(conc) {
  const [r, g, b] = naturalIceRGBA(Math.max(0, Math.min(1, conc)));
  return [r / 255, g / 255, b / 255];
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
  if (lat > 50)
    return { Hs: 2.8, Tp: 12, label: 'arctic open ocean - high waves' };
  return { Hs: 1.8, Tp: 9, label: 'coastal waters' };
}

function fovFromSpeed(kn) {
  if (kn <= 0) return 85;
  if (kn <= 8) return 85 + (kn / 8) * 3;
  if (kn <= 15) return 88 + ((kn - 8) / 7) * 4;
  if (kn <= 20) return 92 + ((kn - 15) / 5) * 5;
  return Math.min(103, 97 + (kn - 20) * 0.6);
}

// ── 3D value noise (hash-based) ─────────────────────────────────────────────
function hash3(ix, iy, iz) {
  let h = ix * 374761393 + iy * 668265263 + iz * 1274126177;
  h = (h ^ (h >> 13)) * 1103515245;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function noise3D(x, y, z) {
  const ix = Math.floor(x),
    iy = Math.floor(y),
    iz = Math.floor(z);
  const fx = smoothstep(x - ix),
    fy = smoothstep(y - iy),
    fz = smoothstep(z - iz);
  return lerp(
    lerp(
      lerp(hash3(ix, iy, iz), hash3(ix + 1, iy, iz), fx),
      lerp(hash3(ix, iy + 1, iz), hash3(ix + 1, iy + 1, iz), fx),
      fy,
    ),
    lerp(
      lerp(hash3(ix, iy, iz + 1), hash3(ix + 1, iy, iz + 1), fx),
      lerp(hash3(ix, iy + 1, iz + 1), hash3(ix + 1, iy + 1, iz + 1), fx),
      fy,
    ),
    fz,
  );
}

// 다중 옥타브 fBm 노이즈 — 자연스러운 불규칙 표면 생성
function fbm3D(x, y, z, octaves) {
  let val = 0,
    amp = 1,
    freq = 1,
    total = 0;
  for (let o = 0; o < octaves; o++) {
    val += noise3D(x * freq, y * freq, z * freq) * amp;
    total += amp;
    amp *= 0.45;
    freq *= 2.2;
  }
  return val / total;
}

// ── Iceberg geometry builder ─────────────────────────────────────────────────
function makeIceGeo(typeName, w, h, d) {
  // 세그먼트 — 불규칙 표면을 표현하려면 충분한 해상도 필요
  let wSegs, hSegs;
  switch (typeName) {
    case 'tabular':
      wSegs = 20;
      hSegs = 10;
      break;
    case 'large':
      wSegs = 18;
      hSegs = 14;
      break;
    case 'growler':
      wSegs = 12;
      hSegs = 8;
      break;
    default:
      wSegs = 16;
      hSegs = 12;
      break; // medium, small
  }

  const g = new THREE.SphereGeometry(1, wSegs, hSegs);
  const pos = g.attributes.position;

  // 시드 기반 난수 — 빙하마다 고유한 오프셋으로 완전히 다른 형태
  const rand = mulberry32(((w * 7.13 + h * 13.37 + d * 19.91) * 1000) | 0);

  // ── 난수로 프로파일 파라미터 자체를 생성 (정형화 제거) ──
  const peakT = 0.15 + rand() * 0.3; // 최대 폭 높이 (0.15~0.45)
  const topTaper = 0.3 + rand() * 0.5; // 상단 좁아지는 정도 (0.3~0.8)
  const topPow = 1.0 + rand() * 1.5; // 상단 커브 지수 (1.0~2.5)
  const baseWidth = 0.4 + rand() * 0.5; // 바닥 폭 비율 (0.4~0.9)
  const asymX = (rand() - 0.5) * 0.4; // 좌우 비대칭 (-0.2~0.2)
  const asymZ = (rand() - 0.5) * 0.4; // 전후 비대칭
  const flatTop = typeName === 'tabular' ? 0.7 + rand() * 0.25 : rand() * 0.15;
  const warpAmt = 0.08 + rand() * 0.2; // 대규모 뒤틀림 강도
  const noiseScale = 1.5 + rand() * 3.0; // 노이즈 주파수
  // //! [Original Code] 노이즈 강도 설정 (비교적 밋밋한 표면)
  // const noiseAmt  = 0.08 + rand() * 0.18;         // 노이즈 강도

  // //* [Modified Code] 지형 노이즈를 강하게 주어 빙하 표면이 울퉁불퉁하도록 상향 조정
  const noiseAmt = 0.2 + rand() * 0.35; // 노이즈 강도 대폭 상향

  // 빙하별 고유 3D 노이즈 오프셋 (같은 함수여도 완전 다른 결과)
  const ox = rand() * 100,
    oy = rand() * 100,
    oz = rand() * 100;

  // 랜덤 돌기/능선 최대 4개
  const bumpCount = Math.floor(rand() * 4) + 1;
  const bumps = [];
  for (let b = 0; b < bumpCount; b++) {
    bumps.push({
      angle: rand() * Math.PI * 2,
      tCenter: 0.3 + rand() * 0.5,
      width: 0.15 + rand() * 0.3,
      height: 0.05 + rand() * 0.2,
    });
  }

  // 능선 (길게 이어지는 돌출)
  const ridgeCount = Math.floor(rand() * 3);
  const ridges = [];
  for (let r = 0; r < ridgeCount; r++) {
    ridges.push({
      angle: rand() * Math.PI * 2,
      spread: 0.2 + rand() * 0.5,
      strength: 0.06 + rand() * 0.15,
    });
  }

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);

    // t = 정규화 높이 [0=바닥, 1=꼭대기]
    const t = y * 0.5 + 0.5;
    // 정점의 수평 각도
    const theta = Math.atan2(z, x);

    // ── 1) 난수 기반 프로파일 (매 빙하마다 다른 실루엣) ──
    let rProfile;
    if (t < 0.05) {
      rProfile = baseWidth * (t / 0.05); // 바닥 끝 수렴
    } else if (t < peakT) {
      // 바닥 → 최대폭 구간
      const s = (t - 0.05) / (peakT - 0.05);
      rProfile = baseWidth + (1.0 - baseWidth) * smoothstep(s);
    } else if (flatTop > 0.3 && t > 1.0 - flatTop * 0.3) {
      // 평평한 상단 (tabular에서 강하게, 나머지는 약하게)
      const edge = 1.0 - flatTop * 0.3;
      const s = (t - edge) / (1.0 - edge);
      rProfile =
        (1.0 - topTaper * Math.pow((edge - peakT) / (1.0 - peakT), topPow)) *
        (1.0 - s * 0.15);
    } else {
      // 최대폭 → 상단 테이퍼
      const s = (t - peakT) / (1.0 - peakT);
      rProfile = 1.0 - topTaper * Math.pow(s, topPow);
    }
    rProfile = Math.max(0.02, rProfile);

    // ── 2) 방향별 비대칭 (한쪽이 더 넓거나 좁음) ──
    const asymFactor = 1.0 + asymX * Math.cos(theta) + asymZ * Math.sin(theta);

    // ── 3) 대규모 뒤틀림 (저주파 변형) ──
    const warp = fbm3D(x * 2.0 + ox, y * 2.0 + oy, z * 2.0 + oz, 2) * 2.0 - 1.0;

    // ── 4) 다중 옥타브 표면 노이즈 (미세한 불규칙) ──
    const surfNoise =
      fbm3D(
        x * noiseScale + ox + 50,
        y * noiseScale + oy + 50,
        z * noiseScale + oz + 50,
        4,
      ) *
        2.0 -
      1.0;

    // ── 5) 돌기 (bumps) ──
    let bumpVal = 0;
    for (const bump of bumps) {
      let angleDiff = Math.abs(theta - bump.angle);
      if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
      const angFalloff = Math.exp(-angleDiff * angleDiff * 4);
      const tDiff = (t - bump.tCenter) / bump.width;
      const tFalloff = Math.exp(-tDiff * tDiff * 2);
      bumpVal += bump.height * angFalloff * tFalloff;
    }

    // ── 6) 능선 (ridges) ──
    let ridgeVal = 0;
    for (const ridge of ridges) {
      let angleDiff = Math.abs(theta - ridge.angle);
      if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
      const falloff = Math.exp(
        (-angleDiff * angleDiff) / (ridge.spread * ridge.spread),
      );
      ridgeVal +=
        ridge.strength * falloff * (0.5 + 0.5 * Math.sin(t * Math.PI));
    }

    // ── 최종 반경 합산 ──
    const rFinal =
      rProfile * asymFactor +
      warp * warpAmt +
      surfNoise * noiseAmt +
      bumpVal +
      ridgeVal;

    // XZ 평면 적용
    const r0 = Math.sqrt(x * x + z * z) || 0.001;
    x = (x / r0) * Math.max(0.01, rFinal) * (w * 0.5);
    z = (z / r0) * Math.max(0.01, rFinal) * (d * 0.5);

    // Y 스케일링
    y = y * h * 0.5;

    // 바닥 평탄화
    const flatY = -h * 0.38;
    if (y < flatY) {
      y = flatY + (y - flatY) * 0.1;
    }

    // Y 방향 노이즈 (표면 울퉁불퉁)
    const yNoise =
      fbm3D(x * 0.02 + ox + 200, y * 0.02 + oy + 200, z * 0.02 + oz + 200, 3) *
        2.0 -
      1.0;
    y += yNoise * h * 0.06 * Math.sin(t * Math.PI);

    pos.setXYZ(i, x, y, z);
  }

  pos.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

// =============================================================================
// ThreeOverlay Component
// =============================================================================
const ThreeOverlay = forwardRef(function ThreeOverlay(
  { visible, shipState, specs, mode, baseRef, manualMode },
  ref,
) {
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
    // Voyage Playback 거동 bias — 외부에서 매 tick 주입 (두께·파고 유도)
    voyagePitchBias: 0,
    voyageRollBias: 0,
    voyageHeaveBias: 0,
    voyagePitchBiasTarget: 0,
    voyageRollBiasTarget: 0,
    voyageHeaveBiasTarget: 0,
    // Voyage 얼음 컨텍스트 — 매 voyage tick 업데이트, 렌더 루프가 시간 기반 거동 계산
    voyageIceContext: null, // { thicknessM, speedKn, isEscorted }
    iceMotionPhase: Math.random() * Math.PI * 2, // 램 사이클 위상
    // 아라온 배치 상태 — 렌더 루프가 매 프레임 참조·lerp
    araonMode: null,        // 'escort' | 'dock' | null
    araonEscortConfig: null, // { forwardM, sideM }
    araonDockDelta: null,    // { deltaLatDeg, deltaLonDeg, refLat, headingDeg }
    // 전환 애니메이션 상태 (모드 바뀔 때 시작)
    araonTransitionStart: null, // { x, z, rotY } — 전환 시작 시점의 아라온 위치
    araonTransitionStartTime: 0,
    araonTransitionDuration: 2500, // ms
    // Real wave 오버라이드 — { Hs, Tp, dirDeg, headingDeg } | null
    realWaveInput: null,
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
    const waveGeo = trackDisposable(
      new THREE.PlaneGeometry(80000, 80000, 128, 128),
    );
    waveGeo.rotateX(-Math.PI / 2);
    const mat = trackDisposable(
      new THREE.MeshPhongMaterial({
        color: 0x0d4f8b,
        specular: 0x4a8aaa,
        shininess: 80,
        transparent: true,
        depthWrite: false,
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
      // 불규칙 크기/비율 — 타입 범위 내에서도 폭/높이/깊이 비율이 매번 다름
      const wBase = rng(type.w[0], type.w[1]);
      const hBase = rng(type.h[0], type.h[1]);
      const dBase = rng(type.d[0], type.d[1]);
      // //! [Original Code] 기존 빙산 난수 변수 (변동성이 비교적 약함)
      // const sizeJitter = 0.7 + Math.random() * 0.6;  // 0.7~1.3 크기 변동
      // const ratioJitter = 0.6 + Math.random() * 0.8; // 0.6~1.4 종횡비 변동
      // const w = wBase * sizeJitter;
      // const h = hBase * sizeJitter * ratioJitter;
      // const d = dBase * sizeJitter * (0.5 + Math.random() * 1.0);

      // //* [Modified Code] 무작위 난수 범위를 확장하여 보다 다양한 형태, 크기의 빙산 표현
      const sizeJitter = 0.4 + Math.random() * 1.2; // 0.4~1.6 크기 변동 (범위 확장)
      const ratioJitter = 0.4 + Math.random() * 1.5; // 0.4~1.9 높이 종횡비 변동
      const w = wBase * sizeJitter * (0.8 + Math.random() * 0.4);
      const h = hBase * sizeJitter * ratioJitter * (0.6 + Math.random() * 0.8);
      const d = dBase * sizeJitter * (0.4 + Math.random() * 1.2);
      const bR = Math.max(Math.max(w, d) * 0.45, 3);

      const geo = trackDisposable(makeIceGeo(type.name, w, h, d));
      const mesh = new THREE.Mesh(geo, iceMat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.rotation.y = Math.random() * Math.PI * 2;
      // 모든 타입에 불규칙 기울기 (tabular 포함)
      mesh.rotation.z = (Math.random() - 0.5) * 0.12;
      mesh.rotation.x = (Math.random() - 0.5) * 0.1;
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
          new THREE.RingGeometry(
            rr * 0.93,
            rr * 1.09,
            type.name === 'tabular' ? 20 : 14,
          ),
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

  const buildIcebergs = useCallback((centerX = 0, centerZ = 0) => {
    const { scene, tIcebergs } = ctx.current;

    // Clear existing icebergs
    for (const ice of tIcebergs) {
      if (ice.grp.parent) ice.grp.parent.remove(ice.grp);
    }
    tIcebergs.length = 0;

    // 빙하 생성 중심점 저장 (재생성 판단용)
    ctx.current.icebergCenterX = centerX;
    ctx.current.icebergCenterZ = centerZ;

    // Close range: small/medium only
    const closeRanges = [60, 100, 155, 220, 310, 420];
    for (const dist of closeRanges) {
      const angle = Math.PI / 3 + Math.random() * ((Math.PI * 4) / 3);
      const closeType = dist < 180 ? ICE_TYPES[3] : ICE_TYPES[2];
      spawnIceberg(centerX + Math.cos(angle) * dist, centerZ + Math.sin(angle) * dist, closeType);
    }
    // Mid range: all types mixed
    for (let i = 0; i < 55; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = rng(500, 5000);
      spawnIceberg(centerX + Math.cos(angle) * dist, centerZ + Math.sin(angle) * dist, pickType());
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
      spawnIceberg(centerX + Math.cos(angle) * dist, centerZ + Math.sin(angle) * dist, farType);
    }
  }, [spawnIceberg]);

  // -- Real iceberg data (yellow) --
  const updateRealBergs = useCallback((bergs, shipLat, shipLon) => {
    const { scene, realBergs, realBergMat } = ctx.current;
    if (!scene || !realBergMat) {
      console.warn('[updateRealBergs] SKIP: scene=', !!scene, 'realBergMat=', !!realBergMat);
      return;
    }

    // Remove previous real berg meshes
    for (const grp of realBergs) {
      if (grp.parent) grp.parent.remove(grp);
    }
    realBergs.length = 0;

    if (!bergs || bergs.length === 0) {
      console.warn('[updateRealBergs] SKIP: no bergs data');
      return;
    }

    const bRefLat = baseRef?.lat ?? 35.1;
    const bRefLon = baseRef?.lon ?? 129.0;
    const mPerDegLon = 111319.491 * Math.cos((bRefLat * Math.PI) / 180);
    const VISIBLE_RANGE = 50000; // 50km

    const shipX = ctx.current.shipGroup3?.position.x ?? 0;
    const shipZ = ctx.current.shipGroup3?.position.z ?? 0;
    console.log('[updateRealBergs] bergs:', bergs.length,
      'baseRef:', bRefLat, bRefLon,
      'shipPos:', shipX.toFixed(1), shipZ.toFixed(1),
      'shipLatLon:', shipLat, shipLon,
      'first berg:', bergs[0]?.lat, bergs[0]?.lon);

    let filteredCount = 0;

    // 실시간 빙산의 로컬 좌표 변환: 출발항 기준 고정 월드 축 사용
    for (const berg of bergs) {
      const x = ((berg.lon - bRefLon) * mPerDegLon) / 1.5;
      const z = (-(berg.lat - bRefLat) * METERS_PER_DEGREE_LAT) / 1.5;
      const dist = Math.sqrt(
        Math.pow(x - shipX, 2) + Math.pow(z - shipZ, 2),
      );
      if (dist > VISIBLE_RANGE) { filteredCount++; continue; }

      const size = Math.max(berg.size || 5000, 500);
      const h = size * 0.15;
      const bw = ((size * 0.3) / 1.5) * 2;
      const bd = bw * 0.85;
      const geo = makeIceGeo('medium', bw, h, bd);
      const mesh = new THREE.Mesh(geo, realBergMat);
      mesh.castShadow = true;
      const grp = new THREE.Group();
      grp.add(mesh);
      grp.position.set(x, h / 2, z);
      scene.add(grp);
      realBergs.push(grp);
    }
    console.log('[updateRealBergs] RESULT: added=', realBergs.length,
      'filtered(>50km)=', filteredCount, 'of total=', bergs.length);
  }, []);

  // -- Ship --
  const buildShip = useCallback(
    (shipType = 'bulk') => {
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

      // ── 프리미엄 머티리얼 팔레트 (Standard Material + Environment Reflection) ──
      const matScale = (c, met = 0.5, rog = 0.4) => {
        const m = new THREE.MeshStandardMaterial({
          color: c,
          metalness: met,
          roughness: rog,
          envMapIntensity: 1.2,
        });
        trackDisposable(m);
        return m;
      };

      const C = {
        iceRed: matScale(0x9b1c1c, 0.6, 0.3),
        iceDark: matScale(0x4a1212, 0.7, 0.2),
        lngHull: matScale(0x1e3a8a, 0.5, 0.4),
        conHull: matScale(0x334155, 0.4, 0.5),
        white: matScale(0xf8fafc, 0.2, 0.1),
        deck: matScale(0x334155, 0.3, 0.6),
        window: matScale(0x0f172a, 0.9, 0.1), // 반사율 높은 창문
        tank: matScale(0xe2e8f0, 0.4, 0.3),
        tankPipe: matScale(0x64748b, 0.8, 0.2),
        box1: matScale(0x0284c7, 0.3, 0.6),
        box2: matScale(0xd97706, 0.3, 0.6),
        box3: matScale(0x059669, 0.3, 0.6),
        dark: matScale(0x0f172a, 0.8, 0.1),
        gold: matScale(0xb45309, 0.9, 0.1), // 안테나/센서용
      };

      if (shipType === 'bulk') {
        // 🚢 [BULK CARRIER] 대형 벌크선 — 빨간 선체 + 화물창 커버 + 선미 거주구역
        // 사진 레퍼런스: Capesize/Supramax 벌크 캐리어

        // ── 선체 (짙은 빨강/검정, 넓고 낮음) ──
        const bulkHull = matScale(0x8b1a1a, 0.5, 0.4);    // 짙은 빨강
        const bulkBottom = matScale(0x3a0e0e, 0.6, 0.3);  // 흘수선 아래 어두운 빨강
        const bulkDeck = matScale(0x2d3748, 0.3, 0.6);    // 갑판 회색
        const holdCover = matScale(0xb91c1c, 0.3, 0.5);   // 화물창 커버 빨강
        const holdFrame = matScale(0x1e293b, 0.4, 0.4);   // 화물창 프레임

        // 메인 선체
        mkH(new THREE.BoxGeometry(36, 14, 230), bulkHull, 0, 0, 0);
        mkH(new THREE.BoxGeometry(37, 6, 235), bulkBottom, 0, -8, 0);

        // 선수 (일반 상선 뱃머리 — V형)
        mkH(new THREE.CylinderGeometry(0, 20, 40, 4), bulkHull, 0, -2, -120, 0, Math.PI / 4);
        mkH(new THREE.BoxGeometry(30, 8, 20), bulkHull, 0, 3, -115);
        // 선수루 (forecastle)
        mkH(new THREE.BoxGeometry(34, 5, 25), bulkDeck, 0, 9, -105);

        // 갑판
        mkH(new THREE.BoxGeometry(36, 1, 230), bulkDeck, 0, 7.5, 0);

        // ── 화물창 커버 (6개, 빨간 직사각형 해치) ──
        for (let i = 0; i < 6; i++) {
          const pz = -80 + i * 30;
          // 화물창 커버 본체
          mkH(new THREE.BoxGeometry(28, 3, 24), holdCover, 0, 9.5, pz);
          // 커버 프레임 (테두리)
          mkH(new THREE.BoxGeometry(30, 0.5, 26), holdFrame, 0, 11.2, pz);
          // 커버 중앙선
          mkH(new THREE.BoxGeometry(0.8, 3.5, 24), holdFrame, 0, 9.5, pz);
        }

        // ── 갑판 통로 (좌우 난간) ──
        for (let i = -1; i <= 1; i += 2) {
          mkH(new THREE.BoxGeometry(0.5, 2.5, 200), C.dark, 17 * i, 9, -10);
        }

        // ── 선미 거주구역 (흰색, 다층) ──
        mkU(new THREE.BoxGeometry(34, 20, 40), C.white, 0, 18, 85);
        mkU(new THREE.BoxGeometry(36, 3, 38), C.white, 0, 30, 84);  // 브릿지 데크
        mkU(new THREE.BoxGeometry(38, 5, 22), C.white, 0, 33, 78);  // 브릿지 윙
        mkU(new THREE.BoxGeometry(36, 3, 20), C.window, 0, 33.5, 77); // 브릿지 창

        // 층간 라인 (각 층 구분)
        for (let i = 0; i < 4; i++) {
          mkU(new THREE.BoxGeometry(34.5, 0.5, 40), bulkDeck, 0, 10 + i * 5, 85);
        }

        // ── 펀넬 (연돌) ──
        mkU(new THREE.BoxGeometry(8, 14, 8), C.white, 0, 38, 95);
        mkU(new THREE.BoxGeometry(8.5, 2, 8.5), C.dark, 0, 44.5, 95);  // 상단 검정 띠
        mkU(new THREE.BoxGeometry(6, 1, 6), matScale(0xef4444, 0.3, 0.5), 0, 42, 95);  // 빨간 라인

        // ── 마스트 ──
        mkU(new THREE.CylinderGeometry(0.6, 0.8, 20, 8), C.dark, 0, 43, 78);
        mkU(new THREE.BoxGeometry(8, 0.5, 2), C.dark, 0, 50, 78);   // 레이더 가이드
        mkU(new THREE.BoxGeometry(6, 0.5, 1.5), C.gold, 0, 53, 78); // 안테나

        // 선수 마스트
        mkH(new THREE.CylinderGeometry(0.5, 0.7, 15, 8), C.dark, 0, 16, -100);
      } else if (shipType === 'lng') {
        // 🛢 [LNG CARRIER] 압도적인 크기의 에너지 운반선
        // 거대 선체 (Freeboard가 높음)
        mkH(new THREE.BoxGeometry(48, 22, 320), C.lngHull, 0, 0, 0);
        mkH(new THREE.BoxGeometry(49, 8, 322), C.dark, 0, -12, 0);

        // LNG 탱크 보호 커버 (Membrane 돔 스타일)
        for (let i = 0; i < 4; i++) {
          const pz = -120 + i * 75;
          mkH(
            new THREE.SphereGeometry(
              22,
              32,
              16,
              0,
              Math.PI * 2,
              0,
              Math.PI / 2,
            ),
            C.tank,
            0,
            11,
            pz,
          );
          // 탱크 베이스 사각형 구조
          mkH(new THREE.BoxGeometry(44, 5, 60), C.white, 0, 12, pz);
          // 파이프 라인 시스템
          mkH(
            new THREE.CylinderGeometry(1.2, 1.2, 310, 8),
            C.tankPipe,
            12,
            16,
            0,
            Math.PI / 2,
          );
          mkH(
            new THREE.CylinderGeometry(0.8, 0.8, 44, 8),
            C.tankPipe,
            0,
            18,
            pz,
            0,
            0,
            Math.PI / 2,
          );
        }

        // 거주구역 (고층 빌딩 스타일)
        mkU(new THREE.BoxGeometry(44, 35, 60), C.white, 0, 28, 130);
        for (let i = 0; i < 5; i++) {
          mkU(new THREE.BoxGeometry(44.5, 2, 55), C.deck, 0, 15 + i * 7, 130); // 층간 구분선
        }
        mkU(new THREE.BoxGeometry(40, 8, 30), C.white, 0, 50, 120); // 최상단 브릿지
        mkU(new THREE.BoxGeometry(42, 4, 28), C.window, 0, 51, 108); // 전면 대형창

        // 트윈 연돌 (웅장함 강조)
        mkU(new THREE.BoxGeometry(8, 25, 12), C.dark, -10, 55, 145);
        mkU(new THREE.BoxGeometry(8, 25, 12), C.dark, 10, 55, 145);
      } else {
        // 📦 [CONTAINER SHIP] 촘촘하고 빈틈없는 적재 위용
        mkH(new THREE.BoxGeometry(42, 16, 280), C.conHull, 0, 0, 0);
        mkH(new THREE.BoxGeometry(44, 1, 280), C.deck, 0, 8.5, 0);

        // 컨테이너 멀티 스택 (박스 수 대폭 증가 -> 하지만 시야 확보를 위해 층수 제한)
        const colors = [C.box1, C.box2, C.box3];
        for (let row = 0; row < 8; row++) {
          const pz = -120 + row * 34;
          if (row === 5) continue; // 브릿지 공간 비움
          for (let col = -1; col <= 1; col++) {
            // //* [Modified Code] 최대 4층(2 + (0~2))으로 제한하여 선교에서 뱃머리를 볼 때 가리지 않도록 물리량 하향
            const height = 2 + Math.floor(Math.random() * 3);
            for (let h = 0; h < height; h++) {
              const color = colors[(row + col + h) % 3];
              mkH(
                new THREE.BoxGeometry(12, 6, 30),
                color,
                col * 13,
                11.5 + h * 6.2,
                pz,
              );
            }
          }
        }

        // 거주구역 (중앙 집중형)
        mkU(new THREE.BoxGeometry(40, 45, 35), C.white, 0, 30, 50);
        mkU(new THREE.BoxGeometry(46, 6, 25), C.white, 0, 48, 45); // 브릿지 윙
        mkU(new THREE.BoxGeometry(45, 3.5, 23), C.window, 0, 48.5, 44);

        // 대형 마스트 및 통신 그리드
        mkU(new THREE.BoxGeometry(2, 20, 2), C.dark, 0, 60, 55);
        mkU(new THREE.BoxGeometry(20, 1, 1), C.dark, 0, 65, 55);
        mkU(new THREE.BoxGeometry(15, 1, 1), C.dark, 0, 72, 55);
      }

      // //! [Original Code] 작은 선박 스케일
      // shipMesh3.scale.set(1.4, 1.4, 1.4);

      // //* [Modified Code] 주변 배경(빙하 등)에 대비되어 너무 작게 느껴지지 않도록 선박 크기 상향 커스텀
      shipMesh3.scale.set(2.8, 2.8, 2.8);
      shipMesh3.position.y = SHIP_BASE_Y;
      shipMesh3.add(shipUpper3);
      shipGroup3.add(shipMesh3);
      shipGroup3.add(cameraPivot3);
      scene.add(shipGroup3);

      ctx.current.shipGroup3 = shipGroup3;
      ctx.current.shipMesh3 = shipMesh3;
      ctx.current.shipUpper3 = shipUpper3;
      ctx.current.cameraPivot3 = cameraPivot3;

      // ── Wake ribbon (선미뷰 궤적 리본) — FOLLOW 뷰 전용 ─────────────
      // 선박 뒤에 남는 쇄빙 궤적. 최신 포인트일수록 밝고, 꼬리로 갈수록 페이드.
      const WAKE_MAX = 240;
      const wakePositions = new Float32Array(WAKE_MAX * 3);
      const wakeColors = new Float32Array(WAKE_MAX * 3);
      const wakeGeo = new THREE.BufferGeometry();
      wakeGeo.setAttribute('position', new THREE.BufferAttribute(wakePositions, 3));
      wakeGeo.setAttribute('color', new THREE.BufferAttribute(wakeColors, 3));
      wakeGeo.setDrawRange(0, 0);
      trackDisposable(wakeGeo);
      const wakeMat = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.85,
        linewidth: 2,
        depthWrite: false,
      });
      trackDisposable(wakeMat);
      const wakeLine = new THREE.Line(wakeGeo, wakeMat);
      wakeLine.frustumCulled = false;
      wakeLine.renderOrder = 5;
      wakeLine.visible = false; // 기본 숨김 (FOLLOW 진입 시 활성화)
      scene.add(wakeLine);

      ctx.current.wakeLine = wakeLine;
      ctx.current.wakeGeo = wakeGeo;
      ctx.current.wakePositions = wakePositions;
      ctx.current.wakeColors = wakeColors;
      ctx.current.wakeMaxPoints = WAKE_MAX;
      ctx.current.wakeCount = 0;        // 현재 저장된 포인트 수
      ctx.current.wakeLastT = 0;        // 마지막 push 시각 (ms)
      ctx.current.wakeLastPos = null;   // 마지막 push 위치 (중복 방지)

      // ── 아라온호 3D 모델 (실제 Araon 기반 — 빨간 선체 + 흰 상부 + 주황 크레인) ──
      const araonGroup = new THREE.Group();
      const araonMesh = new THREE.Group();
      const araonHelper = (group) => (geo, mat, px, py, pz, rx = 0, ry = 0) => {
        trackDisposable(geo);
        const m = new THREE.Mesh(geo, mat);
        m.position.set(px, py, pz);
        m.rotation.x = rx;
        m.rotation.y = ry;
        m.castShadow = true;
        m.receiveShadow = true;
        group.add(m);
      };
      const mkA = araonHelper(araonMesh);

      // Araon 머티리얼 (실제 아라온 색상)
      const araonRed = matScale(0xc0392b, 0.6, 0.3);     // 선체 빨강
      const araonDark = matScale(0x6b1e17, 0.7, 0.25);   // 하단 어두운 부분
      const araonWhite = matScale(0xecf0f1, 0.2, 0.15);  // 상부구조 흰색
      const araonWindow = matScale(0x1a365d, 0.9, 0.1);  // 브릿지 창 (진한 파랑)
      const araonOrange = matScale(0xe67e22, 0.3, 0.5);  // 크레인 주황
      const araonGray = matScale(0x4a5568, 0.7, 0.3);    // 마스트/디테일

      // Araon 실제 크기: 길이 111m, 폭 19m, 흘수 6.8m
      // shipMesh3 scale(2.8x) 매칭을 위해 raw 크기는 본선과 비슷한 스케일로

      // ── 선체 (flared icebreaker bow, 빨강) ──
      mkA(new THREE.BoxGeometry(20, 10, 115), araonRed, 0, 0, 0);
      mkA(new THREE.BoxGeometry(21, 4, 118), araonDark, 0, -6, 0);
      // 쇄빙 뱃머리 — tapered forward
      for (let i = 0; i < 4; i++) {
        const s = 1 - i * 0.18;
        mkA(
          new THREE.BoxGeometry(20 * s, 2.5, 10),
          araonRed,
          0,
          -1 - i * 1.2,
          -55 - i * 4,
        );
      }
      mkA(
        new THREE.CylinderGeometry(0, 11, 22, 4),
        araonRed,
        0,
        0,
        -66,
        0,
        Math.PI / 4,
      );

      // ── 흰색 상부구조 (중앙 선교 블록) ──
      mkA(new THREE.BoxGeometry(16, 8, 28), araonWhite, 0, 9, -8);
      mkA(new THREE.BoxGeometry(15, 6, 18), araonWhite, 0, 16, -12); // 2단
      mkA(new THREE.BoxGeometry(18, 4, 14), araonWhite, 0, 21, -16); // 브릿지 윙

      // 브릿지 파노라마 창 (선수 방향)
      mkA(new THREE.BoxGeometry(17, 2.5, 12), araonWindow, 0, 21.2, -17);

      // ── 마스트 & 안테나 ──
      mkA(new THREE.CylinderGeometry(0.5, 0.7, 18, 8), araonGray, 0, 30, -14);
      mkA(new THREE.BoxGeometry(7, 0.4, 2), araonGray, 0, 27, -14);
      mkA(new THREE.BoxGeometry(5, 0.4, 2), araonGray, 0, 31, -14);

      // ── 선수 흰 크로스 마크 (reinforced bow line) ──
      mkA(new THREE.BoxGeometry(10, 0.3, 1), araonWhite, 0, 2, -45);

      // ── 전방 헬리데크 (상부구조 앞쪽) ──
      mkA(new THREE.CylinderGeometry(7, 7, 0.5, 16), araonWhite, 0, 6, -32);
      // H 마크
      mkA(new THREE.BoxGeometry(5, 0.1, 1), araonDark, 0, 6.3, -32);
      mkA(new THREE.BoxGeometry(1, 0.1, 5), araonDark, 0, 6.3, -32);

      // ── 후방 갑판 (오픈 데크) ──
      mkA(new THREE.BoxGeometry(18, 0.5, 30), araonGray, 0, 5.5, 25);

      // ── 후방 A-frame / 크레인 (아라온 트레이드마크) ──
      // 주 크레인 기둥 두 개
      mkA(new THREE.BoxGeometry(1.5, 15, 1.5), araonOrange, -7, 13, 25);
      mkA(new THREE.BoxGeometry(1.5, 15, 1.5), araonOrange, 7, 13, 25);
      // 크레인 상단 가로대
      mkA(new THREE.BoxGeometry(16, 1.5, 1.5), araonOrange, 0, 20, 25);
      // 중앙 크레인 붐
      mkA(new THREE.BoxGeometry(1.2, 1.2, 20), araonOrange, 0, 18, 30, 0.3);
      // 크레인 베이스 박스
      mkA(new THREE.BoxGeometry(10, 3, 6), araonOrange, 0, 7.5, 20);

      // ── 펀넬(연돌) ──
      mkA(new THREE.BoxGeometry(4, 8, 5), araonWhite, 0, 14, -2);
      mkA(new THREE.BoxGeometry(4.2, 1.2, 5.2), araonRed, 0, 17.5, -2); // 상단 빨간 띠

      // ── 구명정 데이빗 (양쪽) ──
      mkA(new THREE.BoxGeometry(4, 1.5, 1.5), araonOrange, -8, 12, -5);
      mkA(new THREE.BoxGeometry(4, 1.5, 1.5), araonOrange, 8, 12, -5);

      // 실제 아라온(~111m)은 상선(~290m)보다 작지만 시각적 가독성을 위해
      // 본선(2.8x) 보다 더 큰 스케일로 부스트
      araonMesh.scale.set(4.5, 4.5, 4.5);
      araonMesh.position.y = SHIP_BASE_Y;
      araonGroup.add(araonMesh);
      araonGroup.visible = false;
      scene.add(araonGroup);

      ctx.current.araonGroup = araonGroup;
      ctx.current.araonMesh = araonMesh;
    },
    [trackDisposable],
  );

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

      // 육지: 반투명 평면으로 "저기 육지다" 감각만 제공.
      // 높이 2 유닛, 수면 아래(y=-1) 배치 → 선박과 절대 충돌 안 함.
      // opacity 0.18 → 물 위에 은은한 녹색 윤곽. 조악한 벽 느낌 제거.
      function addLand(lat1, lon1, lat2, lon2, h, color) {
        const p1 = ll(lat1, lon1);
        const p2 = ll(lat2, lon2);
        const w = Math.abs(p2.x - p1.x);
        const d = Math.abs(p2.z - p1.z);
        if (w < 100 || d < 100) return;
        const geo = trackDisposable(new THREE.BoxGeometry(w, h, d));
        const mat = trackDisposable(
          new THREE.MeshStandardMaterial({
            color,
            roughness: 0.9,
            metalness: 0.0,
            transparent: true,
            opacity: 0.18,
            depthWrite: false,
          }),
        );
        const m = new THREE.Mesh(geo, mat);
        // 윗면 y=-1 (수면 아래) → 파도 메쉬 아래에서 은은하게 비침
        m.position.set((p1.x + p2.x) / 2, -h / 2 - 1, (p1.z + p2.z) / 2);
        m.renderOrder = -1; // 바다보다 먼저 렌더 → 블렌딩 자연스럽게
        landGroup.add(m);
      }

      // ── 해안 1단 (얇고 넓음, 어두운 녹색) ──
      // Korean Peninsula
      addLand(34.0, 126.0, 38.5, 130.0, 6, 0x2a3f22);
      addLand(37.5, 125.5, 39.5, 127.0, 10, 0x354a2c); // 내륙 고지
      // Japan Honshu
      addLand(33.0, 130.0, 40.0, 142.0, 6, 0x2a3f22);
      addLand(35.0, 136.0, 38.0, 141.0, 12, 0x354a2c); // 중앙 산지
      // Hokkaido
      addLand(41.5, 140.0, 45.5, 145.5, 6, 0x2a3f22);
      addLand(42.5, 142.0, 44.5, 144.5, 10, 0x3a5030);
      // Russian Primorsky
      addLand(42.0, 130.0, 55.0, 145.0, 5, 0x2a3822);
      addLand(45.0, 132.0, 53.0, 142.0, 9, 0x334528);
      // Russian Chukchi / East Siberia
      addLand(60.0, 160.0, 72.0, 180.0, 5, 0x3a4535);
      addLand(63.0, 165.0, 70.0, 178.0, 8, 0x454f40);
      addLand(60.0, -180.0, 70.0, -160.0, 5, 0x3a4535);
      // Kamchatka
      addLand(51.0, 156.0, 60.0, 163.0, 8, 0x3a4530);
      addLand(53.0, 157.5, 58.0, 161.0, 14, 0x4a5540); // 화산 산맥
      // Alaska
      addLand(60.0, -168.0, 71.0, -141.0, 6, 0x3f4a38);
      addLand(62.0, -155.0, 68.0, -148.0, 12, 0x4a5540); // 내륙
      // Greenland
      addLand(60.0, -50.0, 83.0, -18.0, 8, 0x6a7a78);
      addLand(64.0, -46.0, 80.0, -25.0, 15, 0x8a9a95); // 빙상 고원
      // Norway / Scandinavia
      addLand(57.0, 5.0, 71.0, 30.0, 6, 0x2a3f22);
      addLand(60.0, 7.0, 69.0, 18.0, 12, 0x3a4a30); // 피오르드 산맥
      // Svalbard
      addLand(76.5, 14.0, 80.5, 28.0, 6, 0x6a7a72);
      addLand(77.5, 16.0, 79.5, 24.0, 10, 0x8a9a8a);
      // United Kingdom
      addLand(50.0, -6.0, 59.0, 2.0, 5, 0x2a3f22);
      // Netherlands / German coast
      addLand(51.0, 3.0, 54.0, 10.0, 3, 0x354a2c);
      // Iceland
      addLand(63.5, -24.0, 66.5, -13.0, 6, 0x4a5a4a);
      addLand(64.0, -21.0, 66.0, -16.0, 11, 0x5a6a5a); // 중앙 고지
      // Northern Canada
      addLand(70.0, -100.0, 78.0, -60.0, 5, 0x3f4a3a);
      addLand(72.0, -90.0, 76.0, -70.0, 10, 0x4a5545);
      // Novaya Zemlya
      addLand(70.5, 50.0, 77.0, 60.0, 6, 0x5a6a60);
      // Franz Josef Land
      addLand(79.5, 44.0, 81.5, 62.0, 5, 0x7a8a80);
      // Severnaya Zemlya
      addLand(78.0, 90.0, 81.5, 107.0, 5, 0x6a7a70);
      // New Siberian Islands
      addLand(73.0, 135.0, 76.0, 150.0, 4, 0x5a6a55);
      // Wrangel Island (아라온 정박지)
      addLand(70.5, 178.5, 71.5, -178.0, 4, 0x5a6a55);

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

  const updateOceanOverlay = useCallback(
    (colorMode, shipLon, shipLat, sampleIceConcentrationFn) => {
      const { waveGeo, waveMesh } = ctx.current;
      if (!waveMesh || !waveGeo) return;

      const modeChanged = ctx.current.oceanColorMode !== colorMode;
      ctx.current.oceanColorMode = colorMode;
      ctx.current.overlayFrame++;
      if (!modeChanged && ctx.current.overlayFrame % 120 !== 0) return;

      console.log(
        '[OceanOverlay]',
        colorMode,
        'lat:',
        shipLat?.toFixed(1),
        'lon:',
        shipLon?.toFixed(1),
      );

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
        ctx.current.iceTexData = new Uint8Array(
          ICE_TEX_SIZE * ICE_TEX_SIZE * 4,
        );
        ctx.current.iceTex = new THREE.DataTexture(
          ctx.current.iceTexData,
          ICE_TEX_SIZE,
          ICE_TEX_SIZE,
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

          const conc = sampleIceConcentrationFn
            ? sampleIceConcentrationFn(vLon, vLat)
            : 0;
          const idx = (ty * ICE_TEX_SIZE + tx) * 4;

          if (colorMode === 'ice') {
            // 자연색 모드: naturalIceRGBA가 RGBA 직접 반환
            const [r, g, b, a] = naturalIceRGBA(conc || 0);
            data[idx] = r;
            data[idx + 1] = g;
            data[idx + 2] = b;
            data[idx + 3] = a;
          } else {
            let rgb;
            if (colorMode === 'thickness') {
              const thickM = (conc || 0) * 5.0;
              rgb = thicknessToRGB(thickM);
            } else if (colorMode === 'edge') {
              rgb = edgeToRGB(conc || 0);
            } else {
              rgb = depthToRGB(estimateBathymetry(vLon, vLat));
            }
            data[idx] = Math.round(rgb[0] * 255);
            data[idx + 1] = Math.round(rgb[1] * 255);
            data[idx + 2] = Math.round(rgb[2] * 255);
            data[idx + 3] = 255;
          }
        }
      }

      tex.needsUpdate = true;
      mat.map = tex;
      mat.vertexColors = false;
      mat.color.setHex(0xffffff);
      mat.needsUpdate = true;
    },
    [],
  );

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
  // realWaveInput 가 설정돼 있으면 실제 파고·파향·주기로 대체 (파향 있으면 축 분리).
  const updateShipMotion = useCallback((dt, lat) => {
    const c = ctx.current;
    let Hs;
    let Tp;
    let rollAxis = 1;   // roll 축 가중 (0..1)
    let pitchAxis = 1;  // pitch 축 가중 (0..1)
    let waveSource = 'synthetic';

    if (c.realWaveInput && typeof c.realWaveInput.Hs === 'number') {
      Hs = c.realWaveInput.Hs;
      Tp = c.realWaveInput.Tp > 0 ? c.realWaveInput.Tp : 8;
      const dirDeg = c.realWaveInput.dirDeg;
      const headingDeg = c.realWaveInput.headingDeg;
      if (
        typeof dirDeg === 'number' &&
        typeof headingDeg === 'number'
      ) {
        // 상대각: 파가 오는 방향 vs 뱃머리
        const rel = (((dirDeg - headingDeg + 540) % 360) - 180) * (Math.PI / 180);
        rollAxis = Math.abs(Math.sin(rel));   // 횡파=1, 종파=0
        pitchAxis = Math.abs(Math.cos(rel));  // 종파=1, 횡파=0
        waveSource = 'real+directed';
      } else {
        // 방향 없음 — 기본 비율 유지
        waveSource = 'real+scalar';
      }
    } else {
      const st = getSeaState(lat);
      Hs = st.Hs;
      Tp = st.Tp;
    }
    c.lastWaveSource = waveSource;
    c.motionWavePhase = (c.motionWavePhase + dt * ((2 * Math.PI) / Tp)) % (Math.PI * 200);

    const zetaR = 0.05;
    const zetaP = 0.04;
    const rollAmpScale = Math.sqrt(BASE_GM / Math.max(0.5, c.shipGM));

    const aR =
      Hs *
      rollAmpScale *
      rollAxis *
      (0.018 * Math.sin(c.motionWavePhase + 0.3) +
        0.008 * Math.sin(c.motionWavePhase * 1.7 + 1.1));
    const aP =
      Hs *
      pitchAxis *
      (0.008 * Math.sin(c.motionWavePhase * 1.3 + 2.0) +
        0.004 * Math.sin(c.motionWavePhase * 0.8 + 0.5));
    const aH = Hs * 0.3 * Math.sin(c.motionWavePhase * 0.9 + 0.7);

    c.shipRollVel +=
      (-2 * zetaR * c.omegaR * c.shipRollVel -
        c.omegaR * c.omegaR * c.shipRoll +
        aR) *
      dt;
    c.shipRoll += c.shipRollVel * dt;

    c.shipPitchVel +=
      (-2 * zetaP * c.omegaP * c.shipPitchVel -
        c.omegaP * c.omegaP * c.shipPitch +
        aP) *
      dt;
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

    // ── 얼음 두께 기반 거동 (voyage 전용, 현실 쇄빙선 모델) ──
    // 비선형 커브 + 시간 기반 램 사이클.
    // < 0.8m: 미미 / 0.8~1.5m: bow-up 약 / 1.5~2.5m: 램 진동 / > 2.5m: 드라마틱 ride-up
    let icePitch = 0;
    let iceHeave = 0;
    let iceRoll = 0;
    if (c.voyageIceContext && typeof c.voyageIceContext.thicknessM === 'number') {
      const h = Math.max(0, c.voyageIceContext.thicknessM);
      const isEscorted = !!c.voyageIceContext.isEscorted;
      // 호위 받으면 effective thickness 가 낮아졌을 것 — 추가 감쇠
      const effH = isEscorted ? h * 0.55 : h;

      c.iceMotionPhase = (c.iceMotionPhase + dt * 1.2) % (Math.PI * 200);

      if (effH < 0.8) {
        // 얇은 얼음: 거의 자연 항해
        icePitch = effH * 0.015;
      } else if (effH < 1.5) {
        // 중간 두께: 점진적 bow-up, 약한 출렁임
        icePitch = 0.012 + (effH - 0.8) * 0.085;
        iceHeave = Math.sin(c.iceMotionPhase * 0.8) * (effH - 0.8) * 0.15;
      } else if (effH < 2.5) {
        // 두꺼움: 램 주기 진동
        const base = 0.072 + (effH - 1.5) * 0.11;
        const ramCycle = Math.sin(c.iceMotionPhase * 1.4);
        // 램 진동: 기준 pitch 주변 ±0.05 rad 오실레이션, 강도가 t 에 따라 증가
        icePitch = base + ramCycle * 0.045 * (effH - 1.5);
        iceHeave = Math.sin(c.iceMotionPhase * 1.4 + 1.2) * 0.25;
        // 간헐적 좌우 롤 (얼음에 한쪽이 걸릴 때)
        iceRoll = Math.sin(c.iceMotionPhase * 0.6 + 0.5) * 0.02 * (effH - 1.5);
      } else {
        // 매우 두꺼움: 드라마틱 ride-up + 강한 램 사이클
        const base = 0.182 + (effH - 2.5) * 0.14;
        const ramCycle = Math.sin(c.iceMotionPhase * 1.0);
        icePitch = base + ramCycle * 0.08;
        iceHeave = Math.sin(c.iceMotionPhase + 0.8) * 0.5;
        iceRoll = Math.sin(c.iceMotionPhase * 0.5) * 0.035;
      }
    }

    // Voyage bias 부드러운 추종 (target → current). 얼음 거동을 target 에 실시간 주입.
    const iceTargetPitch = (c.voyagePitchBiasTarget || 0) + icePitch;
    const iceTargetRoll = (c.voyageRollBiasTarget || 0) + iceRoll;
    const iceTargetHeave = (c.voyageHeaveBiasTarget || 0) + iceHeave;
    c.voyageRollBias += (iceTargetRoll - c.voyageRollBias) * Math.min(1, dt * 2.5);
    c.voyagePitchBias += (iceTargetPitch - c.voyagePitchBias) * Math.min(1, dt * 2.5);
    c.voyageHeaveBias += (iceTargetHeave - c.voyageHeaveBias) * Math.min(1, dt * 2.5);

    // Apply roll/pitch to shipMesh3
    if (c.shipMesh3) {
      c.shipMesh3.rotation.z = c.shipRoll + c.impactRoll + c.voyageRollBias;
      c.shipMesh3.rotation.x = c.shipPitch + c.impactPitch + c.voyagePitchBias;
      c.shipMesh3.position.y = SHIP_BASE_Y + c.shipHeave + c.voyageHeaveBias;
    }
  }, []);

  // 아라온 Three.js 3D 모델 위치/가시성 업데이트.
  // 두 가지 모드:
  //   1) trace 기반: { deltaLatDeg, deltaLonDeg, refLat, headingDeg, visible }
  //   2) escort override: { escortOverride: {forwardM, sideM}, headingDeg, visible }
  //      → trace 무시, 본선 heading 기준 앞/옆 offset으로 강제 배치
  // setAraonState: 모드·config 만 갱신. 실제 위치 이동은 렌더 루프가 매 프레임 lerp.
  // 모드가 바뀌면 전환 애니메이션 시작 (현재 아라온 위치 → 새 타겟으로 easeInOut)
  const setAraonState = useCallback((input) => {
    const c = ctx.current;
    const group = c.araonGroup;
    if (!group) return;

    if (!input || !input.visible) {
      group.visible = false;
      c.araonMode = null;
      c.araonEscortConfig = null;
      c.araonDockDelta = null;
      c.araonTransitionStart = null;
      return;
    }

    const prevMode = c.araonMode;
    let nextMode = null;
    if (input.escortOverride) {
      nextMode = 'escort';
      c.araonEscortConfig = {
        forwardM: input.escortOverride.forwardM || 0,
        sideM: input.escortOverride.sideM || 0,
      };
    } else if (
      typeof input.deltaLatDeg === 'number' &&
      typeof input.deltaLonDeg === 'number'
    ) {
      nextMode = 'dock';
      c.araonDockDelta = {
        deltaLatDeg: input.deltaLatDeg,
        deltaLonDeg: input.deltaLonDeg,
        refLat: input.refLat || 70,
        headingDeg: input.headingDeg || 0,
      };
    }

    if (!nextMode) return;

    // 모드 변경 감지 → 전환 애니메이션 시작
    if (prevMode !== nextMode) {
      // 처음 등장(이전이 null) 또는 모드 전환
      if (group.visible && prevMode) {
        // 이전 상태에서 전환: 현재 위치를 시작점으로
        c.araonTransitionStart = {
          x: group.position.x,
          z: group.position.z,
          rotY: group.rotation.y,
        };
      } else {
        // 첫 등장 — 시작점 없음(즉시 타겟에 찍힘)
        c.araonTransitionStart = null;
      }
      c.araonTransitionStartTime = performance.now();
    }
    c.araonMode = nextMode;
    group.visible = true;
  }, []);

  // 실제 파고·파향·주기 주입 (weather_latest.json 에서 최근접 waypoint 기반).
  // null 전달 시 latitude 기반 합성으로 복귀.
  const setRealWaveInput = useCallback((input) => {
    const c = ctx.current;
    if (!input) {
      c.realWaveInput = null;
      return;
    }
    c.realWaveInput = {
      Hs: typeof input.Hs === 'number' ? input.Hs : 0,
      Tp: typeof input.Tp === 'number' ? input.Tp : 8,
      dirDeg: typeof input.dirDeg === 'number' ? input.dirDeg : null,
      headingDeg: typeof input.headingDeg === 'number' ? input.headingDeg : null,
    };
  }, []);

  // 매 voyage tick 마다 현재 얼음 컨텍스트 주입 (렌더 루프의 시간 기반 거동 로직이 사용)
  const setVoyageIceContext = useCallback((ctxInput) => {
    const c = ctx.current;
    if (!ctxInput) {
      c.voyageIceContext = null;
      return;
    }
    c.voyageIceContext = {
      thicknessM: ctxInput.thicknessM || 0,
      speedKn: ctxInput.speedKn || 0,
      isEscorted: !!ctxInput.isEscorted,
    };
  }, []);

  // Voyage Playback 이 외부에서 거동 bias 주입
  const setVoyageMotionBias = useCallback((bias) => {
    const c = ctx.current;
    if (!bias) {
      c.voyageRollBiasTarget = 0;
      c.voyagePitchBiasTarget = 0;
      c.voyageHeaveBiasTarget = 0;
      return;
    }
    c.voyageRollBiasTarget = bias.rollRad || 0;
    c.voyagePitchBiasTarget = bias.pitchRad || 0;
    c.voyageHeaveBiasTarget = bias.heaveM || 0;
  }, []);

  // 상부구조는 FOLLOW/위성 뷰 모두 항시 표시 (BRIDGE 모드 제거됨)
  useEffect(() => {
    if (ctx.current.shipUpper3) {
      ctx.current.shipUpper3.visible = true;
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
  const syncThreeIcebergs = useCallback(
    (conc, shipPosVec, headingFn, cachedIceData) => {
      const c = ctx.current;
      const activeCount = Math.floor(conc * MAX_LOCAL_ICEBERGS);

      for (let i = 0; i < c.tIcebergs.length; i++) {
        const ice = c.tIcebergs[i];
        ice.grp.visible = i < activeCount;

        if (ice.grp.visible && shipPosVec) {
          const dx = ice.cx - shipPosVec.x;
          const dz = ice.cz - shipPosVec.z;
          const heading =
            typeof headingFn === 'function' ? headingFn() : headingFn;
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
    },
    [],
  );

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
    (
      currentModeStr,
      isManual,
      binocularsActive,
      shipSpeedVal,
      shipThrottleVal,
      fovSliderOverride,
      fovBaseVal,
    ) => {
      // BRIDGE 모드 제거됨. FOLLOW + 수동 + 쌍안경일 때만 줌 FOV 허용.
      if (isManual && binocularsActive) return 15;
      return 90;
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
      get scene() {
        return ctx.current.scene;
      },
      get camera() {
        return ctx.current.camera;
      },
      get renderer() {
        return ctx.current.renderer;
      },
      get shipPivot() {
        return ctx.current.shipGroup3;
      },
      get shipMesh() {
        return ctx.current.shipMesh3;
      },
      get cameraPivot() {
        return ctx.current.cameraPivot3;
      },
      get tIcebergs() {
        return ctx.current.tIcebergs;
      },
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
      setVoyageMotionBias,
      setVoyageIceContext,
      setRealWaveInput,
      setAraonState,
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
      setVoyageMotionBias,
      setVoyageIceContext,
      setRealWaveInput,
      setAraonState,
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
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
    });
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
    // 수평선 안개 — 먼 거리 자연스럽게 흐려지고 북극 분위기 연출
    scene.fog = new THREE.FogExp2(0x7a9fb5, 0.00012);
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
    const cv = Object.assign(document.createElement('canvas'), {
      width: 64,
      height: 32,
    });
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
    // //! [Original Code] 빙하 매터리얼 속성 (부드러운 음영)
    // ctx.current.iceMat = new THREE.MeshStandardMaterial({
    //   color: 0xd8e8f0,
    //   roughness: 0.65,
    //   metalness: 0.02,
    //   envMapIntensity: 0.6,
    // });

    // //* [Modified Code] flatShading 옵션과 roughness를 상향하여 각지고 투박한 빙하 질감(Faceted) 구현
    ctx.current.iceMat = new THREE.MeshStandardMaterial({
      color: 0xd8e8f0,
      roughness: 0.9,
      metalness: 0.05,
      envMapIntensity: 0.6,
      flatShading: true,
    });
    ctx.current.realBergMat = new THREE.MeshStandardMaterial({
      color: 0xffcc00,
      roughness: 0.7,
      metalness: 0.0,
      envMapIntensity: 0.4,
    });
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
    buildShip(specs.type);
    buildFoam();
    buildLandMasses(baseRef?.lat ?? 35.1, baseRef?.lon ?? 129.0);

    // ── 수동 조종 시각 참조용 해상 부표 그리드 ──
    // 고정 위치 마커를 배치하여 선박 이동을 눈으로 확인 가능하게 함
    const buoyGroup = new THREE.Group();
    buoyGroup.name = 'buoyGrid';
    const buoyGeo = new THREE.CylinderGeometry(3, 3, 12, 8);
    const buoyTopGeo = new THREE.SphereGeometry(4, 8, 8);
    const buoyMat = new THREE.MeshStandardMaterial({ color: 0xff4444, roughness: 0.6 });
    const buoyTopMat = new THREE.MeshStandardMaterial({ color: 0xffcc00, roughness: 0.5 });
    const BUOY_SPACING = 2000;
    const BUOY_GRID = 40; // -40 ~ +40 → 80x80 그리드
    for (let gx = -BUOY_GRID; gx <= BUOY_GRID; gx++) {
      for (let gz = -BUOY_GRID; gz <= BUOY_GRID; gz++) {
        // 밀도 조절: 5칸마다 하나만 배치
        if (gx % 5 !== 0 || gz % 5 !== 0) continue;
        const bx = gx * BUOY_SPACING;
        const bz = gz * BUOY_SPACING;
        const pole = new THREE.Mesh(buoyGeo, buoyMat);
        pole.position.set(bx, 6, bz);
        buoyGroup.add(pole);
        const top = new THREE.Mesh(buoyTopGeo, buoyTopMat);
        top.position.set(bx, 14, bz);
        buoyGroup.add(top);
      }
    }
    scene.add(buoyGroup);
    ctx.current.buoyGroup = buoyGroup;

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
  }, [
    buildSky,
    buildLighting,
    buildOcean,
    buildIcebergs,
    buildShip,
    buildFoam,
    buildLandMasses,
    specs.type,
  ]);

  // ── Update ship position/heading from props ───────────────────────────────
  useEffect(() => {
    if (!shipState || !ctx.current.shipGroup3) return;
    const { lat, lon, heading } = shipState;
    if (lat != null && lon != null && heading != null) {
      // 위도 기반 빙산 표시 — 수동 모드에서는 항상 표시, 자동 모드에서는 60°N 이상
      const showIce = manualMode || lat >= 60;
      for (const ice of ctx.current.tIcebergs) {
        ice.grp.visible = showIce;
      }
      for (const berg of ctx.current.realBergs) {
        if (berg.grp) berg.grp.visible = showIce;
      }
    }
  }, [shipState, mode]);

  // ── FOLLOW 줌 상태 (스크롤) ──────────────────────────────────────────────
  const followZoomTargetRef = useRef(600);
  const followZoomCurrentRef = useRef(600);

  useEffect(() => {
    function handleWheel(e) {
      if (mode !== 'FOLLOW') return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? 50 : -50;
      followZoomTargetRef.current = Math.max(
        ZOOM_MIN,
        Math.min(ZOOM_MAX, followZoomTargetRef.current + delta),
      );
    }
    const el = wrapRef.current;
    if (el) el.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      if (el) el.removeEventListener('wheel', handleWheel);
    };
  }, [mode]);

  // ── FOLLOW 오빗 상태 (드래그 회전) ────────────────────────────────────────
  const orbitRef = useRef({
    yaw: 0,
    pitch: 0.06,
    dragging: false,
    lastX: 0,
    lastY: 0,
  });

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
      orbit.yaw -= dx * 0.006;
      orbit.pitch = Math.max(-0.05, Math.min(0.9, orbit.pitch - dy * 0.004));
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
    if (mode === 'FOLLOW') {
      // //! [Original Code]
      //       followZoomTargetRef.current = 220;
      //       followZoomCurrentRef.current = 220;
      // //* [Modified Code] 대형 상선(Scale 2.8)에 맞춰 초기 선미 추적 거리를 대폭 확장
      let defaultDist = 600;
      if (specs?.type === 'lng') defaultDist = 1200;
      else if (specs?.type === 'container') defaultDist = 1000;

      followZoomTargetRef.current = defaultDist;
      followZoomCurrentRef.current = defaultDist;
      camera.fov = 75;
      camera.near = 0.5; // Near clipping plane 조정
      camera.position.set(0, 150, defaultDist);
      camera.lookAt(0, 30, -100);
      camera.updateProjectionMatrix();
    }
  }, [mode]);

  // ── 자체 렌더 루프: visible일 때만 실행 ────────────────────────────────
  useEffect(() => {
    if (!visible) return;
    // 육지 다시 표시 (높이 6~15 로 낮춰 해안선 실루엣으로 정리됨)
    if (ctx.current.landGroup) ctx.current.landGroup.visible = true;
    let rafId;
    let lastMotionTs = 0;
    function loop(now) {
      rafId = requestAnimationFrame(loop);
      const { renderer, scene, camera, shipGroup3 } = ctx.current;
      if (!renderer || !scene || !camera) return;
      try {
        const t = now * 0.001;
        // //* [Modified Code] 바다(파도) 평면이 선박의 물리 이동을 따라다니도록 shipGroup3.position 위치 전달
        animateOcean(t, shipGroup3 ? shipGroup3.position : null);

        // Ship motion (roll/pitch/heave) — 모드와 무관하게 항상 업데이트.
        // realWaveInput 이 있으면 실제 파고/파향 사용, 없으면 위도 합성.
        const motionDt = lastMotionTs === 0 ? 0.016 : Math.min(0.1, (now - lastMotionTs) / 1000);
        lastMotionTs = now;
        const shipLat = (shipState && typeof shipState.lat === 'number')
          ? shipState.lat
          : 70;
        updateShipMotion(motionDt, shipLat);

        // Foam (뱃머리 물보라) — 선박 이동 시 스프레이 파티클
        if (shipGroup3) {
          const hdg = shipGroup3.rotation.y;
          // 속도 추정: 수동이면 manualSpeed, 아니면 hud 기반 (~15kn ≈ 7.7 m/s)
          const speedMS = manualMode
            ? Math.abs(parseFloat(shipState?.manualSpeed) || 0) * 0.5
            : 7.7;
          updateFoam(motionDt, -hdg, speedMS, shipGroup3.position);
        }

        // Night mode (극야) — 고위도(82°N+)에서 조명 어둡게
        updateNightMode(shipLat);

        // 부표 그리드를 선박 주변으로 재중심화 (이동해도 항상 부표가 보이도록)
        if (ctx.current.buoyGroup && shipGroup3) {
          const sp = shipGroup3.position;
          const BUOY_SPACING = 2000;
          const snapX = Math.round(sp.x / BUOY_SPACING) * BUOY_SPACING;
          const snapZ = Math.round(sp.z / BUOY_SPACING) * BUOY_SPACING;
          const bg = ctx.current.buoyGroup;
          if (Math.abs(bg.position.x - snapX) > BUOY_SPACING ||
              Math.abs(bg.position.z - snapZ) > BUOY_SPACING) {
            bg.position.x = snapX;
            bg.position.z = snapZ;
          }
        }

        // 빙하 재생성: 선박이 빙하 중심에서 60km 이상 떨어지면 선박 주변에 다시 생성
        if (shipGroup3 && ctx.current.tIcebergs) {
          const sp = shipGroup3.position;
          const cx = ctx.current.icebergCenterX || 0;
          const cz = ctx.current.icebergCenterZ || 0;
          const d2 = (sp.x - cx) * (sp.x - cx) + (sp.z - cz) * (sp.z - cz);
          if (d2 > 60000 * 60000) {
            buildIcebergs(sp.x, sp.z);
            // 위도 60°N 이상일 때만 빙하 표시 (저위도 깜빡임 방지)
            const curLat = (shipState && typeof shipState.lat === 'number')
              ? shipState.lat
              : 70;
            const showIce = manualMode || curLat >= 60;
            for (const ice of ctx.current.tIcebergs) {
              ice.grp.visible = showIce;
            }
          }
        }

        // 배 heading 부드러운 보간 (FOLLOW/자동 모드에서만 — 수동 모드는 App.jsx에서 직접 설정)
        if (shipGroup3 && shipState && !manualMode) {
          const headingRad = (-(shipState.heading || 0) * Math.PI) / 180;
          let diff = headingRad - shipGroup3.rotation.y;
          while (diff < -Math.PI) diff += Math.PI * 2;
          while (diff > Math.PI) diff -= Math.PI * 2;
          shipGroup3.rotation.y += diff * 0.03;
        }

        // ── 아라온 위치/rotation 매 프레임 갱신 (모드별 타겟 계산 + 전환 lerp) ──
        {
          const c = ctx.current;
          const aGrp = c.araonGroup;
          if (aGrp && aGrp.visible && c.shipGroup3 && c.araonMode) {
            const sp = c.shipGroup3.position;
            const shipRy = c.shipGroup3.rotation.y;

            // 1) 현재 타겟 위치/회전 계산 (모드별)
            let targetX = 0;
            let targetZ = 0;
            let targetRy = 0;
            if (c.araonMode === 'escort' && c.araonEscortConfig) {
              const cfg = c.araonEscortConfig;
              const fx = -Math.sin(shipRy);
              const fz = -Math.cos(shipRy);
              const rx = Math.cos(shipRy);
              const rz = -Math.sin(shipRy);
              targetX = sp.x + fx * cfg.forwardM + rx * cfg.sideM;
              targetZ = sp.z + fz * cfg.forwardM + rz * cfg.sideM;
              targetRy = shipRy;
            } else if (c.araonMode === 'dock' && c.araonDockDelta) {
              const dd = c.araonDockDelta;
              const M_PER_LAT = 111132.954;
              const M_PER_LON = 111319.491 * Math.cos((dd.refLat * Math.PI) / 180);
              const SCALE = 1.5;
              targetX = sp.x + (dd.deltaLonDeg * M_PER_LON) / SCALE;
              targetZ = sp.z + (-dd.deltaLatDeg * M_PER_LAT) / SCALE;
              targetRy = -(dd.headingDeg * Math.PI) / 180;
            }

            // 2) 전환 진행도 계산
            const dur = c.araonTransitionDuration || 2500;
            const startSnap = c.araonTransitionStart;
            if (startSnap) {
              const elapsed = now - c.araonTransitionStartTime;
              let t = Math.min(1, elapsed / dur);
              // easeInOutCubic
              const eased =
                t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
              aGrp.position.x = startSnap.x + (targetX - startSnap.x) * eased;
              aGrp.position.z = startSnap.z + (targetZ - startSnap.z) * eased;
              // rotation은 각도 wrap 고려
              let rotDiff = targetRy - startSnap.rotY;
              while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
              while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
              aGrp.rotation.y = startSnap.rotY + rotDiff * eased;
              if (t >= 1) {
                c.araonTransitionStart = null; // 전환 완료
              }
            } else {
              // 전환 없음 — 직접 타겟으로
              aGrp.position.x = targetX;
              aGrp.position.z = targetZ;
              aGrp.rotation.y = targetRy;
            }
          }
        }

        // ── Wake ribbon (선미뷰 전용 궤적 리본) 업데이트 ────────────
        // FOLLOW 모드에서만 visible + 포인트 push.
        // 다른 모드로 나가면 정리하고 숨김.
        {
          const c = ctx.current;
          const wake = c.wakeLine;
          if (wake) {
            if (mode === 'FOLLOW' && shipGroup3) {
              wake.visible = true;
              // 0.12s 마다 포인트 추가 (너무 조밀하지 않게)
              const nowMs = now;
              if (nowMs - c.wakeLastT > 120) {
                const sp = shipGroup3.position;
                // 선미 방향으로 선체 뒤에 살짝 오프셋
                const ry = shipGroup3.rotation.y;
                const backOff = 30; // 선박 길이의 반 정도
                const px = sp.x + Math.sin(ry) * backOff;
                const pz = sp.z + Math.cos(ry) * backOff;
                const py = SHIP_BASE_Y + 0.3;
                const last = c.wakeLastPos;
                const moved = !last ||
                  Math.abs(last.x - px) + Math.abs(last.z - pz) > 1.0;
                if (moved) {
                  const positions = c.wakePositions;
                  const colors = c.wakeColors;
                  const max = c.wakeMaxPoints;
                  // Shift 하지 않고 ring-buffer 스타일로 처리하되,
                  // Line 렌더는 index 0..count 순서를 기대하므로 shift 방식 유지.
                  // count < max: append
                  // count == max: 앞 한 포인트 제거 후 append
                  if (c.wakeCount < max) {
                    const idx = c.wakeCount * 3;
                    positions[idx] = px;
                    positions[idx + 1] = py;
                    positions[idx + 2] = pz;
                    c.wakeCount += 1;
                  } else {
                    for (let i = 0; i < max - 1; i += 1) {
                      const dst = i * 3;
                      const src = (i + 1) * 3;
                      positions[dst] = positions[src];
                      positions[dst + 1] = positions[src + 1];
                      positions[dst + 2] = positions[src + 2];
                    }
                    const idx = (max - 1) * 3;
                    positions[idx] = px;
                    positions[idx + 1] = py;
                    positions[idx + 2] = pz;
                  }
                  // Color: 꼬리로 갈수록 페이드 (cyan → dark)
                  for (let i = 0; i < c.wakeCount; i += 1) {
                    const t = i / Math.max(1, c.wakeCount - 1); // 0(tail)..1(head)
                    const idx = i * 3;
                    colors[idx] = 0.1 + t * 0.15;         // R
                    colors[idx + 1] = 0.55 + t * 0.35;    // G
                    colors[idx + 2] = 0.70 + t * 0.25;    // B
                  }
                  c.wakeGeo.attributes.position.needsUpdate = true;
                  c.wakeGeo.attributes.color.needsUpdate = true;
                  c.wakeGeo.setDrawRange(0, c.wakeCount);
                  c.wakeGeo.computeBoundingSphere();
                  c.wakeLastT = nowMs;
                  c.wakeLastPos = { x: px, z: pz };
                }
              }
            } else if (wake.visible) {
              // FOLLOW 벗어남 → 숨김 + 버퍼 리셋 (다음 진입 시 새 궤적)
              wake.visible = false;
              c.wakeCount = 0;
              c.wakeLastPos = null;
              c.wakeGeo.setDrawRange(0, 0);
            }
          }
        }

        // FOLLOW 카메라 — 오빗 드래그 + 부드러운 줌
        if (mode === 'FOLLOW' && camera && shipGroup3) {
          followZoomCurrentRef.current +=
            (followZoomTargetRef.current - followZoomCurrentRef.current) * 0.06;
          const dist = followZoomCurrentRef.current;
          const shipPos = shipGroup3.position;
          const ry = shipGroup3.rotation.y; // 선박 회전각
          const orbit = orbitRef.current;

          // 선미 기준 월드 각도 + 오빗 yaw 오프셋
          // //* [Modified Code] Math.PI/2 오프셋을 제거하고 선박의 -Z(Front) 기준 일치하도록 삼각함수 위상(Math.sin/cos) 교정
          const angle = ry + orbit.yaw;
          const pitch = orbit.pitch; // 0=수평, 양수=위

          // //! [Original Code]
          //           let followHeightOffset = 15;
          //           let lookAtYOffset = 35;
          //           if (specs?.type === 'lng') {
          //             followHeightOffset = 55; lookAtYOffset = 80;
          //           } else if (specs?.type === 'container') {
          //             followHeightOffset = 70; lookAtYOffset = 75;
          //           }
          // //* [Modified Code] 선미 추적 모드 시점(높이 및 주시점) 2차 상향 조정 (쾌적한 시야 확보)
          let followHeightOffset = 50;
          let lookAtYOffset = 60;
          if (specs?.type === 'lng') {
            followHeightOffset = 120;
            lookAtYOffset = 180;
          } else if (specs?.type === 'container') {
            followHeightOffset = 100;
            lookAtYOffset = 140;
          }

          const MathMax = Math.max;
          const camX = shipPos.x + Math.sin(angle) * dist * Math.cos(pitch);
          const camZ = shipPos.z + Math.cos(angle) * dist * Math.cos(pitch);
          const camY =
            shipPos.y +
            SHIP_BASE_Y +
            dist * 0.04 +
            followHeightOffset +
            Math.sin(pitch) * dist * 0.5;

          camera.position.set(
            camX,
            MathMax(SHIP_BASE_Y + followHeightOffset * 0.5, camY),
            camZ,
          );
          camera.lookAt(
            shipPos.x,
            shipPos.y + SHIP_BASE_Y * 1.4 + lookAtYOffset,
            shipPos.z,
          );

          const pitchLerp = Math.min(1, dist / 1500);
          camera.fov = 75 - pitchLerp * 20;
          camera.updateProjectionMatrix();
        }

        renderer.render(scene, camera);
      } catch (e) {
        /* ignore */
      }
    }
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [visible, animateOcean, mode, shipState, manualMode, buildIcebergs]);

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
