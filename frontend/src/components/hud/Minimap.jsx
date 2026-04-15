import { useRef, useEffect, useState } from 'react';

/**
 * Minimap component - polar-projection minimap showing ship position on the route.
 *
 * Props:
 *   shipPos    - { lat, lon }
 *   progress   - 0..1  (simulation progress fraction)
 *   heading    - radians, ship heading
 *   waypoints  - Array<{ lat, lon, ... }>
 *   onOpenTeleport - callback to open the teleport overlay
 */
export default function Minimap({
  shipPos,
  progress,
  heading,
  waypoints,
  onOpenTeleport,
  departurePort,
  arrivalPort,
  araonPos, // { lat, lon, status }
}) {
  const canvasRef = useRef(null);
  const [blink, setBlink] = useState(true);

  useEffect(() => {
    const id = setInterval(() => setBlink((b) => !b), 500);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    drawMinimap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    shipPos?.lat,
    shipPos?.lon,
    progress,
    heading,
    blink,
    waypoints,
    araonPos?.lat,
    araonPos?.lon,
    araonPos?.status,
  ]);

  function drawMinimap() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = 200, H = 200;
    const cx = W / 2, cy = H / 2, R = W / 2 - 10;

    const lat = shipPos?.lat ?? 0;
    const lon = shipPos?.lon ?? 0;
    const wps = waypoints || [];

    // LAT_MIN을 웨이포인트 최소 위도 기준으로 동적 계산 (15° 단위 내림, 5° 여유)
    const minWpLat = wps.length ? Math.min(...wps.map((w) => w.lat)) : 30;
    const LAT_MIN = Math.floor((minWpLat - 5) / 15) * 15;
    const LAT_MAX = 90;
    const latRange = LAT_MAX - LAT_MIN;

    // 극좌표 변환: 북극(90°N)이 항상 중심
    function latLonToMM(la, lo) {
      const r = ((LAT_MAX - la) / latRange) * R;
      const theta = (lo * Math.PI) / 180;
      return { x: cx + r * Math.sin(theta), y: cy - r * Math.cos(theta) };
    }

    // background
    ctx.fillStyle = '#050d18';
    ctx.fillRect(0, 0, W, H);

    // 위도권 그리드 (범위에 따라 15° or 30° 간격)
    const step = latRange <= 75 ? 15 : 30;
    const gridStart = Math.ceil(LAT_MIN / step) * step;
    for (let la = gridStart; la < LAT_MAX; la += step) {
      const r = ((LAT_MAX - la) / latRange) * R;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = la === 60 ? '#1a3060' : (la === 0 ? '#1a3060' : '#0d1f40');
      ctx.lineWidth = (la === 60 || la === 0) ? 1 : 0.5;
      ctx.stroke();
      ctx.fillStyle = '#1e3a8a';
      ctx.font = '7px Courier New';
      ctx.textAlign = 'left';
      const label = la >= 0 ? la + '\u00b0' : la + '\u00b0';
      ctx.fillText(label, cx + 2, cy - r + 8);
    }

    // 경선 (60° 간격)
    [-120, -60, 0, 60, 120, 180].forEach((lo) => {
      const theta = (lo * Math.PI) / 180;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + R * Math.sin(theta), cy - R * Math.cos(theta));
      ctx.strokeStyle = '#0d1f40';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    });

    // 외곽 원
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.strokeStyle = '#1e40af';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 북극 라벨
    ctx.fillStyle = '#334466';
    ctx.font = '8px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('N', cx, cy + 3);

    // 경로선 (전체 웨이포인트, 클리핑 없음)
    ctx.beginPath();
    let first = true;
    wps.forEach((wp) => {
      const p = latLonToMM(wp.lat, wp.lon);
      if (first) { ctx.moveTo(p.x, p.y); first = false; }
      else ctx.lineTo(p.x, p.y);
    });
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 출발항 점
    const depLat = departurePort?.lat ?? 35.1;
    const depLon = departurePort?.lon ?? 129.0;
    const depP = latLonToMM(depLat, depLon);
    ctx.beginPath();
    ctx.arc(depP.x, depP.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#22c55e';
    ctx.fill();

    // 도착항 점
    const arrLat = arrivalPort?.lat ?? 51.9;
    const arrLon = arrivalPort?.lon ?? 4.5;
    const arrP = latLonToMM(arrLat, arrLon);
    ctx.beginPath();
    ctx.arc(arrP.x, arrP.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#60a5fa';
    ctx.fill();

    // 현재 위치 (본선)
    const p = latLonToMM(lat, lon);
    const inCircle = Math.hypot(p.x - cx, p.y - cy) <= R;
    if (inCircle) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(239,68,68,0.35)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = blink ? '#ef4444' : '#ff8080';
      ctx.fill();
      const hd = heading ?? 0;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + Math.sin(hd) * 11, p.y - Math.cos(hd) * 11);
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else {
      ctx.fillStyle = '#1e3a8a';
      ctx.font = '8px Courier New';
      ctx.textAlign = 'center';
      ctx.fillText('\u25bc ' + lat.toFixed(1) + '\u00b0N', cx, H - 6);
    }

    // 🚢 아라온 마커 — 평소 노랑, 호위 중엔 주황
    if (
      araonPos &&
      typeof araonPos.lat === 'number' &&
      typeof araonPos.lon === 'number'
    ) {
      const ap = latLonToMM(araonPos.lat, araonPos.lon);
      const inCircleA = Math.hypot(ap.x - cx, ap.y - cy) <= R;
      if (inCircleA) {
        const isEscorting = araonPos.status === 'escorting';
        const mainColor = isEscorting ? '#fb923c' : '#facc15'; // 주황 vs 노랑
        const ringColor = isEscorting
          ? 'rgba(251,146,60,0.4)'
          : 'rgba(250,204,21,0.4)';
        // 외곽 링
        ctx.beginPath();
        ctx.arc(ap.x, ap.y, 6, 0, Math.PI * 2);
        ctx.strokeStyle = ringColor;
        ctx.lineWidth = 1;
        ctx.stroke();
        // 본체 점
        ctx.beginPath();
        ctx.arc(ap.x, ap.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = mainColor;
        ctx.fill();
      }
    }

    ctx.textAlign = 'left';
  }

  const lat = shipPos?.lat ?? 0;
  const lon = shipPos?.lon ?? 0;
  const pct = ((progress ?? 0) * 100).toFixed(1);

  return (
    <div
      className="hud"
      id="minimap-wrap"
      style={{
        width: '100%',
        boxSizing: 'border-box',
        padding: 0,
      }}
    >
      <div className="hud-title">📍 현재 위치</div>
      <canvas
        ref={canvasRef}
        id="minimap"
        width={200}
        height={200}
        style={{
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 8,
          display: 'block',
          background: 'rgba(0,0,0,0.2)',
          width: '100%',
          height: 'auto',
          maxWidth: '100%',
        }}
      />
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 10,
          fontSize: 11,
          color: '#94a3b8',
          fontFamily: 'tabular-nums',
        }}
      >
        <span id="mm-lat">{lat.toFixed(4)}°N</span>
        <span id="mm-lon">{lon.toFixed(4)}°E</span>
        <span id="mm-pct" style={{ color: '#34d399', fontWeight: 'bold' }}>
          {pct}%
        </span>
      </div>
      <button
        onClick={onOpenTeleport}
        style={{
          width: '100%',
          marginTop: 12,
          padding: '8px 0',
          borderRadius: 8,
          border: '1px solid rgba(96, 165, 250, 0.3)',
          background: 'rgba(30,58,138,.3)',
          color: '#60a5fa',
          fontFamily: 'inherit',
          fontSize: 11,
          cursor: 'pointer',
          transition: 'all 0.2s',
          fontWeight: '600',
        }}
        onMouseEnter={(e) => (e.target.style.background = 'rgba(30,58,138,.5)')}
        onMouseLeave={(e) => (e.target.style.background = 'rgba(30,58,138,.3)')}
      >
        🛰 위치 이동
      </button>
    </div>
  );
}