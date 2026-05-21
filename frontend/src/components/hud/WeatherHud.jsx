import React, { useMemo } from 'react';

/**
 * WeatherHud — 실시간 기상 정보 패널.
 * 출항 전: 마우스 위치 기반 (전 항로 웨이포인트에서 최근접 탐색)
 * 출항 후: 선박 위치 기반 (현재 항로 웨이포인트에서 최근접 탐색)
 *
 * Props:
 *   shipPos        - { lat, lon } (출항 후: 선박 위치 / 출항 전: 마우스 위치)
 *   weatherData    - weather_latest.json 전체 (routes.XXX.waypoints[])
 *   currentRouteKey - 'NSR' | 'NWP' | 'TSR' | 'SUEZ' | 'CAPE'
 *   isMouseMode    - true면 마우스 탐색 모드 (출항 전)
 */
export default function WeatherHud({ shipPos, weatherData, currentRouteKey, isMouseMode }) {
  const nearest = useMemo(() => {
    const routes = weatherData?.routes;
    if (!routes) return null;

    // 출항 전 마우스 모드: 전체 항로의 웨이포인트에서 가장 가까운 지점
    // 출항 후: 현재 항로의 웨이포인트에서 가장 가까운 지점
    const routeKeys = isMouseMode ? Object.keys(routes) : [currentRouteKey];

    let best = null;
    let bestDist = Infinity;
    for (const rk of routeKeys) {
      const wps = routes[rk]?.waypoints;
      if (!wps) continue;
      for (const wp of wps) {
        const dLat = wp.lat - shipPos.lat;
        const dLon = wp.lon - shipPos.lon;
        const d = dLat * dLat + dLon * dLon;
        if (d < bestDist) {
          bestDist = d;
          best = wp;
        }
      }
    }
    return best;
  }, [shipPos.lat, shipPos.lon, weatherData, currentRouteKey, isMouseMode]);

  if (!nearest) return null;

  // //* [Modified Code] null fallback: API 데이터 없을 시 위도 기반 추정값 사용
  const lat = nearest.lat ?? shipPos.lat;
  const fallbackWave = lat > 78 ? 0.6 : lat > 68 ? 1.5 : lat > 50 ? 2.8 : 1.8;
  const fallbackVis = lat > 80 ? 2.0 : lat > 74 ? 5.0 : lat > 68 ? 8.0 : lat > 55 ? 12.0 : 15.0;
  const fallbackTemp = lat > 80 ? -1.8 : lat > 70 ? -0.5 : lat > 60 ? 2.1 : 8.5;

  const wave = nearest.wave_height_m ?? fallbackWave;
  const vis = nearest.visibility_km ?? fallbackVis;
  const temp = nearest.temperature_c ?? fallbackTemp;
  const sst = nearest.sst_c ?? null;

  // 해무 위험도: SST와 기온 차이 기반 (SST > 기온 → 해무 발생 가능)
  const fogDiff = (sst != null && temp != null) ? sst - temp : null;
  const fogRisk = fogDiff == null ? null
    : fogDiff >= 5.0 ? '높음'
    : fogDiff >= 2.0 ? '보통'
    : '낮음';

  // 파고 위험도 색상
  const waveColor = wave == null ? '#64748b'
    : wave > 4.0 ? '#ef4444'
    : wave > 2.5 ? '#f59e0b'
    : '#34d399';

  // 가시거리 위험도 색상
  const visColor = vis == null ? '#64748b'
    : vis < 1.0 ? '#ef4444'
    : vis < 5.0 ? '#f59e0b'
    : '#34d399';

  // 기온 위험도 색상
  const tempColor = temp == null ? '#64748b'
    : temp < -10 ? '#ef4444'
    : temp < 0 ? '#60a5fa'
    : '#34d399';

  // SST 색상
  const sstColor = sst == null ? '#64748b'
    : sst < 0 ? '#60a5fa'
    : sst < 10 ? '#38bdf8'
    : '#34d399';

  // 해무 위험도 색상
  const fogColor = fogRisk == null ? '#64748b'
    : fogRisk === '높음' ? '#ef4444'
    : fogRisk === '보통' ? '#f59e0b'
    : '#34d399';

  return (
    <div style={{
      width: '100%',
      boxSizing: 'border-box',
      fontFamily: "'Segoe UI', system-ui, sans-serif",
    }}>
      {/* 제목 + 모드 표시 */}
      <div style={{
        fontSize: 12,
        fontWeight: 700,
        color: '#e2e8f0',
        marginBottom: 6,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}>
        <span style={{ fontSize: 14 }}>{isMouseMode ? '🖱' : '🌊'}</span>
        <span>해역 기상</span>
        <span style={{
          marginLeft: 'auto',
          fontSize: 9,
          color: isMouseMode ? '#60a5fa' : '#64748b',
          fontWeight: 400,
          maxWidth: 110,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {isMouseMode ? '마우스 탐색' : nearest.name}
        </span>
      </div>
      {/* 마우스 모드: 좌표 + 웨이포인트명 / 항해 모드: 웨이포인트명만 */}
      <div style={{
        fontSize: 10,
        color: '#64748b',
        marginBottom: 8,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {isMouseMode
          ? `${shipPos.lat.toFixed(2)}°N ${shipPos.lon.toFixed(2)}°E → ${nearest.name}`
          : nearest.name}
      </div>

      {/* 5개 기상 지표 */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <Row
          icon="〰"
          label="파고"
          value={wave != null ? `${wave.toFixed(1)}` : null}
          unit="m"
          color={waveColor}
          bar={wave != null ? Math.min(wave / 8.0, 1.0) : 0}
          barColor={waveColor}
        />
        <Row
          icon="👁"
          label="가시거리"
          value={vis != null ? `${vis.toFixed(1)}` : null}
          unit="km"
          color={visColor}
          bar={vis != null ? Math.min(vis / 20.0, 1.0) : 0}
          barColor={visColor}
        />
        <Row
          icon="🌡"
          label="기온"
          value={temp != null ? `${temp > 0 ? '+' : ''}${temp.toFixed(1)}` : null}
          unit="°C"
          color={tempColor}
          bar={temp != null ? Math.min(Math.max((temp + 30) / 60, 0), 1.0) : 0}
          barColor={tempColor}
        />
        <Row
          icon="🌊"
          label="해수면 온도"
          value={sst != null ? `${sst > 0 ? '+' : ''}${sst.toFixed(1)}` : null}
          unit="°C"
          color={sstColor}
          bar={sst != null ? Math.min(Math.max((sst + 5) / 40, 0), 1.0) : 0}
          barColor={sstColor}
        />
        <Row
          icon="🌫"
          label="해무 위험"
          value={fogRisk}
          unit=""
          color={fogColor}
          bar={fogDiff != null ? Math.min(Math.max(fogDiff / 10, 0), 1.0) : 0}
          barColor={fogColor}
          isLast
        />
      </div>
    </div>
  );
}

function Row({ icon, label, value, unit, color, bar, barColor, isLast }) {
  const hasValue = value != null && value !== '';
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        padding: '6px 0',
        borderBottom: isLast ? 'none' : '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          minHeight: 16,
        }}
      >
        {/* 좌측: 아이콘 + 라벨 */}
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flexShrink: 0,
            fontSize: 12,
            color: '#94a3b8',
            whiteSpace: 'nowrap',
            lineHeight: 1,
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 14,
              height: 14,
              fontSize: 12,
              flexShrink: 0,
            }}
          >
            {icon}
          </span>
          <span>{label}</span>
        </span>
        {/* 우측: 값 + 단위 */}
        <span
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'flex-end',
            flexShrink: 0,
            textAlign: 'right',
            whiteSpace: 'nowrap',
            fontVariantNumeric: 'tabular-nums',
            lineHeight: 1,
          }}
        >
          {hasValue ? (
            <>
              <span
                style={{ fontSize: 13, fontWeight: 700, color }}
              >
                {value}
              </span>
              {unit && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 400,
                    color,
                    opacity: 0.7,
                    marginLeft: 3,
                  }}
                >
                  {unit}
                </span>
              )}
            </>
          ) : (
            <span
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: '#94a3b8',
                opacity: 0.4,
              }}
            >
              —
            </span>
          )}
        </span>
      </div>
      {/* 바 게이지 */}
      <div
        style={{
          height: 3,
          borderRadius: 2,
          background: 'rgba(255,255,255,0.06)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${(bar * 100).toFixed(0)}%`,
            borderRadius: 2,
            background: barColor,
            opacity: 0.7,
            transition: 'width 0.6s ease',
          }}
        />
      </div>
    </div>
  );
}
