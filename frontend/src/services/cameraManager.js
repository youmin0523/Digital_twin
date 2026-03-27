// ═══════════════════════════════════════════════════════════════
// Camera Manager — view inertia, target computation, application
// Extracted from arctic-hybrid.html lines 4704-4940
// ═══════════════════════════════════════════════════════════════

// ─── Camera constants / initial state defaults ────────────────

export const CAMERA_DEFAULTS = {
  manViewTgtYaw: 0,
  manViewTgtPitch: 0,
  manYawVel: 0,
  manPitchVel: 0,
  manViewYaw: 0,
  manViewPitch: 0,
  camTgtYaw: 0,
  camTgtPitch: 0,
  camYawVel: 0,
  camPitchVel: 0,
  camYaw: 0,
  camPitch: 0,
  zoomCurrent: 0,
  zoomTarget: 0,
  fovCurrent: 65,
  fovTarget: 65,
  camRoll: 0,
  camRollTarget: 0,
  cameraInShip: false,
  followCamInit: false,
};

// ─── View inertia (mouse drag momentum) ──────────────────────

/**
 * Apply inertia to yaw/pitch from mouse drag.
 * Call once per frame.
 *
 * @param {Object} state - Mutable camera state (see CAMERA_DEFAULTS fields)
 * @param {boolean} mDown - Whether mouse button is currently pressed
 */
export function updateViewInertia(state, mDown) {
  if (!mDown) {
    state.manViewTgtYaw += state.manYawVel;
    state.manViewTgtPitch = Math.max(
      -Math.PI / 3,
      Math.min(Math.PI / 6, state.manViewTgtPitch + state.manPitchVel),
    );
    state.manYawVel *= 0.88;
    state.manPitchVel *= 0.88;
    if (Math.abs(state.manYawVel) < 5e-5) state.manYawVel = 0;
    if (Math.abs(state.manPitchVel) < 5e-5) state.manPitchVel = 0;
    state.camTgtYaw += state.camYawVel;
    state.camTgtPitch = Math.max(
      -1.4,
      Math.min(1.4, state.camTgtPitch + state.camPitchVel),
    );
    state.camYawVel *= 0.88;
    state.camPitchVel *= 0.88;
    if (Math.abs(state.camYawVel) < 5e-5) state.camYawVel = 0;
    if (Math.abs(state.camPitchVel) < 5e-5) state.camPitchVel = 0;
  }
  state.manViewYaw += (state.manViewTgtYaw - state.manViewYaw) * 0.1;
  state.manViewPitch += (state.manViewTgtPitch - state.manViewPitch) * 0.1;
  state.camYaw += (state.camTgtYaw - state.camYaw) * 0.1;
  state.camPitch += (state.camTgtPitch - state.camPitch) * 0.1;
}

// ─── Compute target camera position / FOV ─────────────────────

/**
 * Compute the target camera position, look-at, and FOV each frame.
 *
 * @param {Object} params - Object with:
 *   THREE          - THREE.js library reference
 *   THREE_MODES    - Set of 3D mode names
 *   currentMode    - Current view mode string
 *   tCamera        - THREE.PerspectiveCamera
 *   state          - Mutable camera state (zoomCurrent, zoomTarget, fovCurrent, fovTarget, ...)
 *   isManual       - Manual steering active
 *   keys           - Keyboard state map
 *   currentDt      - Frame delta time
 *   computeFovTarget - Function returning target FOV
 *   binocularsActive - Boolean
 *   camTargetPos   - THREE.Vector3 target position
 *   camTargetLook  - THREE.Vector3 look-at target
 *   ZOOM_MAX       - Max zoom value
 *   ZOOM_MIN       - Min zoom value (negative)
 */
export function computeTargetCamera(params) {
  const {
    THREE_MODES, currentMode, tCamera, state,
    isManual, keys, currentDt, computeFovTarget, binocularsActive,
    camTargetPos, camTargetLook, ZOOM_MAX, ZOOM_MIN,
  } = params;

  if (!THREE_MODES.has(currentMode)) return;
  state.zoomCurrent += (state.zoomTarget - state.zoomCurrent) * 0.12;

  // ── FOV lerp ─────────────────────────────────────────────────
  state.fovTarget = computeFovTarget();
  // 쌍안경 해제 직후(fovCurrent 낮을 때)는 빠르게 복귀
  const fovLerpRate = binocularsActive
    ? 0.15
    : state.fovCurrent < 40
      ? 0.08
      : 0.04;
  state.fovCurrent += (state.fovTarget - state.fovCurrent) * fovLerpRate;

  if (currentMode === 'BRIDGE') {
    // BRIDGE 모드(자동·수동 모두): cameraPivot3 계층으로 처리 → applyCamera()에서 담당
    tCamera.fov = isManual ? state.fovCurrent : 75;
    tCamera.updateProjectionMatrix();
    return;
  }

  if (currentMode === 'FOLLOW') {
    // FOLLOW는 updateFollowCamera()가 전담 — FOV만 여기서 설정
    tCamera.fov = 65;
    tCamera.updateProjectionMatrix();
    return;
  }

  if (!isManual) {
    tCamera.fov = currentMode === 'BRIDGE' ? 75 : 65;
    const fast = keys['ShiftLeft'] || keys['ShiftRight'];
    const spd = 300 * (fast ? 5 : 1);

    // Temporary vectors (allocated per call; for performance, hoist to module scope if needed)
    const _fwd = { x: 0, y: 0, z: 0 };
    const fx = Math.sin(state.camYaw) * Math.cos(state.camPitch);
    const fy = Math.sin(state.camPitch);
    const fz = -Math.cos(state.camYaw) * Math.cos(state.camPitch);
    const fLen = Math.sqrt(fx * fx + fy * fy + fz * fz) || 1;
    _fwd.x = fx / fLen; _fwd.y = fy / fLen; _fwd.z = fz / fLen;

    // _right = cross(_fwd, up(0,1,0))
    const rx = _fwd.z; // fy*0 - fz*1 => -fz but we use _fwd normalized
    const rz = -_fwd.x;
    const rLen = Math.sqrt(rx * rx + rz * rz) || 1;
    const _right = { x: rx / rLen, y: 0, z: rz / rLen };

    if (keys['KeyW'] || keys['ArrowUp']) {
      camTargetPos.x += _fwd.x * spd * currentDt;
      camTargetPos.y += _fwd.y * spd * currentDt;
      camTargetPos.z += _fwd.z * spd * currentDt;
    }
    if (keys['KeyS'] || keys['ArrowDown']) {
      camTargetPos.x -= _fwd.x * spd * currentDt;
      camTargetPos.y -= _fwd.y * spd * currentDt;
      camTargetPos.z -= _fwd.z * spd * currentDt;
    }
    if (keys['KeyA'] || keys['ArrowLeft']) {
      camTargetPos.x -= _right.x * spd * currentDt;
      camTargetPos.z -= _right.z * spd * currentDt;
    }
    if (keys['KeyD'] || keys['ArrowRight']) {
      camTargetPos.x += _right.x * spd * currentDt;
      camTargetPos.z += _right.z * spd * currentDt;
    }
    if (keys['KeyQ']) camTargetPos.y -= spd * currentDt;
    if (keys['KeyE'] || keys['Space']) camTargetPos.y += spd * currentDt;
    if (camTargetPos.y < 1) camTargetPos.y = 1;

    camTargetLook.x = camTargetPos.x + _fwd.x * 1000;
    camTargetLook.y = camTargetPos.y + _fwd.y * 1000;
    camTargetLook.z = camTargetPos.z + _fwd.z * 1000;
    state.camRollTarget = 0;
  }
  tCamera.updateProjectionMatrix();
}

// ─── Apply camera transforms ──────────────────────────────────

/**
 * Apply computed camera state to the Three.js camera each frame.
 *
 * @param {Object} params - Object with:
 *   THREE_MODES, currentMode, tCamera, tScene,
 *   state (cameraInShip, zoomCurrent, camRoll, camRollTarget, screenShakeT, ...),
 *   isManual, shipMesh3, shipRoll, shipPitch, shipHeave, impactRoll, impactPitch,
 *   cameraPivot3, manViewYaw, manViewPitch, camYaw, camPitch,
 *   camCurrentPos, camCurrentLook, camTargetPos, camTargetLook,
 *   ZOOM_MAX, ZOOM_MIN,
 *   updateFollowCameraFn - The updateFollowCamera function
 */
export function applyCamera(params) {
  const {
    THREE_MODES, currentMode, tCamera, tScene,
    state, isManual,
    shipMesh3, shipRoll, shipPitch, shipHeave, impactRoll, impactPitch,
    cameraPivot3, shipGroup3,
    camCurrentPos, camCurrentLook, camTargetPos, camTargetLook,
    ZOOM_MAX, ZOOM_MIN,
    updateFollowCameraFn,
  } = params;

  if (!THREE_MODES.has(currentMode)) return;

  // ── 1. 선박 mesh에 roll/pitch 적용 (카메라 아님!) ─────────────────
  if (shipMesh3) {
    shipMesh3.rotation.order = 'YXZ';
    shipMesh3.rotation.z = shipRoll + impactRoll;
    shipMesh3.rotation.x = shipPitch + impactPitch;
    shipMesh3.position.y = shipHeave;
  }

  // ── 2. 선교 창틀 오버레이 CSS tilt ────────────────────────────────
  const bridgeFrame = document.getElementById('bridge-frame');
  if (bridgeFrame) {
    if (currentMode === 'BRIDGE' && isManual)
      bridgeFrame.style.transform = `rotate(${(shipRoll + impactRoll) * 0.3}rad)`;
    else bridgeFrame.style.transform = '';
  }

  // ── 3. BRIDGE 모드(자동·수동 모두): cameraPivot3 계층에 붙임 ─────
  if (currentMode === 'BRIDGE') {
    if (!state.cameraInShip) {
      cameraPivot3.add(tCamera);
      state.cameraInShip = true;
    }
    // 줌에 따른 선교 위치 (cameraPivot3 로컬)
    const zR =
      state.zoomCurrent > 0 ? state.zoomCurrent / ZOOM_MAX : -state.zoomCurrent / ZOOM_MIN;
    const camH = isManual
      ? state.zoomCurrent >= 0
        ? 18 + zR * 120
        : Math.max(10, 18 - zR * 13)
      : 18;
    cameraPivot3.position.set(
      0,
      camH,
      isManual ? Math.min(80, Math.max(-75, -10 + state.zoomCurrent)) : -10,
    );
    // 마우스 시야 — 수동: manViewYaw/Pitch, 자동: camYaw/camPitch (mouse drag)
    const pivotYaw = isManual ? state.manViewYaw : state.camYaw;
    const pivotPitch = isManual ? state.manViewPitch : state.camPitch;
    cameraPivot3.rotation.order = 'YXZ';
    cameraPivot3.rotation.y = pivotYaw;
    cameraPivot3.rotation.x = pivotPitch;
    cameraPivot3.rotation.z = 0;
    // 카메라 자체는 완전히 고정
    tCamera.position.set(0, 0, 0);
    tCamera.rotation.set(0, 0, 0);
    if (state.screenShakeT > 0) {
      const amp = state.screenShakeT * 10;
      tCamera.position.x += (Math.random() - 0.5) * amp;
      tCamera.position.y += (Math.random() - 0.5) * amp * 0.5;
    }
    return;
  }

  // ── 4. FOLLOW/자유 모드: 카메라를 세계좌표(tScene)로 복귀 ──────────
  if (state.cameraInShip) {
    tScene.add(tCamera);
    state.cameraInShip = false;
  }

  // FOLLOW 모드: 전용 lerp 카메라 함수로 위임
  if (currentMode === 'FOLLOW') {
    updateFollowCameraFn();
    return;
  }

  // 자유시점(자동 항로 비-FOLLOW) 카메라
  const lerpF = 0.06;
  camCurrentPos.lerp(camTargetPos, lerpF);
  camCurrentLook.lerp(camTargetLook, lerpF);
  state.camRoll += (state.camRollTarget - state.camRoll) * 0.04;
  tCamera.position.copy(camCurrentPos);

  const dir = camCurrentLook.clone().sub(camCurrentPos).normalize();
  const yaw = Math.atan2(dir.x, -dir.z);
  const pitch = Math.asin(Math.max(-1, Math.min(1, dir.y)));
  tCamera.rotation.order = 'YXZ';
  tCamera.rotation.y = yaw;
  tCamera.rotation.x = pitch + (shipPitch + impactPitch) * 0.3;
  tCamera.rotation.z = state.camRoll + (shipRoll + impactRoll) * 0.3;
  tCamera.position.y += shipHeave * 0.3;
  if (state.screenShakeT > 0) {
    const amp = state.screenShakeT * 10;
    tCamera.position.x += (Math.random() - 0.5) * amp;
    tCamera.position.y += (Math.random() - 0.5) * amp * 0.5;
  }
}

// ─── Follow camera (stern tracking) ──────────────────────────

/**
 * Update the FOLLOW-mode camera (stern tracking).
 *
 * @param {Object} params - Object with:
 *   shipGroup3, isManual, shipHeading, simProgress,
 *   routeHeadingFn(p) - function returning heading at progress p,
 *   state (zoomCurrent, screenShakeT, followCamInit, ...),
 *   ZOOM_MAX, ZOOM_MIN,
 *   tCamera,
 *   shipPitch, impactPitch, shipHeave,
 *   followCamTarget   - THREE.Vector3
 *   followLookTarget  - THREE.Vector3
 *   followCamCurrent  - THREE.Vector3
 *   followLookCurrent - THREE.Vector3
 */
export function updateFollowCamera(params) {
  const {
    shipGroup3, isManual, shipHeading, simProgress,
    routeHeadingFn, state,
    ZOOM_MAX, ZOOM_MIN,
    tCamera, shipPitch, impactPitch, shipHeave,
    followCamTarget, followLookTarget, followCamCurrent, followLookCurrent,
  } = params;

  if (!shipGroup3) return;
  const heading = isManual ? shipHeading : routeHeadingFn(simProgress);
  const sp = shipGroup3.position;

  // 거리/높이: 줌 반영
  const followDist = state.zoomCurrent < 0
    ? 600 + (state.zoomCurrent / -ZOOM_MIN) * 450
    : 600 + (state.zoomCurrent / ZOOM_MAX) * 1400;
  const followH = Math.max(50, followDist * 0.3);

  // 목표 위치: 선미(뒤) followDist m, 위 followH m
  followCamTarget.set(
    sp.x - Math.sin(heading) * followDist,
    sp.y + followH,
    sp.z + Math.cos(heading) * followDist,
  );

  // lookAt 목표: 선박 위 20m + 파도 pitch 30% 반영(수직 오프셋만)
  followLookTarget.set(
    sp.x,
    sp.y + 20 + (shipPitch + impactPitch) * 10,
    sp.z,
  );

  // 모드 진입 첫 프레임: 즉시 이동(lerp 건너뜀)
  if (!state.followCamInit) {
    followCamCurrent.copy(followCamTarget);
    followLookCurrent.copy(followLookTarget);
    state.followCamInit = true;
  }

  // 부드러운 lerp
  followCamCurrent.lerp(followCamTarget, 0.05);
  followLookCurrent.lerp(followLookTarget, 0.05);

  tCamera.position.copy(followCamCurrent);
  tCamera.position.y += shipHeave * 0.3;
  if (state.screenShakeT > 0) {
    const amp = state.screenShakeT * 10;
    tCamera.position.x += (Math.random() - 0.5) * amp;
    tCamera.position.y += (Math.random() - 0.5) * amp * 0.5;
  }
  tCamera.up.set(0, 1, 0);
  tCamera.lookAt(followLookCurrent);
}
