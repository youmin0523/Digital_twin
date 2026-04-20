/**
 * VoyagePlaybackLayer.jsx
 * =======================
 * Cesium viewer 에 본선 1척 + 쇄빙선 5척 entity 를 생성·갱신하는
 * headless 컴포넌트. DOM 출력 없음, 사이드 이펙트만.
 *
 * 부모는 `cesiumRef` (CesiumGlobe ref) 와 playback state 를 props 로 주입.
 */

import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import {
  sampleShipAt,
  sampleIcebreakersAt,
  ICEBREAKER_META,
} from '../../services/voyageTrace';

// RIO 색상 스케일 (본선 tint)
function rioColor(rio) {
  if (rio >= 0) return Cesium.Color.fromCssColorString('#4ade80');
  if (rio >= -3) return Cesium.Color.fromCssColorString('#facc15');
  if (rio >= -6) return Cesium.Color.fromCssColorString('#fb923c');
  return Cesium.Color.fromCssColorString('#ef4444');
}

// 쇄빙선 상태 색상
const IB_STATUS_COLOR = {
  idle: '#9ca3af',
  dispatched: '#facc15',
  rendezvous: '#fb923c',
  escorting: '#ef4444',
  released: '#3b82f6',
};

function ibStatusColor(status) {
  return Cesium.Color.fromCssColorString(
    IB_STATUS_COLOR[status] || '#9ca3af',
  );
}

// 두 좌표 사이의 bearing(0=북, 90=동) 계산 — billboard 회전용
function bearingDeg(lat1, lon1, lat2, lon2) {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(y, x);
  return ((θ * 180) / Math.PI + 360) % 360;
}

// billboard 용 canvas — 빨간 선체 + 흰색 브리지 + 주황 악센트 icebreaker
// (CCGS Louis S. St-Laurent / Vaygach 스타일). 64x96.
// 위에서 내려다본 top-down view, 뱃머리가 위쪽(canvas y=0).
function makeIbCanvas() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 96;
  const ctx = c.getContext('2d');

  // 빨간 선체 — 쇄빙선 특유의 길쭉한 선형
  ctx.fillStyle = '#c0392b';
  ctx.beginPath();
  ctx.moveTo(32, 4);          // bow tip
  ctx.lineTo(48, 16);         // bow shoulder right
  ctx.lineTo(50, 78);         // stern shoulder right
  ctx.lineTo(46, 90);         // stern right
  ctx.lineTo(18, 90);         // stern left
  ctx.lineTo(14, 78);         // stern shoulder left
  ctx.lineTo(16, 16);         // bow shoulder left
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // 뱃머리 흰 물 보강선 (reinforced bow line)
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(20, 22);
  ctx.lineTo(32, 10);
  ctx.lineTo(44, 22);
  ctx.stroke();

  // 전방 갑판(흰색) — 헬리패드 구역
  ctx.fillStyle = '#ecf0f1';
  ctx.beginPath();
  ctx.ellipse(32, 30, 10, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#2c3e50';
  ctx.lineWidth = 0.8;
  ctx.stroke();
  // H 마크
  ctx.fillStyle = '#2c3e50';
  ctx.font = 'bold 9px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('H', 32, 31);

  // 흰색 상부구조 (superstructure / bridge block)
  ctx.fillStyle = '#ecf0f1';
  ctx.fillRect(20, 42, 24, 26);
  ctx.strokeStyle = '#2c3e50';
  ctx.lineWidth = 1;
  ctx.strokeRect(20, 42, 24, 26);

  // 브리지 창문 띠 (파랑)
  ctx.fillStyle = '#2980b9';
  ctx.fillRect(22, 45, 20, 3);

  // 주황색 악센트 — 구명정/funnel 베이스
  ctx.fillStyle = '#e67e22';
  ctx.fillRect(22, 52, 8, 4);
  ctx.fillRect(34, 52, 8, 4);

  // funnel (중앙)
  ctx.fillStyle = '#ecf0f1';
  ctx.fillRect(28, 58, 8, 8);
  ctx.strokeStyle = '#2c3e50';
  ctx.strokeRect(28, 58, 8, 8);
  // funnel top 빨강 줄
  ctx.fillStyle = '#c0392b';
  ctx.fillRect(28, 58, 8, 2);

  // 후방 갑판 크레인/윈치
  ctx.fillStyle = '#f39c12';
  ctx.fillRect(29, 72, 6, 12);

  return c;
}

// (본선 캔버스 함수 삭제 — 기존 CesiumGlobe.updateShipEntity 재사용)

export default function VoyagePlaybackLayer({ cesiumRef, trace, tHours, active }) {
  const ibEntitiesRef = useRef({}); // id → entity
  const lastTickLogRef = useRef(0);
  const ibCanvasRef = useRef(null);
  const lastIbPosRef = useRef({});  // id → {lat, lon} (직전 tick 위치 — heading 계산용)
  const lastShipPosRef = useRef(null); // 본선 직전 위치 (heading 계산용)

  // entity 생성 (trace 로드 시점)
  useEffect(() => {
    if (!active || !trace) return undefined;
    const viewer =
      cesiumRef && cesiumRef.current && cesiumRef.current.getViewer
        ? cesiumRef.current.getViewer()
        : null;
    if (!viewer) {
      // viewer 아직 준비 안 됨 — 다음 업데이트에서 재시도
      return undefined;
    }

    // canvas 캐싱 (아라온만)
    ibCanvasRef.current = makeIbCanvas();

    // 본선은 별도 entity 안 만듦 — 기존 CesiumGlobe 의 updateShipEntity 가
    // 그린 본선 (ship-vessel) 을 재활용해서 voyage tHours 위치로 옮긴다.
    const firstTick = trace.ticks[0];
    if (cesiumRef.current && cesiumRef.current.updateShipEntity) {
      cesiumRef.current.updateShipEntity(
        firstTick.ship.position,
        0,
        { type: 'icebreaker' },
      );
    }

    // 쇄빙선 (아라온 1척)
    for (const ib of firstTick.icebreakers) {
      const meta = ICEBREAKER_META[ib.id] || { name_ko: ib.id };
      const e = viewer.entities.add({
        id: `voyage-${ib.id}`,
        position: Cesium.Cartesian3.fromDegrees(
          ib.position.lon,
          ib.position.lat,
          0,
        ),
        billboard: {
          image: ibCanvasRef.current,
          // 본선(54x108)보다 확실히 크게
          width: 80,
          height: 160,
          alignedAxis: Cesium.Cartesian3.UNIT_Z,
          rotation: 0,   // 첫 프레임은 heading 미정 — 다음 tick 부터 갱신
          color: ibStatusColor(ib.status),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
          scaleByDistance: new Cesium.NearFarScalar(
            5000, 1.8,
            500000, 0.6,
          ),
        },
        label: {
          text: meta.name_ko,
          font: 'bold 13px sans-serif',
          verticalOrigin: Cesium.VerticalOrigin.TOP,
          pixelOffset: new Cesium.Cartesian2(0, 28),
          fillColor: Cesium.Color.fromCssColorString('#22d3ee'),
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          showBackground: true,
          backgroundColor: Cesium.Color.fromCssColorString('#000000cc'),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      ibEntitiesRef.current[ib.id] = e;
    }

    // eslint-disable-next-line no-console
    console.log(
      `[VoyagePlayback] entities created: 1 ship + ${
        firstTick.icebreakers.length
      } icebreakers`,
    );
    // eslint-disable-next-line no-console
    console.log(
      `[VoyagePlayback] viewer.entities.values.length = ${viewer.entities.values.length}`,
    );

    // Wrangel Island + 베링해/척치해/동시베리아해 줌인 (액션 구역 집중)
    try {
      const araonInit = firstTick.icebreakers[0];
      // eslint-disable-next-line no-console
      console.log(
        `[VoyagePlayback] Araon initial position: lat=${araonInit.position.lat}, lon=${araonInit.position.lon} status=${araonInit.status}`,
      );
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(175.0, 72.0, 6000000),
        orientation: {
          heading: 0,
          pitch: -Cesium.Math.PI_OVER_TWO,
          roll: 0,
        },
        duration: 2.0,
      });
    } catch (e) {
      // 무시
    }

    return () => {
      // cleanup on unmount / trace swap — 아라온만 제거 (본선은 기존 entity 라
      // CesiumGlobe 가 관리)
      try {
        for (const id of Object.keys(ibEntitiesRef.current)) {
          viewer.entities.remove(ibEntitiesRef.current[id]);
        }
        ibEntitiesRef.current = {};
      } catch (e) {
        // viewer 이미 파괴됐을 수 있음 — 무시
      }
    };
  }, [cesiumRef, trace, active]);

  // 매 tHours 변경마다 position/color 갱신
  useEffect(() => {
    if (!active || !trace) return;
    const viewer =
      cesiumRef && cesiumRef.current && cesiumRef.current.getViewer
        ? cesiumRef.current.getViewer()
        : null;
    if (!viewer) return;

    const ship = sampleShipAt(trace, tHours);
    if (ship && cesiumRef.current && cesiumRef.current.updateShipEntity) {
      // 본선 heading 계산 (직전 위치 → 현재 위치)
      let shipHdg = 0;
      const lastShip = lastShipPosRef.current;
      if (
        lastShip &&
        (lastShip.lat !== ship.position.lat || lastShip.lon !== ship.position.lon)
      ) {
        shipHdg = bearingDeg(
          lastShip.lat,
          lastShip.lon,
          ship.position.lat,
          ship.position.lon,
        );
      }
      lastShipPosRef.current = { lat: ship.position.lat, lon: ship.position.lon };
      cesiumRef.current.updateShipEntity(
        ship.position,
        shipHdg,
        { type: 'icebreaker' },
      );
    }

    const ibs = sampleIcebreakersAt(trace, tHours);
    for (const ib of ibs) {
      const e = ibEntitiesRef.current[ib.id];
      if (!e) continue;
      e.position = Cesium.Cartesian3.fromDegrees(
        ib.position.lon,
        ib.position.lat,
        0,
      );
      e.billboard.color = ibStatusColor(ib.status);
      // heading: 직전 위치와의 bearing — 정지 시(같은 위치) 이전 rotation 유지
      const lastPos = lastIbPosRef.current[ib.id];
      if (
        lastPos &&
        (lastPos.lat !== ib.position.lat || lastPos.lon !== ib.position.lon)
      ) {
        const hdg = bearingDeg(
          lastPos.lat,
          lastPos.lon,
          ib.position.lat,
          ib.position.lon,
        );
        e.billboard.rotation = -Cesium.Math.toRadians(hdg);
      }
      lastIbPosRef.current[ib.id] = { lat: ib.position.lat, lon: ib.position.lon };
    }

    // 5 시뮬 시간당 샘플 로그
    const bucket = Math.floor(tHours / 5);
    if (bucket !== lastTickLogRef.current && ship && ibs.length > 0) {
      lastTickLogRef.current = bucket;
      const araon = ibs.find((x) => x.id === 'ib-araon');
      if (araon) {
        // eslint-disable-next-line no-console
        console.log(
          `[Tick] t=${tHours.toFixed(0)}h, ship=(${ship.position.lat.toFixed(2)}N, ${ship.position.lon.toFixed(2)}E), Araon=(${araon.position.lat.toFixed(2)}N, ${araon.position.lon.toFixed(2)}E) ${araon.status}`,
        );
      }
    }
  }, [cesiumRef, trace, tHours, active]);

  return null;
}
