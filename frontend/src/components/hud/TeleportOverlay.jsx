import React, { useRef, useEffect, useState, useCallback } from 'react';

/**
 * Default teleport presets matching the monolith.
 */
const DEFAULT_PRESETS = [
  { name: '\ud83c\uddf0\ud83c\uddf7 부산',       lat: 35.1, lon: 129.0 },
  { name: '\ud83c\udf0a 쓰가루해협',  lat: 41.0, lon: 141.0 },
  { name: '\ud83c\udf0f 베링해협',    lat: 66.0, lon: -168.0 },
  { name: '\ud83e\uddf3 척치해',       lat: 72.0, lon: -163.0 },
  { name: '\u2744\ufe0f 극지 진입',    lat: 82.0, lon: -120.0 },
  { name: '\ud83d\udd34 고위도북극',   lat: 86.0, lon: -70.0 },
  { name: '\ud83c\udf0d 그린란드해',   lat: 83.0, lon: 20.0 },
  { name: '\ud83c\udf0a 바렌츠해',    lat: 77.0, lon: 30.0 },
  { name: '\ud83c\uddf3\ud83c\uddf4 노르웨이',    lat: 62.0, lon: 5.0 },
  { name: '\ud83c\uddf3\ud83c\uddf1 로테르담',    lat: 51.9, lon: 4.5 },
];

/**
 * TeleportOverlay component - full-screen modal for teleporting to a location.
 *
 * Props:
 *   visible      - boolean
 *   waypoints    - Array<{ lat, lon, ... }> route waypoints
 *   shipPos      - { lat, lon } current ship position
 *   heading      - radians
 *   presets      - optional preset list (defaults to NSR presets)
 *   onTeleport   - (lat, lon, name?) => void
 *   onClose      - () => void
 */
export default function TeleportOverlay({
  visible, waypoints, shipPos, heading, presets, onTeleport, onClose,
}) {
  const canvasRef = useRef(null);
  const [latVal, setLatVal] = useState('');
  const [lonVal, setLonVal] = useState('');
  const [statusMsg, setStatusMsg] = useState('클릭하면 해당 위치로 즉시 이동합니다');

  const teleportPresets = presets || DEFAULT_PRESETS;

  /* ---------- coordinate mapping helpers ---------- */
  const toPixel = useCallback((lat, lon, W, H) => ({
    x: (lon + 180) / 360 * W,
    y: (1 - (lat - 20) / 70) * H,
  }), []);

  /* ---------- draw the teleport map ---------- */
  const drawMap = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;

    // background
    ctx.fillStyle = '#020d1a';
    ctx.fillRect(0, 0, W, H);

    // grid lines - latitude
    ctx.lineWidth = 0.5;
    for (let la = 20; la <= 90; la += 10) {
      const p = toPixel(la, -180, W, H);
      const p2 = toPixel(la, 180, W, H);
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p2.x, p2.y);
      ctx.strokeStyle = la === 70 ? '#1a3060' : '#0a1830'; ctx.stroke();
      ctx.fillStyle = '#1e3a5a'; ctx.font = '8px Courier New';
      ctx.fillText(la + '\u00b0N', 3, p.y - 1);
    }

    // grid lines - longitude
    for (let lo = -180; lo <= 180; lo += 30) {
      const p = toPixel(20, lo, W, H);
      const p2 = toPixel(90, lo, W, H);
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p2.x, p2.y);
      ctx.strokeStyle = '#0a1830'; ctx.stroke();
      if (lo > -180) {
        ctx.fillStyle = '#1e3a5a'; ctx.font = '8px Courier New';
        ctx.fillText(lo + '\u00b0', p.x + 2, H - 2);
      }
    }

    // land blocks
    const TLANDS = [
      [34, 126, 45, 142, '#2a3a22'], [42, 130, 72, 180, '#2a3a1a'],
      [60, -180, 72, -140, '#2a3a1a'], [60, -168, 72, -141, '#2a4a1a'],
      [76, -73, 84, -18, '#5a6a6a'], [57, 5, 72, 30, '#2a3a22'],
      [50, -6, 59, 2, '#2a3a22'], [51, 3, 55, 10, '#2a3a22'],
      [63, -24, 67, -13, '#3a4a3a'], [76, 14, 81, 28, '#4a5a4a'],
    ];
    TLANDS.forEach(([la1, lo1, la2, lo2, col]) => {
      const p1 = toPixel(la1, lo1, W, H);
      const p2 = toPixel(la2, lo2, W, H);
      ctx.fillStyle = col;
      ctx.fillRect(
        Math.min(p1.x, p2.x), Math.min(p1.y, p2.y),
        Math.abs(p2.x - p1.x), Math.abs(p2.y - p1.y),
      );
    });

    // ice zone
    ctx.fillStyle = 'rgba(180,220,255,0.15)';
    const iceA = toPixel(82, -180, W, H), iceB = toPixel(90, 180, W, H);
    ctx.fillRect(0, Math.min(iceA.y, iceB.y), W, Math.abs(iceB.y - iceA.y));
    ctx.fillStyle = 'rgba(180,220,255,0.07)';
    const iceC = toPixel(75, -180, W, H), iceD = toPixel(82, 180, W, H);
    ctx.fillRect(0, Math.min(iceC.y, iceD.y), W, Math.abs(iceD.y - iceC.y));

    // route line
    const wps = waypoints || [];
    ctx.beginPath();
    let fr = true;
    wps.forEach(wp => {
      const p = toPixel(wp.lat, wp.lon, W, H);
      if (fr) { ctx.moveTo(p.x, p.y); fr = false; } else ctx.lineTo(p.x, p.y);
    });
    ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2; ctx.stroke();

    // waypoint dots
    wps.forEach((wp, i) => {
      const p = toPixel(wp.lat, wp.lon, W, H);
      ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
      ctx.fillStyle = i === 0 ? '#22c55e' : i === wps.length - 1 ? '#60a5fa' : '#f59e0b';
      ctx.fill();
    });

    // preset icons
    teleportPresets.forEach(tp => {
      const p = toPixel(tp.lat, tp.lon, W, H);
      ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(96,165,250,0.25)';
      ctx.strokeStyle = '#60a5fa'; ctx.lineWidth = 1;
      ctx.fill(); ctx.stroke();
    });

    // current ship position
    const lat = shipPos?.lat ?? 35.1;
    const lon = shipPos?.lon ?? 129.0;
    const cur = toPixel(lat, lon, W, H);
    ctx.beginPath(); ctx.arc(cur.x, cur.y, 9, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(239,68,68,0.5)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath(); ctx.arc(cur.x, cur.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#ef4444'; ctx.fill();
    // heading line
    const hd = heading ?? 0;
    const hx = cur.x + Math.sin(hd) * 14;
    const hy = cur.y - Math.cos(hd) * 14;
    ctx.beginPath(); ctx.moveTo(cur.x, cur.y); ctx.lineTo(hx, hy);
    ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2; ctx.stroke();
  }, [waypoints, shipPos, heading, teleportPresets, toPixel]);

  /* redraw when visible or dependencies change */
  useEffect(() => {
    if (visible) drawMap();
  }, [visible, drawMap]);

  /* ---------- canvas click handler ---------- */
  function handleCanvasClick(e) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const px = (e.clientX - rect.left) * scaleX;
    const py = (e.clientY - rect.top) * scaleX;
    const lon = Math.max(-180, Math.min(180, px / canvas.width * 360 - 180));
    const lat = Math.max(20, Math.min(89, (1 - py / canvas.height) * 70 + 20));
    if (onTeleport) onTeleport(lat, lon);
    drawMap();
  }

  /* ---------- input-based teleport ---------- */
  function handleTeleportInput() {
    const lat = parseFloat(latVal);
    const lon = parseFloat(lonVal);
    if (isNaN(lat) || isNaN(lon)) {
      setStatusMsg('좌표를 입력해주세요');
      return;
    }
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      setStatusMsg('좌표 범위 초과');
      return;
    }
    const name = lat.toFixed(1) + '\u00b0N ' + lon.toFixed(1) + '\u00b0E';
    if (onTeleport) onTeleport(lat, lon, name);
    setStatusMsg('\u2705 ' + name + ' 로 이동했습니다');
  }

  /* ---------- preset button click ---------- */
  function handlePreset(tp) {
    if (onTeleport) onTeleport(tp.lat, tp.lon, tp.name);
    setStatusMsg(
      '\u2705 ' + tp.name + ' (' + tp.lat.toFixed(2) + '\u00b0N, ' + tp.lon.toFixed(2) + '\u00b0E) 로 이동했습니다',
    );
  }

  if (!visible) return null;

  return (
    <div
      id="teleport-overlay"
      style={{
        position: 'fixed', inset: 0, zIndex: 400,
        background: 'rgba(0,5,15,0.92)', backdropFilter: 'blur(4px)',
      }}
    >
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%,-50%)', width: 700, maxWidth: '95vw',
      }}>
        {/* title */}
        <div style={{
          color: '#60a5fa', fontFamily: "'Courier New', monospace",
          fontSize: 14, fontWeight: 'bold', letterSpacing: 2,
          textAlign: 'center', marginBottom: 12,
        }}>
          {'\ud83d\udccd'} 이동할 위치를 클릭하세요
        </div>

        {/* map canvas */}
        <canvas
          ref={canvasRef}
          id="teleport-map"
          width={700}
          height={400}
          onClick={handleCanvasClick}
          style={{
            border: '1px solid #1e40af', borderRadius: 8,
            cursor: 'crosshair', display: 'block', width: '100%',
          }}
        />

        {/* preset buttons */}
        <div
          id="teleport-presets"
          style={{
            display: 'flex', flexWrap: 'wrap', gap: 6,
            marginTop: 12, justifyContent: 'center',
          }}
        >
          {teleportPresets.map((tp, i) => (
            <button
              key={i}
              onClick={() => handlePreset(tp)}
              style={{
                padding: '5px 10px', borderRadius: 5,
                border: '1px solid #1e3a8a', background: 'rgba(30,58,138,.2)',
                color: '#93c5fd', fontFamily: "'Courier New', monospace",
                fontSize: 10, cursor: 'pointer',
              }}
            >
              {tp.name}
            </button>
          ))}
        </div>

        {/* coordinate input row */}
        <div style={{
          display: 'flex', gap: 8, marginTop: 10, alignItems: 'center',
          fontFamily: "'Courier New', monospace", fontSize: 11, color: '#93c5fd',
        }}>
          <span>위도</span>
          <input
            type="number"
            id="tp-lat"
            placeholder="35.1"
            step="0.1"
            value={latVal}
            onChange={e => setLatVal(e.target.value)}
            style={{
              width: 80, background: '#0a1628', border: '1px solid #1e40af',
              color: '#e0f0ff', padding: '4px 8px', borderRadius: 4,
              fontFamily: 'inherit',
            }}
          />
          <span>경도</span>
          <input
            type="number"
            id="tp-lon"
            placeholder="129.0"
            step="0.1"
            value={lonVal}
            onChange={e => setLonVal(e.target.value)}
            style={{
              width: 80, background: '#0a1628', border: '1px solid #1e40af',
              color: '#e0f0ff', padding: '4px 8px', borderRadius: 4,
              fontFamily: 'inherit',
            }}
          />
          <button
            onClick={handleTeleportInput}
            style={{
              padding: '5px 14px', borderRadius: 5,
              border: '1px solid #2563eb', background: 'rgba(37,99,235,.3)',
              color: '#93c5fd', fontFamily: "'Courier New', monospace",
              fontSize: 11, cursor: 'pointer',
            }}
          >
            {'\u2708\ufe0f'} 이동
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '5px 14px', borderRadius: 5,
              border: '1px solid #dc2626', background: 'rgba(220,38,38,.2)',
              color: '#fca5a5', fontFamily: "'Courier New', monospace",
              fontSize: 11, cursor: 'pointer',
            }}
          >
            {'\u2715'} 닫기
          </button>
        </div>

        {/* status message */}
        <div
          id="tp-selected"
          style={{
            textAlign: 'center', marginTop: 8, color: '#4b7ab5',
            fontFamily: "'Courier New', monospace", fontSize: 10,
          }}
        >
          {statusMsg}
        </div>
      </div>
    </div>
  );
}
