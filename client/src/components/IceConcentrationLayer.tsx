import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import { useAppContext } from '../context/AppContext';
import { getIceDataset } from '../data/mockIceData';

export default function IceConcentrationLayer() {
  const { state, viewerRef } = useAppContext();
  const dataSourceRef = useRef<Cesium.CustomDataSource | null>(null);

  // Initialize the data source once
  useEffect(() => {
    const checkViewer = setInterval(() => {
      if (!viewerRef.current || viewerRef.current.isDestroyed()) return;
      clearInterval(checkViewer);

      const ds = new Cesium.CustomDataSource('ice-concentration');
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

  // Re-render whenever month changes or visibility toggles
  useEffect(() => {
    const ds = dataSourceRef.current;
    if (!ds) return;

    ds.entities.removeAll();

    if (!state.layerVisibility.iceConcentration) return;

    const dataset = getIceDataset(state.currentMonth);

    for (const cell of dataset.cells) {
      const { lon, lat, lonStep, latStep, concentration } = cell;

      // Color interpolation: deep blue (low) → white (high)
      // hue: 215° → 200°, lightness: 0.35 → 0.95
      const t = concentration;
      const hue = (215 - 15 * t) / 360;
      const sat = 0.8 - 0.7 * t;
      const lit = 0.35 + 0.60 * t;
      const alpha = 0.3 + t * 0.5;

      const color = Cesium.Color.fromHsl(hue, sat, lit, alpha);

      ds.entities.add({
        name: `해빙 농도 셀`,
        description: `농도: ${(concentration * 100).toFixed(1)}%`,
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
          // Force tessellation at high latitudes to avoid rendering artifacts
          granularity: Cesium.Math.toRadians(0.5),
          height: 0,
        },
      });
    }
  }, [state.currentMonth, state.layerVisibility.iceConcentration]);

  return null;
}
