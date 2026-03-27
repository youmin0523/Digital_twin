import React from 'react';

const LAYERS = [
  { id: 'layer-nsidc-conc', stateKey: 'nsidcConc', label: 'NSIDC \uD574\uBE59 \uB18D\uB3C4',       title: '\uBD81\uADF9\uD574 \uD574\uBE59\uC758 \uBA74\uC801 \uB300\uBE44 \uC5BC\uC74C\uC758 \uBE44\uC728(%)\uC744 \uC2E4\uC2DC\uAC04 \uC2DC\uAC01\uD654\uD569\uB2C8\uB2E4.' },
  { id: 'layer-cop-thick',  stateKey: 'copThick',  label: 'Copernicus \uD574\uBE59 \uB450\uAED8',    title: 'Copernicus \uBAA8\uB378 \uAE30\uBC18\uC758 \uD574\uBE59 \uB450\uAED8 \uC608\uCE21\uAC12\uC744 \uC2DC\uAC01\uD654\uD569\uB2C8\uB2E4.' },
  { id: 'layer-nsidc-edge', stateKey: 'nsidcEdge', label: 'NSIDC \uACBD\uACC4\uC120 (Today)',       title: '\uC704\uC131 \uBC1D\uAE30\uC628\uB3C4 \uB370\uC774\uD130 \uAE30\uBC18\uC73C\uB85C \uC624\uB298\uC758 \uD574\uBE59 \uACBD\uACC4\uC120\uC744 \uD45C\uC2DC\uD569\uB2C8\uB2E4.' },
  { id: 'layer-esa-sar',    stateKey: 'esaSar',    label: 'ESA Sentinel-1 \uC704\uC131',             title: 'ESA \uC8FC\uAD00 \uC13C\uD2F0\uB110-1 \uC704\uC131\uC758 \uD569\uC131\uAC1C\uAD6C\uB808\uC774\uB354(SAR) \uC601\uC0C1\uC744 \uC81C\uACF5\uD569\uB2C8\uB2E4.' },
  { id: 'layer-gebco-bathy', stateKey: 'gebcoBathy', label: 'GEBCO \uD574\uC800 \uC218\uC2EC\uB3C4', title: 'EMODnet/GEBCO \uC218\uC2EC \uCC99\uB3C4 \uBC0F \uD574\uC800 \uC9C0\uD615\uC744 \uC2DC\uAC01\uD654\uD569\uB2C8\uB2E4.' },
  { id: 'layer-s2-true',    stateKey: 's2True',    label: 'Sentinel-2 \uC790\uC5F0\uC0C9',           title: '\uAD11\uD559 \uC704\uC131\uC758 \uC790\uC5F0\uC0C9 \uBC0F \uACE0\uD574\uC0C1\uB3C4 \uAD6C\uB984 \uC774\uBBF8\uC9C0\uB97C \uC2DC\uAC01\uD654\uD569\uB2C8\uB2E4.' },
  { id: 'layer-s2-ndsi',    stateKey: 's2Ndsi',    label: 'Sentinel-2 NDSI (\uD574\uBE59 \uD0D0\uC9C0)', title: '\uD574\uBE59 \uD0D0\uC9C0 \uC9C0\uC218(NDSI)\uB97C \uD45C\uC2DC\uD558\uC5EC \uB208\uACFC \uAD6C\uB984\uC744 \uBA85\uD655\uD788 \uAD6C\uBD84\uD569\uB2C8\uB2E4.' },
];

export default function ApiLayersControl({
  layerStates,
  onLayerToggle,
  gebcoOpacity,
  onGebcoOpacityChange,
}) {
  const states = layerStates || {};
  const opacity = gebcoOpacity != null ? gebcoOpacity : 75;
  const gebcoChecked = !!states.gebcoBathy;

  return (
    <div className="hud" id="hud-api-layers" style={{ 
      top: '12px', 
      left: '232px', 
      minWidth: '240px', 
      border: '1px solid rgba(52, 211, 153, 0.3)',
      background: 'rgba(15, 23, 42, 0.8)'
    }}>
      {/* // //! [Original Code] <div className="hud-title" style={{ color: '#34d399' }}> */}
      {/* // //* [Modified Code] 에메랄드 컬러 포인트 유지 및 아이콘 최적화 */}
      <div className="hud-title" style={{ color: '#34d399' }}>
        🌍 실시간 WMS 데이터 레이어
      </div>

      {LAYERS.map(({ id, stateKey, label, title }) => (
        <React.Fragment key={id}>
          <div
            className="hud-row"
            style={{ justifyContent: 'flex-start', gap: '12px', margin: '8px 0' }}
            title={title}
          >
            <input
              type="checkbox"
              id={id}
              className="api-cb"
              style={{ accentColor: '#34d399', cursor: 'pointer', transform: 'scale(1.1)' }}
              checked={!!states[stateKey]}
              onChange={(e) => onLayerToggle && onLayerToggle(stateKey, e.target.checked)}
            />
            <label htmlFor={id} className="hud-label" style={{ 
              cursor: 'pointer', 
              color: states[stateKey] ? '#f1f5f9' : '#94a3b8',
              fontSize: '12px',
              transition: 'color 0.2s'
            }}>
              {label}
            </label>
          </div>

          {/* GEBCO opacity slider — shown right after the GEBCO checkbox */}
          {stateKey === 'gebcoBathy' && (
            <div
              id="gebco-opacity-row"
              style={{
                display: gebcoChecked ? 'flex' : 'none',
                alignItems: 'center',
                gap: '8px',
                margin: '2px 0 6px 20px',
              }}
            >
              <span className="hud-label" style={{ fontSize: '10px', whiteSpace: 'nowrap' }}>
                {'\uD22C\uBA85\uB3C4'}
              </span>
              <input
                type="range"
                id="gebco-opacity-slider"
                min="30"
                max="100"
                step="5"
                value={opacity}
                style={{ width: '90px', accentColor: '#34d399', verticalAlign: 'middle' }}
                onChange={(e) => onGebcoOpacityChange && onGebcoOpacityChange(Number(e.target.value))}
              />
              <span id="gebco-opacity-label" className="hud-value" style={{ fontSize: '10px', minWidth: '28px' }}>
                {opacity}%
              </span>
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}
