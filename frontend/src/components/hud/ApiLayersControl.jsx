import React from 'react';

const LAYERS = [
  { id: 'layer-nsidc-conc', stateKey: 'nsidcConc', label: 'NSIDC 해빙 농도',       title: '북극해 해빙의 면적 대비 얼음의 비율(%)을 실시간 시각화합니다.' },
  { id: 'layer-cop-thick',  stateKey: 'copThick',  label: 'Copernicus 해빙 두께',    title: 'Copernicus 모델 기반의 해빙 두께 예측값을 시각화합니다.' },
  { id: 'layer-nsidc-edge', stateKey: 'nsidcEdge', label: 'NSIDC 경계선 (Today)',       title: '위성 밝기온도 데이터 기반으로 오늘의 해빙 경계선을 표시합니다.' },
  { id: 'layer-esa-sar',    stateKey: 'esaSar',    label: 'ESA Sentinel-1 위성',             title: 'ESA 주관 센티널-1 위성의 합성개구레이더(SAR) 영상을 제공합니다.' },
  { id: 'layer-gebco-bathy', stateKey: 'gebcoBathy', label: 'GEBCO 해저 수심도', title: 'EMODnet/GEBCO 수심 척도 및 해저 지형을 시각화합니다.' },
  { id: 'layer-s2-true',    stateKey: 's2True',    label: 'Sentinel-2 자연색',           title: '광학 위성의 자연색 및 고해상도 구름 이미지를 시각화합니다.' },
  { id: 'layer-s2-ndsi',    stateKey: 's2Ndsi',    label: 'Sentinel-2 NDSI (해빙 탐지)', title: '해빙 탐지 지수(NDSI)를 표시하여 눈과 구름을 명확히 구분합니다.' },
];

export default function ApiLayersControl({
  layerStates,
  onLayerToggle,
  gebcoOpacity,
  onGebcoOpacityChange,
  satVisible,
  onSatToggle,
}) {
  const states = layerStates || {};
  const opacity = gebcoOpacity != null ? gebcoOpacity : 75;
  const gebcoChecked = !!states.gebcoBathy;

  return (
    <div className="hud" id="hud-api-layers" style={{
      minWidth: '240px',
      border: '1px solid rgba(52, 211, 153, 0.3)',
      background: 'rgba(15, 23, 42, 0.8)',
    }}>
      <div className="hud-title" style={{ color: '#34d399' }}>
        실시간 WMS 데이터 레이어
      </div>

      <div
        className="hud-row"
        style={{ justifyContent: 'flex-start', gap: '12px', margin: '8px 0', paddingBottom: '8px', borderBottom: '1px solid rgba(52,211,153,0.15)' }}
        title="NASA MODIS Terra/Aqua + VIIRS 위성 실사영상 (계절 변화 반영)"
      >
        <input
          type="checkbox"
          id="layer-sat"
          className="api-cb"
          style={{ accentColor: '#f59e0b', cursor: 'pointer', transform: 'scale(1.1)' }}
          checked={!!satVisible}
          onChange={(e) => onSatToggle && onSatToggle(e.target.checked)}
        />
        <label htmlFor="layer-sat" className="hud-label" style={{
          cursor: 'pointer',
          color: satVisible ? '#f59e0b' : '#94a3b8',
          fontSize: '12px',
          transition: 'color 0.2s',
        }}>
          위성 실사영상 (MODIS/VIIRS)
        </label>
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
                {'투명도'}
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
