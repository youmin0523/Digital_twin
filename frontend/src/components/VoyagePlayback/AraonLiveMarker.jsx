/**
 * AraonLiveMarker.jsx
 * ===================
 * Live Simulation 모드에서 아라온을 Wrangel Island 사전배치 거점에
 * 정적 마커로 표시. 본선 시뮬과 무관하게 항상 그 자리에 대기.
 *
 * Voyage Playback 모드의 entity (id='voyage-ib-araon') 와 충돌 방지를 위해
 * 별도 id 'live-ib-araon' 사용.
 */

import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';

// Wrangel Island 사전배치 좌표 (backend models.py 와 동일)
const ARAON_HOME = { lat: 71.0, lon: 179.5 };

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

export default function AraonLiveMarker({ cesiumRef, visible }) {
  const entityRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!visible) {
      // 모드 전환으로 숨기는 경우 entity 제거
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

    // 마운트 또는 visible=true 전환 시 entity 생성
    const tryCreate = () => {
      const viewer =
        cesiumRef && cesiumRef.current && cesiumRef.current.getViewer
          ? cesiumRef.current.getViewer()
          : null;
      if (!viewer) return false;
      if (entityRef.current) return true;

      if (!canvasRef.current) canvasRef.current = makeAraonCanvas();

      entityRef.current = viewer.entities.add({
        id: 'live-ib-araon',
        position: Cesium.Cartesian3.fromDegrees(
          ARAON_HOME.lon,
          ARAON_HOME.lat,
          0,
        ),
        billboard: {
          image: canvasRef.current,
          scale: 1.1,   // 본선(54x108)보다 약간 크게
          color: Cesium.Color.fromCssColorString('#9ca3af'),  // idle gray
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          scaleByDistance: new Cesium.NearFarScalar(
            1.0e5, 1.5,
            2.0e7, 0.6,
          ),
        },
      });
      // eslint-disable-next-line no-console
      console.log(
        '[AraonLiveMarker] entity created at Wrangel Island (71N, 179.5E)',
      );
      return true;
    };

    if (!tryCreate()) {
      // viewer 아직 준비 안 됨 — 다음 frame 에 재시도
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
  }, [cesiumRef, visible]);

  return null;
}
