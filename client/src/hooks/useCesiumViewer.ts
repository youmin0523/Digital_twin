import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import { useAppContext } from '../context/AppContext';

export function useCesiumViewer(containerRef: React.RefObject<HTMLDivElement>) {
  const { viewerRef } = useAppContext();
  const viewerCreated = useRef(false); // guard against StrictMode double-mount

  useEffect(() => {
    if (viewerCreated.current) return;
    if (!containerRef.current) return;

    viewerCreated.current = true;
    let mounted = true;

    Cesium.createWorldTerrainAsync().then((terrainProvider) => {
      if (!mounted || !containerRef.current) return;

      const viewer = new Cesium.Viewer(containerRef.current, {
        terrainProvider,
        // Disable all built-in widgets — React UI replaces them
        animation: false,
        timeline: false,
        baseLayerPicker: false,
        geocoder: false,
        homeButton: false,
        sceneModePicker: false,
        navigationHelpButton: false,
        fullscreenButton: false,
        infoBox: true,
        selectionIndicator: true,
      });

      // Improve rendering quality
      viewer.scene.globe.enableLighting = true;
      viewer.scene.atmosphere.show = true;
      viewer.scene.fog.enabled = true;

      // Initial camera: Arctic top-down view with slight pitch for 3D depth
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(60.0, 82.0, 7000000.0),
        orientation: {
          heading: Cesium.Math.toRadians(0.0),
          pitch: Cesium.Math.toRadians(-55.0),
          roll: 0.0,
        },
        duration: 2,
      });

      // NASA GIBS MODIS Terra 위성 이미지를 배경 오버레이로 추가
      // 경로 탐색에는 사용되지 않으며 시각적 사실감 향상 목적
      try {
        const gibsProvider = new Cesium.WebMapTileServiceImageryProvider({
          url: 'https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/2024-03-01/250m/{TileMatrix}/{TileRow}/{TileCol}.jpg',
          layer: 'MODIS_Terra_CorrectedReflectance_TrueColor',
          style: 'default',
          format: 'image/jpeg',
          tileMatrixSetID: '250m',
          maximumLevel: 8,
          tilingScheme: new Cesium.GeographicTilingScheme(),
          credit: new Cesium.Credit('NASA GIBS / Earthdata'),
        });
        viewer.imageryLayers.addImageryProvider(gibsProvider);
      } catch (e) {
        console.warn('[useCesiumViewer] NASA GIBS 이미지 레이어 추가 실패:', e);
      }

      viewerRef.current = viewer;
    });

    return () => {
      mounted = false;
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        viewerRef.current.destroy();
        viewerRef.current = null;
        viewerCreated.current = false;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
