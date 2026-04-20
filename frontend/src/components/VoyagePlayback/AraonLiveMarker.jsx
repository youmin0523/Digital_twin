/**
 * AraonLiveMarker.jsx
 * ===================
 * Live Simulation 모드에서 아라온을 표시.
 * - 본선이 결빙 수역(SIC>0.3)에 있을 때: 본선 바로 앞에 호위 위치로 따라붙음
 * - 그렇지 않을 때: Wrangel Island 사전배치 거점에 대기
 *
 * Voyage Playback 모드의 entity (id='voyage-ib-araon') 와 충돌 방지를 위해
 * 별도 id 'live-ib-araon' 사용.
 */

import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';

// Wrangel Island 사전배치 좌표 (backend models.py 와 동일)
const ARAON_HOME = { lat: 71.0, lon: 179.5 };

// 상태별 색상 (escorting 때 본선과 함께 강조)
// idle 도 위성영상 위에서 식별되도록 밝은 노랑 사용 (회색은 구름·해빙과 혼동)
const STATUS_COLOR = {
  idle: '#facc15',
  escorting: '#ef4444',
};

// 미니 쇄빙선 canvas (VoyagePlaybackLayer 와 동일 디자인)
function makeAraonCanvas() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 96;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#c0392b';
  ctx.beginPath();
  ctx.moveTo(32, 4);
  ctx.lineTo(48, 16);
  ctx.lineTo(50, 78);
  ctx.lineTo(46, 90);
  ctx.lineTo(18, 90);
  ctx.lineTo(14, 78);
  ctx.lineTo(16, 16);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(20, 22);
  ctx.lineTo(32, 10);
  ctx.lineTo(44, 22);
  ctx.stroke();
  ctx.fillStyle = '#ecf0f1';
  ctx.beginPath();
  ctx.ellipse(32, 30, 10, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#2c3e50';
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.fillStyle = '#2c3e50';
  ctx.font = 'bold 9px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('H', 32, 31);
  ctx.fillStyle = '#ecf0f1';
  ctx.fillRect(20, 42, 24, 26);
  ctx.strokeStyle = '#2c3e50';
  ctx.lineWidth = 1;
  ctx.strokeRect(20, 42, 24, 26);
  ctx.fillStyle = '#2980b9';
  ctx.fillRect(22, 45, 20, 3);
  ctx.fillStyle = '#e67e22';
  ctx.fillRect(22, 52, 8, 4);
  ctx.fillRect(34, 52, 8, 4);
  ctx.fillStyle = '#ecf0f1';
  ctx.fillRect(28, 58, 8, 8);
  ctx.strokeStyle = '#2c3e50';
  ctx.strokeRect(28, 58, 8, 8);
  ctx.fillStyle = '#c0392b';
  ctx.fillRect(28, 58, 8, 2);
  ctx.fillStyle = '#f39c12';
  ctx.fillRect(29, 72, 6, 12);
  return c;
}

export default function AraonLiveMarker({ cesiumRef, visible, displayPos }) {
  const entityRef = useRef(null);
  const canvasRef = useRef(null);

  // 마커 표시 조건: visible prop + displayPos 존재 (북극 항로 + live 모드)
  const shouldShow = visible && !!displayPos;

  useEffect(() => {
    if (!shouldShow) {
      if (entityRef.current) {
        try {
          const v =
            cesiumRef && cesiumRef.current && cesiumRef.current.getViewer
              ? cesiumRef.current.getViewer()
              : null;
          if (v) v.entities.remove(entityRef.current);
        } catch (e) {
          // ignore
        }
        entityRef.current = null;
      }
      return undefined;
    }

    const tryCreate = () => {
      const viewer =
        cesiumRef && cesiumRef.current && cesiumRef.current.getViewer
          ? cesiumRef.current.getViewer()
          : null;
      if (!viewer) return false;
      if (entityRef.current) return true;

      if (!canvasRef.current) canvasRef.current = makeAraonCanvas();

      const initLat = displayPos?.lat ?? ARAON_HOME.lat;
      const initLon = displayPos?.lon ?? ARAON_HOME.lon;
      const initStatus = displayPos?.status || 'idle';
      const initRot = -Cesium.Math.toRadians(displayPos?.heading || 0);

      entityRef.current = viewer.entities.add({
        id: 'live-ib-araon',
        position: Cesium.Cartesian3.fromDegrees(initLon, initLat, 0),
        billboard: {
          image: canvasRef.current,
          // 쇄빙선이 본선(54x108)보다 확실히 더 크게 — 약 50% 증대
          width: 80,
          height: 160,
          // 본선과 동일 규약: alignedAxis=UNIT_Z, rotation=-toRadians(heading)
          alignedAxis: Cesium.Cartesian3.UNIT_Z,
          rotation: initRot,
          color: Cesium.Color.fromCssColorString(
            STATUS_COLOR[initStatus] || '#9ca3af',
          ),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
          // 본선 스케일 곡선과 동일하게 맞춰 줌 변화 시에도 비율 유지
          scaleByDistance: new Cesium.NearFarScalar(
            5000, 1.8,
            500000, 0.6,
          ),
        },
        label: {
          text: '아라온',
          font: 'bold 12px sans-serif',
          fillColor: Cesium.Color.fromCssColorString('#22d3ee'),
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.TOP,
          pixelOffset: new Cesium.Cartesian2(0, 28),
          scaleByDistance: new Cesium.NearFarScalar(1.0e5, 1.0, 8.0e6, 0.4),
        },
      });
      return true;
    };

    if (!tryCreate()) {
      const t = setTimeout(tryCreate, 200);
      return () => clearTimeout(t);
    }

    return () => {
      if (entityRef.current) {
        try {
          const v =
            cesiumRef && cesiumRef.current && cesiumRef.current.getViewer
              ? cesiumRef.current.getViewer()
              : null;
          if (v) v.entities.remove(entityRef.current);
        } catch (e) {
          // ignore
        }
        entityRef.current = null;
      }
    };
  }, [cesiumRef, shouldShow]);

  // 본선 위치/상태/방향 변경 시 entity 갱신 (호위 모드 시 본선에 따라붙음)
  useEffect(() => {
    if (!shouldShow || !entityRef.current) return;
    const lat = displayPos?.lat ?? ARAON_HOME.lat;
    const lon = displayPos?.lon ?? ARAON_HOME.lon;
    const status = displayPos?.status || 'idle';
    const heading = displayPos?.heading || 0;
    try {
      entityRef.current.position = Cesium.Cartesian3.fromDegrees(lon, lat, 0);
      entityRef.current.billboard.color = Cesium.Color.fromCssColorString(
        STATUS_COLOR[status] || '#9ca3af',
      );
      entityRef.current.billboard.rotation = -Cesium.Math.toRadians(heading);
    } catch (e) {
      // ignore
    }
  }, [
    shouldShow,
    displayPos?.lat,
    displayPos?.lon,
    displayPos?.status,
    displayPos?.heading,
  ]);

  return null;
}
