import React from 'react';

/* ── Shared legend panel base style ── */
const panelBase = {
  background: 'rgba(13, 19, 41, 0.9)',
  border: '1px solid #1a2a4a',
  borderRadius: '4px',
  padding: '10px 14px 8px',
  fontFamily: "'Segoe UI', system-ui, sans-serif",
  backdropFilter: 'blur(8px)',
  boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
  minWidth: '280px',
  maxWidth: '320px',
  pointerEvents: 'auto',
};

/* ================================================================
   GEBCO Bathymetry Legend // 테스트 주석
   ================================================================ */
function GebcoLegend() {
  return (
    <div
      id="gebco-legend"
      style={{ ...panelBase, borderColor: '#059669' }}
    >
      {/* Title */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <span style={{ color: '#34d399', fontSize: '11px', letterSpacing: '1px', fontWeight: 'bold' }}>
          {'\uD83C\uDF0A'} \uD574\uC800 \uC218\uC2EC\uB3C4
        </span>
        <span style={{ color: '#4a7a6a', fontSize: '9px' }}>EMODnet / GEBCO 2024</span>
      </div>

      {/* Color bar + cursor */}
      <div style={{ position: 'relative', marginBottom: '6px' }}>
        <div
          id="gebco-colorbar-h"
          style={{
            width: '100%',
            height: '18px',
            borderRadius: '4px',
            background: 'linear-gradient(to right, #6600cc 0%, #0000ff 20%, #0099ff 40%, #00cc66 55%, #ccff00 70%, #ffaa00 85%, #ff3300 100%)',
            border: '1px solid rgba(52,211,153,0.25)',
          }}
        />
        {/* Depth cursor (click-driven) */}
        <div
          id="gebco-depth-cursor"
          style={{
            display: 'none',
            position: 'absolute',
            top: '-4px',
            width: '3px',
            height: '26px',
            background: '#ffffff',
            borderRadius: '2px',
            boxShadow: '0 0 6px rgba(255,255,255,0.8)',
            transform: 'translateX(-50%)',
            pointerEvents: 'none',
          }}
        />
      </div>

      {/* Depth labels */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
        <span style={{ fontSize: '9px', color: '#bb88ff' }}>6000m+</span>
        <span style={{ fontSize: '9px', color: '#5599ff' }}>4000m</span>
        <span style={{ fontSize: '9px', color: '#00ccff' }}>2000m</span>
        <span style={{ fontSize: '9px', color: '#00dd77' }}>1000m</span>
        <span style={{ fontSize: '9px', color: '#ddff44' }}>200m</span>
        <span style={{ fontSize: '9px', color: '#ffbb33' }}>50m</span>
        <span style={{ fontSize: '9px', color: '#ff4411' }}>0m</span>
      </div>

      {/* Zone labels */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        borderTop: '1px solid rgba(52,211,153,0.15)',
        paddingTop: '7px',
        gap: '2px',
      }}>
        <div style={{ textAlign: 'center', flex: 1.2 }}>
          <div style={{ fontSize: '8px', color: '#9966cc', marginBottom: '2px' }}>{'\u25CF'}</div>
          <div style={{ fontSize: '8px', color: '#9966cc', lineHeight: 1.2 }}>
            {'\uCD08\uC2EC\uD574'}<br /><span style={{ color: '#555' }}>&gt;6000m</span>
          </div>
        </div>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ fontSize: '8px', color: '#4477ff', marginBottom: '2px' }}>{'\u25CF'}</div>
          <div style={{ fontSize: '8px', color: '#4477ff', lineHeight: 1.2 }}>
            {'\uC2EC\uD574'}<br /><span style={{ color: '#555' }}>2~6km</span>
          </div>
        </div>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ fontSize: '8px', color: '#00ccaa', marginBottom: '2px' }}>{'\u25CF'}</div>
          <div style={{ fontSize: '8px', color: '#00ccaa', lineHeight: 1.2 }}>
            {'\uB300\uB959\uC0AC\uBA74'}<br /><span style={{ color: '#555' }}>200~2km</span>
          </div>
        </div>
        <div style={{ textAlign: 'center', flex: 0.8 }}>
          <div style={{ fontSize: '8px', color: '#aaee22', marginBottom: '2px' }}>{'\u25CF'}</div>
          <div style={{ fontSize: '8px', color: '#aaee22', lineHeight: 1.2 }}>
            {'\uB300\uB959\uBD95'}<br /><span style={{ color: '#555' }}>&lt;200m</span>
          </div>
        </div>
        <div style={{ textAlign: 'center', flex: 0.7 }}>
          <div style={{ fontSize: '8px', color: '#ff6622', marginBottom: '2px' }}>{'\u25CF'}</div>
          <div style={{ fontSize: '8px', color: '#ff6622', lineHeight: 1.2 }}>
            {'\uC5F0\uC548'}<br /><span style={{ color: '#555' }}>&lt;50m</span>
          </div>
        </div>
      </div>

      {/* Depth probe readout */}
      <div
        id="gebco-probe-readout"
        style={{
          display: 'none',
          marginTop: '8px',
          padding: '5px 8px',
          background: 'rgba(52,211,153,0.12)',
          border: '1px solid rgba(52,211,153,0.35)',
          borderRadius: '4px',
          fontSize: '11px',
          color: '#34d399',
          textAlign: 'center',
        }}
      >
        {'\uD83D\uDCCD'} <span id="gebco-probe-text">{'\u2014'}</span>
      </div>
    </div>
  );
}

/* ================================================================
   NSIDC Sea Ice Concentration Legend
   ================================================================ */
function NsidcLegend() {
  return (
    <div
      id="nsidc-legend"
      style={{ ...panelBase, borderColor: '#3b82f6' }}
    >
      {/* Title */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <span style={{ color: '#60a5fa', fontSize: '11px', letterSpacing: '1px', fontWeight: 'bold' }}>
          {'\u2744\uFE0F'} \uD574\uBE59 \uB18D\uB3C4 (Ice Concentration)
        </span>
        <span style={{ color: '#3b82f6', fontSize: '9px' }}>NASA AMSRU2 25km</span>
      </div>

      {/* Color bar — 실사풍 투명→청회색→흰색 그라데이션 */}
      <div style={{ position: 'relative', marginBottom: '6px' }}>
        <div style={{
          width: '100%',
          height: '18px',
          borderRadius: '4px',
          background: 'linear-gradient(to right, rgba(13,79,139,0) 0%, rgba(90,130,160,0.3) 10%, rgba(140,180,200,0.5) 30%, rgba(180,210,225,0.7) 50%, rgba(210,230,240,0.85) 70%, rgba(240,248,255,0.95) 100%)',
          border: '1px solid rgba(59,130,246,0.3)',
        }} />
      </div>

      {/* Percentage labels */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
        <span style={{ fontSize: '9px', color: '#666' }}>0%</span>
        <span style={{ fontSize: '9px', color: '#8aa0a8' }}>30%</span>
        <span style={{ fontSize: '9px', color: '#a0c0d0' }}>50%</span>
        <span style={{ fontSize: '9px', color: '#b4d2e1' }}>70%</span>
        <span style={{ fontSize: '9px', color: '#d2e6f0' }}>85%</span>
        <span style={{ fontSize: '9px', color: '#f0f8ff' }}>100%</span>
      </div>

      {/* Zone labels */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        borderTop: '1px solid rgba(59,130,246,0.15)',
        paddingTop: '7px',
        gap: '2px',
      }}>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ fontSize: '8px', color: '#5a82a0', marginBottom: '2px' }}>{'\u25CF'}</div>
          <div style={{ fontSize: '8px', color: '#5a82a0', lineHeight: 1.2 }}>
            {'\uC800\uB18D\uB3C4'}<br /><span style={{ color: '#555' }}>10~30%</span>
          </div>
        </div>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ fontSize: '8px', color: '#8cb4c8', marginBottom: '2px' }}>{'\u25CF'}</div>
          <div style={{ fontSize: '8px', color: '#8cb4c8', lineHeight: 1.2 }}>
            {'\uC911\uB18D\uB3C4'}<br /><span style={{ color: '#555' }}>30~50%</span>
          </div>
        </div>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ fontSize: '8px', color: '#b4d2e1', marginBottom: '2px' }}>{'\u25CF'}</div>
          <div style={{ fontSize: '8px', color: '#b4d2e1', lineHeight: 1.2 }}>
            {'\uACE0\uB18D\uB3C4'}<br /><span style={{ color: '#555' }}>50~85%</span>
          </div>
        </div>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ fontSize: '8px', color: '#f0f8ff', marginBottom: '2px' }}>{'\u25CF'}</div>
          <div style={{ fontSize: '8px', color: '#f0f8ff', lineHeight: 1.2 }}>
            {'\uADF9\uACE0\uB18D\uB3C4'}<br /><span style={{ color: '#555' }}>85~100%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================================================================
   Copernicus Ice Thickness Legend
   ================================================================ */
function CopLegend() {
  return (
    <div
      id="cop-legend"
      style={{ ...panelBase, borderColor: '#a855f7' }}
    >
      {/* Title */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <span style={{ color: '#c084fc', fontSize: '11px', letterSpacing: '1px', fontWeight: 'bold' }}>
          {'\uD83E\uDDCA'} \uD574\uBE59 \uB450\uAED8 (Ice Thickness)
        </span>
        <span style={{ color: '#a855f7', fontSize: '9px' }}>Copernicus Marine</span>
      </div>

      {/* Color bar */}
      <div style={{ position: 'relative', marginBottom: '6px' }}>
        <div style={{
          width: '100%',
          height: '18px',
          borderRadius: '4px',
          background: 'linear-gradient(to right, #1e1b4b 0%, #4c1d95 20%, #7c3aed 40%, #a855f7 60%, #d8b4fe 80%, #ffffff 100%)',
          border: '1px solid rgba(168,85,247,0.3)',
        }} />
      </div>

      {/* Thickness labels */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
        <span style={{ fontSize: '9px', color: '#4a6a8a' }}>0m</span>
        <span style={{ fontSize: '9px', color: '#7c3aed' }}>1m</span>
        <span style={{ fontSize: '9px', color: '#a855f7' }}>2m</span>
        <span style={{ fontSize: '9px', color: '#d8b4fe' }}>3m</span>
        <span style={{ fontSize: '9px', color: '#e9d5ff' }}>4m</span>
        <span style={{ fontSize: '9px', color: '#ffffff' }}>5m+</span>
      </div>
    </div>
  );
}

/* ================================================================
   Main LegendContainer
   ================================================================ */
export default function LegendContainer({
  gebcoVisible,
  nsidcVisible,
  copVisible,
}) {
  const anyVisible = gebcoVisible || nsidcVisible || copVisible;
  if (!anyVisible) return null;

  return (
    <div
      id="legends-container"
      style={{
        position: 'absolute',
        bottom: '60px',
        left: '10px',
        zIndex: 210,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        pointerEvents: 'none',
      }}
    >
      {nsidcVisible && <NsidcLegend />}
      {copVisible && <CopLegend />}
      {gebcoVisible && <GebcoLegend />}
    </div>
  );
}
