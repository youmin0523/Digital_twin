import React, { useRef, useEffect, useState, useCallback } from 'react';

/**
 * Default teleport presets matching the monolith.
 */
const DEFAULT_PRESETS = [
  { name: '\ud83c\uddf0\ud83c\uddf7 부산', lat: 35.1, lon: 129.0 },
  { name: '\ud83c\udf0a 쓰가루해협', lat: 41.0, lon: 141.0 },
  { name: '\ud83c\udf0f 베링해협', lat: 66.0, lon: -168.0 },
  { name: '\ud83e\uddf3 척치해', lat: 72.0, lon: -163.0 },
  { name: '\u2744\ufe0f 극지 진입', lat: 82.0, lon: -120.0 },
  { name: '\ud83d\udd34 고위도북극', lat: 86.0, lon: -70.0 },
  { name: '\ud83c\udf0d 그린란드해', lat: 83.0, lon: 20.0 },
  { name: '\ud83c\udf0a 바렌츠해', lat: 77.0, lon: 30.0 },
  { name: '\ud83c\uddf3\ud83c\uddf4 노르웨이', lat: 62.0, lon: 5.0 },
  { name: '\ud83c\uddf3\ud83c\uddf1 로테르담', lat: 51.9, lon: 4.5 },
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
  visible,
  waypoints,
  shipPos,
  heading,
  presets,
  onTeleport,
  onClose,
}) {
  const canvasRef = useRef(null);
  const [latVal, setLatVal] = useState('');
  const [lonVal, setLonVal] = useState('');
  const [statusMsg, setStatusMsg] = useState(
    '클릭하면 해당 위치로 즉시 이동합니다',
  );

  const teleportPresets = presets || DEFAULT_PRESETS;

  /* ---------- coordinate mapping helpers (Standard Equirectangular) ---------- */
  const toPixel = useCallback((lat, lon, W, H) => {
    // //* [Modified Code] 지도가 전세계를 표현하므로 위도 범위를 -90~90으로 확장하여 정합성 확보
    const targetLat = lat ?? 35.1;
    const targetLon = lon ?? 129.0;
    return {
      x: ((targetLon + 180) / 360) * W,
      y: ((90 - targetLat) / 180) * H,
    };
  }, []);

  const [mapImage, setMapImage] = useState(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  /* ---------- preload map image ---------- */
  useEffect(() => {
    let isMounted = true;
    const img = new Image();
    img.src = '/world_map.png?v=' + Date.now();
    img.onload = () => {
      if (!isMounted) return;
      console.log('Map image loaded successfully');
      setMapImage(img);
      setMapLoaded(true);
    };
    img.onerror = () => {
      if (!isMounted) return;
      console.error('Failed to load map image at /world_map.png');
      setMapLoaded(true);
    };
    return () => {
      isMounted = false;
    };
  }, []);

  /* redraw logic */
  useEffect(() => {
    if (visible) {
      requestAnimationFrame(() => {
        drawMap();
      });
    }
  }, [visible, mapLoaded, waypoints, shipPos, heading, toPixel]);

  /* ---------- draw the teleport map ---------- */
  const drawMap = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width,
      H = canvas.height;

    // 1. 캔버스 초기화
    ctx.clearRect(0, 0, W, H);

    // 2. 그리드 라인 및 좌표 (북극 중심 뷰인 경우를 고려하여 범위 조정)
    ctx.lineWidth = 0.5;
    ctx.globalAlpha = 0.2;
    for (let la = -90; la <= 90; la += 10) {
      const p = toPixel(la, -180, W, H);
      const p2 = toPixel(la, 180, W, H);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.strokeStyle = la === 0 ? '#60a5fa' : '#1e3a8a';
      ctx.stroke();
      ctx.fillStyle = '#60a5fa';
      ctx.font = '8px Courier New';
      if (p.y > 0 && p.y < H) ctx.fillText(la + '\u00b0', 3, p.y - 1);
    }
    for (let lo = -180; lo <= 180; lo += 30) {
      const p = toPixel(-90, lo, W, H);
      const p2 = toPixel(90, lo, W, H);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.strokeStyle = '#1e3a8a';
      ctx.stroke();
      if (p.x >= 0 && p.x < W) {
        ctx.fillStyle = '#60a5fa';
        ctx.font = '8px Courier New';
        ctx.fillText(lo + '\u00b0', p.x + 2, H - 2);
      }
    }
    ctx.globalAlpha = 1.0;

    const wps = waypoints || [];
    if (wps.length > 0) {
      ctx.beginPath();
      let fr = true;
      wps.forEach((wp) => {
        const p = toPixel(wp.lat, wp.lon, W, H);
        if (fr) {
          ctx.moveTo(p.x, p.y);
          fr = false;
        } else ctx.lineTo(p.x, p.y);
      });
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      wps.forEach((wp, i) => {
        const p = toPixel(wp.lat, wp.lon, W, H);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle =
          i === 0 ? '#10b981' : i === wps.length - 1 ? '#3b82f6' : '#10b981';
        ctx.shadowBlur = 6;
        ctx.shadowColor = ctx.fillStyle;
        ctx.fill();
        ctx.shadowBlur = 0;
      });
    }

    teleportPresets.forEach((tp) => {
      const p = toPixel(tp.lat, tp.lon, W, H);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(59, 130, 246, 0.4)';
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 1.5;
      ctx.fill();
      ctx.stroke();
    });

    const lat = shipPos?.lat ?? 35.1;
    const lon = shipPos?.lon ?? 129.0;
    const cur = toPixel(lat, lon, W, H);
    ctx.beginPath();
    ctx.arc(cur.x, cur.y, 11, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.6)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cur.x, cur.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#ef4444';
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#ef4444';
    ctx.fill();
    ctx.shadowBlur = 0;
    const hd = heading ?? 0;
    const hx = cur.x + Math.sin(hd) * 18;
    const hy = cur.y - Math.cos(hd) * 18;
    ctx.beginPath();
    ctx.moveTo(cur.x, cur.y);
    ctx.lineTo(hx, hy);
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 3;
    ctx.stroke();
  }, [
    waypoints,
    shipPos,
    heading,
    teleportPresets,
    toPixel,
    mapImage,
    mapLoaded,
  ]);

  /* ---------- canvas click handler ---------- */
  function handleCanvasClick(e) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const px = (e.clientX - rect.left) * scaleX;
    const py = (e.clientY - rect.top) * scaleY;

    // //* [Modified Code] 전세계 Equirectangular(-180~180, -90~90) 기준 좌표 변환
    const lon = (px / canvas.width) * 360 - 180;
    const lat = 90 - (py / canvas.height) * 180;

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
      '\u2705 ' +
        tp.name +
        ' (' +
        tp.lat.toFixed(2) +
        '\u00b0N, ' +
        tp.lon.toFixed(2) +
        '\u00b0E) 로 이동했습니다',
    );
  }

  if (!visible) return null;

  return (
    <div
      id="teleport-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999, //* [Modified Code] 최상단 노출 보강
        background: 'rgba(0,5,15,0.92)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: 700,
          maxWidth: '95vw',
          background: 'rgba(15, 23, 42, 0.8)',
          borderRadius: 24,
          padding: 32,
          border: '1px solid rgba(96, 165, 248, 0.2)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          position: 'relative',
        }}
      >
        {/* title */}
        <div
          style={{
            textAlign: 'center',
            marginBottom: 12,
          }}
        >
          {'\ud83d\udccd'} 이동할 위치를 클릭하세요
        </div>

        {/* map container with image background */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: 400,
            borderRadius: 12,
            overflow: 'hidden',
            border: '1px solid rgba(96, 165, 248, 0.2)',
            boxShadow: '0 0 30px rgba(0,0,0,0.5)',
            background: '#020617',
          }}
        >
          {/* //* [Modified Code] Equirectangular(평등원통도법) 지도를 사용하여 캔버스 좌표와 1:1 매칭 */}
          <img
            src="https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/Equirectangular_projection_SW.jpg/1280px-Equirectangular_projection_SW.jpg"
            alt="World Map"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              objectFit: 'fill',
              opacity: 0.5,
              pointerEvents: 'none',
              zIndex: 0,
              filter:
                'brightness(0.6) contrast(1.5) hue-rotate(180deg) invert(1)',
            }}
            onLoad={() => console.log('✅ Standard Map Image Loaded')}
          />

          <canvas
            ref={canvasRef}
            id="teleport-map"
            width={700}
            height={400}
            onClick={handleCanvasClick}
            style={{
              position: 'relative',
              cursor: 'crosshair',
              display: 'block',
              width: '100%',
              zIndex: 1,
            }}
          />
        </div>

        {/* preset buttons */}
        <div
          id="teleport-presets"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            marginTop: 20,
            justifyContent: 'center',
          }}
        >
          {teleportPresets.map((tp, i) => (
            <button
              key={i}
              onClick={() => handlePreset(tp)}
              className="hud-button-premium"
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                border: '1px solid rgba(81, 137, 255, 0.3)',
                background: 'rgba(30, 58, 138, 0.2)',
                color: '#94a3b8',
                fontFamily: "'Inter', sans-serif",
                fontSize: 11,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(59, 130, 246, 0.3)';
                e.currentTarget.style.color = '#fff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(30, 58, 138, 0.2)';
                e.currentTarget.style.color = '#94a3b8';
              }}
            >
              {tp.name}
            </button>
          ))}
        </div>

        {/* coordinate input & controls */}
        <div
          style={{
            display: 'flex',
            gap: 12,
            marginTop: 24,
            padding: '16px 24px',
            background: 'rgba(15, 23, 42, 0.6)',
            borderRadius: 12,
            border: '1px solid rgba(96, 165, 248, 0.1)',
            alignItems: 'center',
            justifyContent: 'center',
            backdropFilter: 'blur(8px)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#64748b', fontSize: 12, fontWeight: 500 }}>
              위도
            </span>
            <input
              type="number"
              value={latVal}
              onChange={(e) => setLatVal(e.target.value)}
              placeholder="35.1"
              style={{
                width: 90,
                background: 'rgba(2, 6, 23, 0.8)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                color: '#fff',
                padding: '8px 12px',
                borderRadius: 8,
                fontSize: 13,
                outline: 'none',
              }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#64748b', fontSize: 12, fontWeight: 500 }}>
              경도
            </span>
            <input
              type="number"
              value={lonVal}
              onChange={(e) => setLonVal(e.target.value)}
              placeholder="129.0"
              style={{
                width: 90,
                background: 'rgba(2, 6, 23, 0.8)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                color: '#fff',
                padding: '8px 12px',
                borderRadius: 8,
                fontSize: 13,
                outline: 'none',
              }}
            />
          </div>

          <div
            style={{
              width: 1,
              height: 24,
              background: 'rgba(255,255,255,0.1)',
              margin: '0 8px',
            }}
          />

          <button
            onClick={handleTeleportInput}
            style={{
              padding: '8px 20px',
              borderRadius: 8,
              border: 'none',
              background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
              color: '#fff',
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)',
              transition: 'transform 0.2s ease',
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.transform = 'translateY(-1px)')
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.transform = 'translateY(0)')
            }
          >
            🚀 위치 이동
          </button>

          <button
            onClick={onClose}
            style={{
              padding: '8px 20px',
              borderRadius: 8,
              border: '1px solid rgba(239, 68, 68, 0.3)',
              background: 'rgba(220, 38, 38, 0.1)',
              color: '#f87171',
              fontWeight: 500,
              fontSize: 13,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(220, 38, 38, 0.2)';
              e.currentTarget.style.color = '#fff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(220, 38, 38, 0.1)';
              e.currentTarget.style.color = '#f87171';
            }}
          >
            ✖ 닫기
          </button>
        </div>

        {/* status message */}
        <div
          style={{
            textAlign: 'center',
            marginTop: 12,
            color: '#3b82f6',
            fontFamily: "'Inter', sans-serif",
            fontSize: 12,
            fontWeight: 500,
            opacity: 0.8,
          }}
        >
          {statusMsg}
        </div>
      </div>
    </div>
  );
}
