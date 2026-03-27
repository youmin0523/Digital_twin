import React, { useRef, useEffect, useState } from 'react';

/**
 * Minimap component - polar-projection minimap showing ship position on the NSR route.
 *
 * Props:
 *   shipPos    - { lat, lon }
 *   progress   - 0..1  (simulation progress fraction)
 *   heading    - radians, ship heading
 *   waypoints  - Array<{ lat, lon, ... }>
 *   onOpenTeleport - callback to open the teleport overlay
 */
export default function Minimap({ shipPos, progress, heading, waypoints, onOpenTeleport }) {
  const canvasRef = useRef(null);
  const [blink, setBlink] = useState(true);

  /* blinking dot interval */
  useEffect(() => {
    const id = setInterval(() => setBlink(b => !b), 500);
    return () => clearInterval(id);
  }, []);

  /* redraw whenever relevant props change */
  useEffect(() => {
    drawMinimap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shipPos?.lat, shipPos?.lon, progress, heading, blink, waypoints]);

  function drawMinimap() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = 200, H = 200;
    const LAT_MIN = 30, LAT_MAX = 90;
    const cx = W / 2, cy = H / 2, R = W / 2 - 10;

    const lat = shipPos?.lat ?? 0;
    const lon = shipPos?.lon ?? 0;

    function latLonToMM(la, lo) {
      const r = (LAT_MAX - la) / (LAT_MAX - LAT_MIN) * R;
      const theta = lo * Math.PI / 180;
      return { x: cx + r * Math.sin(theta), y: cy - r * Math.cos(theta) };
    }

    // background
    ctx.fillStyle = '#050d18';
    ctx.fillRect(0, 0, W, H);

    // latitude circles
    [30, 45, 60, 75].forEach(la => {
      const r = (LAT_MAX - la) / (LAT_MAX - LAT_MIN) * R;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = la === 60 ? '#1a3060' : '#0d1f40';
      ctx.lineWidth = la === 60 ? 1 : 0.5;
      ctx.stroke();
      ctx.fillStyle = '#1e3a8a';
      ctx.font = '7px Courier New';
      ctx.textAlign = 'left';
      ctx.fillText(la + '\u00b0', cx + 2, cy - r + 8);
    });

    // meridians (60-degree intervals)
    [-120, -60, 0, 60, 120, 180].forEach(lo => {
      const theta = lo * Math.PI / 180;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + R * Math.sin(theta), cy - R * Math.cos(theta));
      ctx.strokeStyle = '#0d1f40';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    });

    // outer circle
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.strokeStyle = '#1e40af';
    ctx.lineWidth = 1;
    ctx.stroke();

    // north-pole label
    ctx.fillStyle = '#334466';
    ctx.font = '8px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('N', cx, cy + 3);

    // route line
    const wps = waypoints || [];
    ctx.beginPath();
    let first = true;
    wps.forEach(wp => {
      if (wp.lat < LAT_MIN) { first = true; return; }
      const p = latLonToMM(wp.lat, wp.lon);
      if (first) { ctx.moveTo(p.x, p.y); first = false; }
      else ctx.lineTo(p.x, p.y);
    });
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // departure dot (Busan)
    if (35.1 >= LAT_MIN) {
      const p = latLonToMM(35.1, 129.0);
      ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#22c55e'; ctx.fill();
    }

    // arrival dot (Rotterdam)
    if (51.9 >= LAT_MIN) {
      const p = latLonToMM(51.9, 4.5);
      ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#60a5fa'; ctx.fill();
    }

    // current position
    if (lat >= LAT_MIN) {
      const p = latLonToMM(lat, lon);
      // outer ring
      ctx.beginPath();
      ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(239,68,68,0.35)';
      ctx.lineWidth = 1;
      ctx.stroke();
      // solid dot (blinking)
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = blink ? '#ef4444' : '#ff8080';
      ctx.fill();
      // heading arrow
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

    // reset textAlign for safety
    ctx.textAlign = 'left';
  }

  const lat = shipPos?.lat ?? 0;
  const lon = shipPos?.lon ?? 0;
  const pct = ((progress ?? 0) * 100).toFixed(1);

  return (
    <div className="hud" id="minimap-wrap"
      style={{ position: 'absolute', bottom: 70, left: 12, padding: 10, width: 220 }}>
      <div className="hud-title">{'\u25b8'} 현재 위치</div>
      <canvas
        ref={canvasRef}
        id="minimap"
        width={200}
        height={200}
        style={{ border: '1px solid #1e3a8a', borderRadius: 4, display: 'block' }}
      />
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        marginTop: 5, fontSize: 9, color: '#4b7ab5',
      }}>
        <span id="mm-lat">{lat.toFixed(2)}&deg;N</span>
        <span id="mm-lon">{lon.toFixed(2)}&deg;E</span>
        <span id="mm-pct">{pct}%</span>
      </div>
      <button
        onClick={onOpenTeleport}
        style={{
          width: '100%', marginTop: 6, padding: 5, borderRadius: 5,
          border: '1px solid #1e40af', background: 'rgba(30,58,138,.2)',
          color: '#60a5fa', fontFamily: "'Courier New', monospace",
          fontSize: 10, cursor: 'pointer',
        }}
      >
        {'\ud83d\udccd'} 위치 이동
      </button>
    </div>
  );
}
