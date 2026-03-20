import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import { useAppContext } from '../context/AppContext';
import { getIceDataset } from '../data/mockIceData';

const HEIGHT_EXAGGERATION = 15000; // meters per 1m of ice thickness

export default function IceThicknessLayer() {
  const { state, viewerRef } = useAppContext();
  const dataSourceRef = useRef<Cesium.CustomDataSource | null>(null);

  useEffect(() => {
    const checkViewer = setInterval(() => {
      if (!viewerRef.current || viewerRef.current.isDestroyed()) return;
      clearInterval(checkViewer);

      const ds = new Cesium.CustomDataSource('ice-thickness');
      viewerRef.current.dataSources.add(ds);
      dataSourceRef.current = ds;
    }, 200);

    return () => {
      clearInterval(checkViewer);
      if (dataSourceRef.current && viewerRef.current && !viewerRef.current.isDestroyed()) {
        viewerRef.current.dataSources.remove(dataSourceRef.current, true);
        dataSourceRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const ds = dataSourceRef.current;
    if (!ds) return;

    ds.entities.removeAll();

    if (!state.layerVisibility.iceThickness) return;

    const dataset = getIceDataset(state.currentMonth);

    for (const cell of dataset.cells) {
      const { lon, lat, lonStep, latStep, thickness, concentration } = cell;
      if (thickness < 0.1) continue;

      // Grayscale: thin=semi-transparent gray, thick=opaque white
      const t = thickness / 5; // normalised 0–1
      const gray = 0.5 + 0.5 * t;
      const alpha = 0.4 + t * 0.5;
      const color = new Cesium.Color(gray, gray, gray, alpha);

      ds.entities.add({
        name: `해빙 두께 셀`,
        description: `두께: ${thickness.toFixed(2)}m<br/>농도: ${(concentration * 100).toFixed(1)}%`,
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(
            Cesium.Cartesian3.fromDegreesArray([
              lon,          lat,
              lon + lonStep, lat,
              lon + lonStep, lat + latStep,
              lon,          lat + latStep,
            ])
          ),
          material: new Cesium.ColorMaterialProperty(color),
          outline: false,
          height: 0,
          extrudedHeight: thickness * HEIGHT_EXAGGERATION,
          granularity: Cesium.Math.toRadians(0.5),
        },
      });
    }
  }, [state.currentMonth, state.layerVisibility.iceThickness]);

  return null;
}
