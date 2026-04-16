/**
 * FollowMiniMap.jsx
 * =================
 * 선미 추적(FOLLOW) 뷰 전용 미니 세계지도 오버레이.
 * "지금 지구상 어디에 있는가" 를 한눈에 파악할 수 있게.
 *
 * 좌측 하단에 반투명으로 표시:
 *   - 세계지도(equirectangular) 배경
 *   - 항로 라인 (주황)
 *   - 본선 위치 (빨강 점)
 *   - 아라온 위치 (노랑/주황 점)
 *   - 출발/도착항 (녹/파 점)
 *   - 현재 좌표 텍스트
 */

import React, { useRef, useEffect } from 'react';

const MAP_W = 280;
const MAP_H = 150;
const MAP_IMG_URL =
  'https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/Equirectangular_projection_SW.jpg/1280px-Equirectangular_projection_SW.jpg';

function latLonToXY(lat, lon, w, h) {
  return {
    x: ((lon + 180) / 360) * w,
    y: ((90 - lat) / 180) * h,
  };
}

export default function FollowMiniMap({
  visible,
  shipPos,
  heading,
  waypoints,
  departurePort,
  arrivalPort,
  araonPos,
}) {
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const imgLoadedRef = useRef(false);

  // 지도 이미지 로드
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imgRef.current = img;
      imgLoadedRef.current = true;
      draw();
    };
    img.src = MAP_IMG_URL;
  }, []);

  useEffect(() => {
    if (visible) draw();
  }, [
    visible,
    shipPos?.lat,
    shipPos?.lon,
    heading,
    waypoints,
    araonPos?.lat,
    araonPos?.lon,
    araonPos?.status,
  ]);

  function draw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = MAP_W;
    const H = MAP_H;
    ctx.clearRect(0, 0, W, H);

    // 배경 지도 이미지
    if (imgRef.current && imgLoadedRef.current) {
      ctx.globalAlpha = 0.4;
      ctx.filter = 'brightness(0.5) contrast(1.4) hue-rotate(180deg) invert(1)';
      ctx.drawImage(imgRef.current, 0, 0, W, H);
      ctx.filter = 'none';
      ctx.globalAlpha = 1;
    } else {
      // 이미지 로드 전 fallback: 어두운 배경
      ctx.fillStyle = '#0a1628';
      ctx.fillRect(0, 0, W, H);
    }

    // 위도선 (30도 간격, 미세)
    ctx.strokeStyle = 'rgba(100,140,180,0.15)';
    ctx.lineWidth = 0.5;
    for (let lat = -60; lat <= 90; lat += 30) {
      const y = ((90 - lat) / 180) * H;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    // 항로 라인
    const wps = waypoints || [];
    if (wps.length > 1) {
      ctx.beginPath();
      let first = true;
      for (const wp of wps) {
        const p = latLonToXY(wp.lat, wp.lon, W, H);
        if (first) {
          ctx.moveTo(p.x, p.y);
          first = false;
        } else {
          ctx.lineTo(p.x, p.y);
        }
      }
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.7;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // 출발항
    if (departurePort) {
      const dp = latLonToXY(departurePort.lat, departurePort.lon, W, H);
      ctx.beginPath();
      ctx.arc(dp.x, dp.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#22c55e';
      ctx.fill();
    }

    // 도착항
    if (arrivalPort) {
      const ap = latLonToXY(arrivalPort.lat, arrivalPort.lon, W, H);
      ctx.beginPath();
      ctx.arc(ap.x, ap.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#60a5fa';
      ctx.fill();
    }

    // 아라온 마커
    if (araonPos && typeof araonPos.lat === 'number') {
      const ap = latLonToXY(araonPos.lat, araonPos.lon, W, H);
      const isEscorting = araonPos.status === 'escorting';
      ctx.beginPath();
      ctx.arc(ap.x, ap.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = isEscorting ? '#fb923c' : '#facc15';
      ctx.fill();
      // 라벨
      ctx.font = '7px sans-serif';
      ctx.fillStyle = isEscorting ? '#fb923c' : '#facc15';
      ctx.textAlign = 'left';
      ctx.fillText('아라온', ap.x + 5, ap.y + 2);
    }

    // 본선 위치
    const lat = shipPos?.lat ?? 35.1;
    const lon = shipPos?.lon ?? 129.0;
    const sp = latLonToXY(lat, lon, W, H);

    // 글로우 링
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, 8, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(239,68,68,0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();
    // 본체 점
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = '#ef4444';
    ctx.shadowBlur = 6;
    ctx.shadowColor = '#ef4444';
    ctx.fill();
    ctx.shadowBlur = 0;

    // heading 화살표
    if (typeof heading === 'number') {
      const hRad = (heading * Math.PI) / 180;
      const hx = sp.x + Math.sin(hRad) * 10;
      const hy = sp.y - Math.cos(hRad) * 10;
      ctx.beginPath();
      ctx.moveTo(sp.x, sp.y);
      ctx.lineTo(hx, hy);
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // 좌표 텍스트 (우하단)
    ctx.font = 'bold 8px monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'right';
    ctx.fillText(
      `${lat.toFixed(1)}°N  ${lon.toFixed(1)}°E`,
      W - 4,
      H - 4,
    );
  }

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 60,
        left: 12,
        zIndex: 160,
        pointerEvents: 'none',
        borderRadius: 8,
        overflow: 'hidden',
        border: '1px solid rgba(96,165,250,0.25)',
        boxShadow: '0 2px 16px rgba(0,0,0,0.5)',
        background: 'rgba(5,10,25,0.75)',
      }}
    >
      <canvas
        ref={canvasRef}
        width={MAP_W}
        height={MAP_H}
        style={{ display: 'block' }}
      />
    </div>
  );
}
