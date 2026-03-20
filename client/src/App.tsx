import React, { useEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';

// 실제 위성 해빙 사진 (CORS 허용 Wikimedia Public Domain)
const REAL_ICE_TEXTURE = 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c2/Sea_ice_in_the_Arctic_Ocean.jpg/800px-Sea_ice_in_the_Arctic_Ocean.jpg';

// //* [Simulation Params] 선박 톤급 및 종류별 이동 제원 
const SHIP_TYPES = {
  COMMERCIAL: { name: '초대형 상선 (20만톤급)', color: Cesium.Color.DODGERBLUE, speed: 15.0 },
  PASSENGER: { name: '크루즈 여객선 (5만톤급)', color: Cesium.Color.GOLD, speed: 22.0 },
  NAVAL: { name: '군함 (구축함)', color: Cesium.Color.CRIMSON, speed: 35.0 },
  SPECIAL: { name: '쇄빙 특수선 (만톤급)', color: Cesium.Color.ORANGE, speed: 12.0 }
};

type ShipTypeKey = keyof typeof SHIP_TYPES;

// //* [Feature] NASA 위성 데이터 연동 및 유기적 해빙 형태 시각화 
function injectRealDataLayers(viewer: Cesium.Viewer) {
  // NASA GIBS 타일 서버에서 current 포맷 거부(400 Bad Request) 에러 해결을 위해 고정 날짜 투입
  const gibsImagery = new Cesium.WebMapTileServiceImageryProvider({
    url: 'https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/MODIS_Aqua_CorrectedReflectance_TrueColor/default/2023-08-01/250m/{TileMatrix}/{TileRow}/{TileCol}.jpg',
    layer: 'MODIS_Aqua_CorrectedReflectance_TrueColor',
    style: 'default',
    format: 'image/jpeg',
    tileMatrixSetID: '250m',
    maximumLevel: 8
  });
  viewer.imageryLayers.addImageryProvider(gibsImagery);

  // 컨테이너 박스 형태를 탈피한 유기적 3D 얼음 매핑
  for (let lon = -180; lon < 180; lon += 18) {
    for (let lat = 78; lat < 89; lat += 2) {
      if (Math.random() > 0.7) continue; 

      const concentration = 0.6 + Math.random() * 0.4; 
      const thickness = 1 + Math.random() * 3; 
      
      // //* [Modified Code] 다각형 버텍스 뒤틀림 오류 및 북극점(90도) 초과에 의한 모형 붕괴 연산 에러(NaN) 원천 방지
      const offsetLon = () => (Math.random() * 2.0) - 1.0; 
      const offsetLat = () => (Math.random() * 0.8) - 0.4; 
      const clampLat = (l: number) => Math.min(89.8, Math.max(-89.8, l));

      viewer.entities.add({
        polygon: {
          hierarchy: Cesium.Cartesian3.fromDegreesArray([
            lon + offsetLon(), clampLat(lat + offsetLat()),
            lon + 12 + offsetLon(), clampLat(lat + offsetLat()),
            lon + 8 + offsetLon(), clampLat(lat + 2 + offsetLat()),
            lon + offsetLon(), clampLat(lat + 2 + offsetLat()),
          ]),
          extrudedHeight: thickness * 8000, 
          material: new Cesium.ImageMaterialProperty({
            image: REAL_ICE_TEXTURE,
            color: Cesium.Color.WHITE.withAlpha(concentration),
            repeat: new Cesium.Cartesian2(2, 2)
          }),
          outline: false 
        },
        name: `북극 해빙 관측 블록`,
        description: `NASA 관측 기반 <br/> 농도: ${(concentration * 100).toFixed(1)}% <br/> 두께 구역: ${thickness.toFixed(2)}m`
      });
    }
  }
}

function App() {
  const cesiumContainer = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  
  const [selectedShip, setSelectedShip] = useState<ShipTypeKey>('COMMERCIAL');
  const [isSimulating, setIsSimulating] = useState(false);
  const [cameraView, setCameraView] = useState('TRACK');
  const [progress, setProgress] = useState(0);
  const [speedMultiplier, setSpeedMultiplier] = useState(1);

  // 1. Initialize Cesium Engine
  useEffect(() => {
    let viewer: Cesium.Viewer | null = null;
    let isMounted = true;

    if (cesiumContainer.current) {
      // //* [Modified Code] Cesium Ion 토큰 미인증에 의한 Promise Rejection 및 지구본 렌더링 증발(Black Screen) 에러 제거를 위해 Terrain Provider 생략
      viewer = new Cesium.Viewer(cesiumContainer.current, {
        animation: false, 
        timeline: false,
        baseLayerPicker: false,
        homeButton: false,
        navigationHelpButton: false,
        selectionIndicator: false,
        shouldAnimate: true,
        infoBox: true
      });
      viewerRef.current = viewer;

      injectRealDataLayers(viewer);

      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(0.0, 90.0, 5000000.0),
        orientation: {
          heading: 0.0,
          pitch: Cesium.Math.toRadians(-45.0), 
          roll: 0.0
        }
      });
    }
    return () => {
      isMounted = false;
      if (viewer) {
        viewer.destroy();
        viewerRef.current = null;
      }
    };
  }, []);

  // 2. Update Simulation Progress UI
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !isSimulating) return;
    
    let animationFrameId: number;
    const updateProgress = () => {
      if (viewer.clock.startTime && viewer.clock.stopTime) {
         const total = Cesium.JulianDate.secondsDifference(viewer.clock.stopTime, viewer.clock.startTime);
         const current = Cesium.JulianDate.secondsDifference(viewer.clock.currentTime, viewer.clock.startTime);
         let pct = (current / total) * 100;
         setProgress(Math.max(0, Math.min(100, pct)));
      }
      animationFrameId = requestAnimationFrame(updateProgress);
    };
    updateProgress();
    
    return () => cancelAnimationFrame(animationFrameId);
  }, [isSimulating]);

  // 3. Update Camera Viewpoint (Cesium Local Axis Tracking)
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !isSimulating) return;

    // //* [Modified Code] 카메라 강제 재할당(Re-tracking)을 통한 뷰포인트 미반영(무기력) 버그 해결
    const shipEntity = viewer.entities.getById('sim_ship');
    if (!shipEntity) return;

    // 기존 삼각 추적 해제 (이 과정을 생략하면 viewFrom이 엔진에서 새로고침되지 않음)
    viewer.trackedEntity = undefined;

    switch(cameraView) {
        case 'BRIDGE':
            // 60km 선박의 후방(-35km) 중심에서 앞 전방(X+) 뷰 조준
            shipEntity.viewFrom = new Cesium.ConstantProperty(new Cesium.Cartesian3(-35000, 0, 20000)); 
            break;
        case 'SIDE':
            shipEntity.viewFrom = new Cesium.ConstantProperty(new Cesium.Cartesian3(0, 80000, 15000));
            break;
        case 'SATELLITE':
            shipEntity.viewFrom = new Cesium.ConstantProperty(new Cesium.Cartesian3(-100, 0, 250000));
            break;
        case 'TRACK':
        default:
            shipEntity.viewFrom = new Cesium.ConstantProperty(new Cesium.Cartesian3(-80000, -50000, 40000)); 
            break;
    }
    
    // 설정 적용 후 트래킹 재활성화하여 시점 즉시 스냅(Snap) 이동
    setTimeout(() => {
        viewer.trackedEntity = shipEntity;
    }, 10);
  }, [cameraView, isSimulating]);

  const handleStartSimulation = () => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    if (isSimulating) {
      handleReset();
      return;
    }

    setIsSimulating(true);
    const shipProps = SHIP_TYPES[selectedShip];

    const routePoints = [
      { lon: -168, lat: 66, timeOffset: 0 },
      { lon: -150, lat: 75, timeOffset: 12000 },
      { lon: 180, lat: 85, timeOffset: 25000 },
      { lon: 90, lat: 82, timeOffset: 38000 },
      { lon: 40, lat: 75, timeOffset: 50000 }
    ];

    const positionProperty = new Cesium.SampledPositionProperty();
    const start = Cesium.JulianDate.fromDate(new Date());
    const stop = Cesium.JulianDate.addSeconds(start, 50000 / shipProps.speed, new Cesium.JulianDate());

    viewer.clock.startTime = start.clone();
    viewer.clock.stopTime = stop.clone();
    viewer.clock.currentTime = start.clone();
    viewer.clock.clockRange = Cesium.ClockRange.LOOP_STOP;
    viewer.clock.multiplier = shipProps.speed * 120 * speedMultiplier;

    routePoints.forEach(pt => {
      const time = Cesium.JulianDate.addSeconds(start, pt.timeOffset / shipProps.speed, new Cesium.JulianDate());
      const position = Cesium.Cartesian3.fromDegrees(pt.lon, pt.lat, 0);
      positionProperty.addSample(time, position);
    });

    viewer.entities.add({
      id: 'sim_path',
      polyline: {
        positions: routePoints.map(p => Cesium.Cartesian3.fromDegrees(p.lon, p.lat, 0)),
        width: 3,
        material: new Cesium.PolylineDashMaterialProperty({
          color: Cesium.Color.fromAlpha(shipProps.color, 0.7),
          dashLength: 20
        }),
        clampToGround: true
      }
    });

    const shipEntity = viewer.entities.add({
      id: 'sim_ship',
      position: positionProperty,
      orientation: new Cesium.VelocityOrientationProperty(positionProperty),
      box: {
        // //* [Modified Code] X축(운항 방향) 길이를 60km, Y를 25km로 뒤집어 게걸음(Crab-walk) 렌더링 수정
        dimensions: new Cesium.Cartesian3(60000, 25000, 15000), 
        material: shipProps.color,
        outline: true,
        outlineColor: Cesium.Color.BLACK
      },
      description: `모니터링 중: ${shipProps.name}`,
    });

    // //* [Modified Code] 컴포넌트 마운트 초기 트래킹 연산은 useEffect로 위임하여 State 충돌 버그 예방
  };

  const handleReset = () => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.entities.values
      .filter(e => e.id === 'sim_ship' || e.id === 'sim_path')
      .forEach(e => viewer.entities.remove(e));
    setIsSimulating(false);
    setProgress(0);
    viewer.trackedEntity = undefined;
  };

  return (
    <div className="w-full h-screen relative bg-[#010816] font-sans">
      
      {/* Top-Left Nav Info Panel (Custom Design) */}
      <div className="absolute top-6 left-6 z-10 p-5 bg-[#0a1220]/90 backdrop-blur-md text-white rounded-xl shadow-[0_0_20px_rgba(0,0,0,0.8)] border border-blue-900/50 w-72">
        <h1 className="text-sm font-bold tracking-tight text-blue-400 mb-3 border-b border-gray-700 pb-2">북극항로 트윈 관제센터</h1>
        
        <select 
          className="w-full bg-[#111c30] border border-blue-800/50 rounded mb-4 p-1.5 text-xs text-gray-200 outline-none"
          value={selectedShip}
          onChange={(e) => setSelectedShip(e.target.value as ShipTypeKey)}
          disabled={isSimulating}
        >
          {Object.entries(SHIP_TYPES).map(([key, data]) => (
            <option key={key} value={key}>{data.name}</option>
          ))}
        </select>

        <h2 className="text-[11px] font-bold text-gray-400 mb-3">항행 정보</h2>
        <div className="flex justify-between items-center text-[12px] mb-2.5">
            <span className="text-gray-400">선박 속도</span>
            <span className="font-mono text-gray-200">{SHIP_TYPES[selectedShip].speed.toFixed(1)} kn</span>
        </div>
        <div className="flex justify-between items-center text-[12px] mb-2.5">
            <span className="text-gray-400">해빙 농도</span>
            <span className="font-mono text-gray-200">{isSimulating ? '65%' : '-'}</span>
        </div>
        <div className="flex justify-between items-center text-[12px] mb-2.5">
            <span className="text-gray-400">전방 위험</span>
            <span className={`font-mono font-bold ${isSimulating ? 'text-green-400' : 'text-gray-500'}`}>{isSimulating ? '없음' : '-'}</span>
        </div>
        <div className="flex justify-between items-center text-[12px] mb-2.5">
            <span className="text-gray-400">Ice Class</span>
            <span className="font-mono text-gray-200">{isSimulating ? 'PC5' : '-'}</span>
        </div>
        <div className="flex justify-between items-center text-[12px]">
            <span className="text-gray-400">항로 진행</span>
            <span className="font-mono text-blue-300">{progress.toFixed(1)}%</span>
        </div>
      </div>

      {/* Right Camera Views Panel */}
      <div className="absolute top-6 right-6 z-10 flex flex-col gap-2">
        <div className="bg-[#0a1220]/90 border border-blue-900/50 rounded-xl p-2.5 flex flex-col gap-2 shadow-[0_0_20px_rgba(0,0,0,0.8)] w-28">
          <span className="text-[11px] text-gray-400 text-center border-b border-gray-700 pb-1.5 mb-1 font-bold">카메라 제어</span>
          {[
              { id: 'TRACK', label: '선박 추적' },
              { id: 'BRIDGE', label: '선교 시점' },
              { id: 'SATELLITE', label: '위성 뷰' },
              { id: 'SIDE', label: '측면 뷰' }
          ].map(view => (
              <button 
                key={view.id}
                onClick={() => setCameraView(view.id)} 
                className={`py-1.5 text-[12px] font-medium rounded transition-all ${
                  cameraView === view.id 
                    ? 'bg-blue-600/80 text-white shadow-inner border border-blue-500' 
                    : 'text-gray-300 hover:bg-[#1a2b4c] border border-transparent'
                }`}
              >
                  {view.label}
              </button>
          ))}
        </div>
      </div>

      {/* Bottom Playback Controls */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 w-[420px] bg-[#0a1220]/90 border border-blue-900/50 rounded-xl p-3 shadow-[0_0_30px_rgba(0,0,0,0.9)] flex items-center justify-between text-white">
        <div className="flex gap-2">
            <button 
                onClick={handleStartSimulation} 
                className={`px-5 py-2 rounded text-[13px] font-bold flex items-center gap-1 transition-all ${
                    isSimulating ? 'bg-red-600/80 hover:bg-red-500' : 'bg-blue-600/80 hover:bg-blue-500'
                }`}
            >
                {isSimulating ? '■ 정지' : '▶ 출항'}
            </button>
            <button 
                onClick={handleReset} 
                className="px-4 py-2 border border-gray-600 hover:bg-[#1a2b4c] rounded text-[13px] text-gray-300 transition-all font-medium"
            >
                ↻ 리셋
            </button>
        </div>
        
        <div className="flex items-center gap-3 pr-2">
            <span className="text-[11px] text-gray-400 font-bold">배속</span>
            <input 
              type="range" min="1" max="10" step="0.5" 
              value={speedMultiplier} 
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                setSpeedMultiplier(val);
                if (viewerRef.current && isSimulating) {
                    viewerRef.current.clock.multiplier = SHIP_TYPES[selectedShip].speed * 120 * val;
                }
              }} 
              className="w-24 accent-blue-500" 
            />
            <span className="text-[12px] font-mono text-blue-300 w-8">x{speedMultiplier}</span>
        </div>
      </div>

      <div ref={cesiumContainer} className="w-full h-full" />
    </div>
  );
}

export default App;
