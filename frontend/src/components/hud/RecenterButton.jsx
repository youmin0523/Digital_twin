import React from 'react';

/**
 * RecenterButton - floating button to re-center the camera on the ship.
 *
 * Props:
 *   onClick  - callback when clicked
 *   visible  - boolean, controls display (default true)
 */
export default function RecenterButton({ onClick, visible = true }) {
  if (!visible) return null;

  return (
    <div
      id="btn-recenter-float"
      style={{
        position: 'fixed',
        bottom: 85,
        right: 300,
        zIndex: 250,
      }}
    >
      <button
        onClick={onClick}
        className="recenter-btn"
        style={{
          background: 'rgba(16, 185, 129, 0.2)',
          border: '1px solid #10b981',
          color: '#34d399',
          padding: '10px 20px',
          borderRadius: 8,
          fontFamily: "'Courier New', monospace",
          fontSize: 13,
          fontWeight: 'bold',
          cursor: 'pointer',
          transition: 'all 0.2s',
          backdropFilter: 'blur(4px)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
        }}
      >
        {'\u2316'} 선박 위치로 복귀
      </button>
    </div>
  );
}
