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
  { visible, shipState, specs, mode, baseRef },
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
    (shipType = 'icebreaker') => {
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

      if (shipType === 'icebreaker') {
        // 🧊 [ICEBREAKER] 육중하고 강인한 쇄빙선
        // 선체 보정: 더 날카로운 선수와 육중한 볼륨
        mkH(new THREE.BoxGeometry(32, 12, 170), C.iceRed, 0, 0, 10);
        mkH(new THREE.BoxGeometry(33, 5, 175), C.iceDark, 0, -6, 5);

        // 쇄빙용 특수 선수 (Spoon Bow 스타일)
        for (let i = 0; i < 5; i++) {
          const s = 1 - i * 0.15;
          mkH(
            new THREE.BoxGeometry(32 * s, 3, 15),
            C.iceRed,
            0,
            -1 - i * 1.5,
            -80 - i * 4,
          );
        }
        mkH(
          new THREE.CylinderGeometry(0, 18, 30, 4),
          C.iceRed,
          0,
          0,
          -95,
          0,
          Math.PI / 4,
        );

        // 상부 구조물: 레이어드 디자인
        mkU(new THREE.BoxGeometry(26, 12, 60), C.white, 0, 12, -30);
        mkU(new THREE.BoxGeometry(24, 8, 40), C.white, 0, 22, -35); // 2단
        mkU(new THREE.BoxGeometry(30, 6, 20), C.white, 0, 28, -45); // 브릿지 윙 확장
        mkU(new THREE.BoxGeometry(28, 4, 18), C.window, 0, 28.5, -46); // 파노라마 창

        // 정밀 마스트 및 레이더
        mkU(new THREE.CylinderGeometry(0.8, 1.2, 25, 8), C.dark, 0, 40, -40);
        for (let i = 0; i < 3; i++) {
          mkU(
            new THREE.BoxGeometry(10 - i * 2, 0.5, 3),
            C.dark,
            0,
            35 + i * 5,
            -40,
          ); // 마스트 횡단보도
        }
        // 회전 레이더 가이드
        mkU(new THREE.BoxGeometry(8, 1, 2), C.gold, 0, 52, -40);

        // 선미 헬기 데크 및 안전 난간
        mkH(new THREE.BoxGeometry(30, 1, 50), C.deck, 0, 6.5, 60);
        mkH(
          new THREE.BoxGeometry(20, 0.1, 20),
          C.white,
          0,
          7.1,
          60,
          0,
          Math.PI / 4,
        ); // 정교한 H
        for (let i = -1; i <= 1; i += 2) {
          mkH(new THREE.BoxGeometry(0.5, 2, 50), C.dark, 14.5 * i, 8, 60); // 난간
        }

        // 대형 크레인 (Hydraulic 스타일)
        mkU(new THREE.CylinderGeometry(2, 2.5, 6, 12), C.dark, 8, 8, 20);
        mkU(new THREE.BoxGeometry(1.5, 1.5, 45), C.dark, 8, 18, 40, 0.5);
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

      function addLand(lat1, lon1, lat2, lon2, h, color) {
        const p1 = ll(lat1, lon1);
        const p2 = ll(lat2, lon2);
        const w = Math.abs(p2.x - p1.x);
        const d = Math.abs(p2.z - p1.z);
        if (w < 100 || d < 100) return;
        const geo = trackDisposable(new THREE.BoxGeometry(w, h, d));
        const mat = trackDisposable(
          new THREE.MeshPhongMaterial({ color, shininess: 5 }),
        );
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
    if (mode === 'BRIDGE') {
      camera.fov = 90;
      camera.near = 0.01;
      camera.position.set(0, 35, 10);
      camera.lookAt(0, 15, -500);
      camera.updateProjectionMatrix();
    } else if (mode === 'FOLLOW') {
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
    let rafId;
    function loop(now) {
      rafId = requestAnimationFrame(loop);
      const { renderer, scene, camera, shipGroup3 } = ctx.current;
      if (!renderer || !scene || !camera) return;
      try {
        const t = now * 0.001;
        // //* [Modified Code] 바다(파도) 평면이 선박의 물리 이동을 따라다니도록 shipGroup3.position 위치 전달
        animateOcean(t, shipGroup3 ? shipGroup3.position : null);

        // 배 heading 부드러운 보간 (FOLLOW/자동 모드)
        if (shipGroup3 && shipState) {
          const headingRad = (-(shipState.heading || 0) * Math.PI) / 180;
          let diff = headingRad - shipGroup3.rotation.y;
          while (diff < -Math.PI) diff += Math.PI * 2;
          while (diff > Math.PI) diff -= Math.PI * 2;
          shipGroup3.rotation.y += diff * 0.03;
        }

        // BRIDGE 카메라 — 선박 위치/방향에 맞춰 매 프레임 갱신
        if (mode === 'BRIDGE' && camera && shipGroup3) {
          const pos = shipGroup3.position;
          const ry = shipGroup3.rotation.y;

          // //! [Original Code]
          //           let localY = 32;
          //           let localZ = -46;
          //           if (specs?.type === 'lng') {
          //             localY = 55; localZ = 110;
          //           } else if (specs?.type === 'container') {
          //             localY = 58; localZ = 50;
          //           } else {
          //             localY = 36; localZ = -20; // 쇄빙선도 마스트에 가리지 않도록 약간 뒤로 후퇴
          //           }
          //           localY *= 1.4;
          //           localZ *= 1.4;
          // //! [Original Code]
          //           let localY = 45;
          //           let localZ = -30;
          //           if (specs?.type === 'lng') {
          //             localY = 75; localZ = 150;
          //           } else if (specs?.type === 'container') {
          //             localY = 80; localZ = 70;
          //           }
          // //* [Modified Code] 사용자의 요청에 따라 선교 시점을 뱃머리(Bow) 쪽으로 더 전진 배치 (localZ 상향 조정)
          let localY = 45;
          let localZ = -60;
          if (specs?.type === 'lng') {
            localY = 75;
            localZ = 110;
          } else if (specs?.type === 'container') {
            localY = 80;
            localZ = 20;
          }
          localY *= 2.0;
          localZ *= 2.0;

          const bx = pos.x + localZ * Math.sin(ry);
          const bz = pos.z + localZ * Math.cos(ry);
          camera.position.set(bx, pos.y + SHIP_BASE_Y + localY, bz);
          camera.lookAt(
            pos.x - Math.sin(ry) * 600,
            pos.y + SHIP_BASE_Y + localY - 35, // 뱃머리가 시야 하단에 웅장하게 걸리도록 시선을 4~5도 아래로 내림
            pos.z - Math.cos(ry) * 600,
          );
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
