import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import { useAppContext } from '../context/AppContext';

// 실제 빙하 두께 1m → 시각적 높이 15,000m (지구본에서 가시성 확보)
const HEIGHT_EXAGGERATION = 15000;

export default function IceThicknessLayer() {
  const { state, viewerRef, iceDataRef } = useAppContext();
  // Entity DataSource는 제거하고 Primitive 직접 관리
  const primitiveRef = useRef<Cesium.Primitive | null>(null);
  const viewerReadyRef = useRef(false);

  // Viewer 초기화 대기
  useEffect(() => {
    const checkViewer = setInterval(() => {
      if (!viewerRef.current || viewerRef.current.isDestroyed()) return;
      clearInterval(checkViewer);
      viewerReadyRef.current = true;
    }, 200);

    return () => {
      clearInterval(checkViewer);
      // 컴포넌트 언마운트 시 Primitive 정리
      if (primitiveRef.current && viewerRef.current && !viewerRef.current.isDestroyed()) {
        viewerRef.current.scene.primitives.remove(primitiveRef.current);
        primitiveRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    // 기존 Primitive 제거
    if (primitiveRef.current) {
      viewer.scene.primitives.remove(primitiveRef.current);
      primitiveRef.current = null;
    }

    if (!state.layerVisibility.iceThickness) return;

    const dataset = iceDataRef.current[state.currentMonth];
    if (!dataset) return;

    const instances: Cesium.GeometryInstance[] = [];

    for (const cell of dataset.cells) {
      const { lon, lat, lonStep, latStep, thickness, concentration } = cell;
      if (thickness < 0.1) continue;

      // Arctic blue 그라데이션: 얇은 얼음 = 반투명 파란색, 두꺼운 얼음 = 불투명 밝은 청백색
      const t = Math.min(thickness / 5, 1); // 0=얇음(0m), 1=두꺼움(5m)
      const r = 0.3 + 0.7 * t;  // 0.3 → 1.0
      const g = 0.6 + 0.4 * t;  // 0.6 → 1.0
      const b = 0.9 + 0.1 * t;  // 0.9 → 1.0
      const alpha = 0.35 + concentration * 0.55; // 농도 높을수록 불투명

      const color = new Cesium.Color(r, g, b, alpha);

      try {
        const instance = new Cesium.GeometryInstance({
          geometry: new Cesium.PolygonGeometry({
            polygonHierarchy: new Cesium.PolygonHierarchy(
              Cesium.Cartesian3.fromDegreesArray([
                lon,           lat,
                lon + lonStep, lat,
                lon + lonStep, lat + latStep,
                lon,           lat + latStep,
              ])
            ),
            extrudedHeight: thickness * HEIGHT_EXAGGERATION,
            height: 0,
            granularity: Cesium.Math.toRadians(0.5),
            vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
          }),
          attributes: {
            color: Cesium.ColorGeometryInstanceAttribute.fromColor(color),
          },
        });
        instances.push(instance);
      } catch {
        // 일부 셀(고위도 극점 근처)에서 폴리곤 생성 실패 가능 — 무시
      }
    }

    if (instances.length === 0) return;

    // 모든 셀을 단일 GPU 드로우콜로 일괄 처리
    const primitive = new Cesium.Primitive({
      geometryInstances: instances,
      appearance: new Cesium.PerInstanceColorAppearance({
        translucent: true,
        closed: true,
      }),
      releaseGeometryInstances: true,
      asynchronous: false, // 동기 처리 — 프레임 드랍 없이 즉시 표시
    });

    viewer.scene.primitives.add(primitive);
    primitiveRef.current = primitive;
  }, [state.currentMonth, state.layerVisibility.iceThickness, iceDataRef, viewerRef]);

  return null;
}
