import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import { useAppContext } from '../context/AppContext';

export default function SarImageryLayer() {
  const { state, viewerRef } = useAppContext();
  const layerRef = useRef<Cesium.ImageryLayer | null>(null);

  useEffect(() => {
    const checkViewer = setInterval(() => {
      if (!viewerRef.current || viewerRef.current.isDestroyed()) return;
      clearInterval(checkViewer);

      try {
        // NASA GIBS WMS — CORS-friendly, no API key required
        const provider = new Cesium.WebMapServiceImageryProvider({
          url: 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi',
          layers: 'MODIS_Terra_CorrectedReflectance_TrueColor',
          parameters: {
            transparent: true,
            format: 'image/png',
          },
          tilingScheme: new Cesium.GeographicTilingScheme(),
          maximumLevel: 8,
        });

        const layer = viewerRef.current.imageryLayers.addImageryProvider(provider);
        layer.alpha = 0.7;
        layer.show = state.layerVisibility.sarImagery;
        layerRef.current = layer;
      } catch (e) {
        console.warn('SAR imagery layer failed to initialize:', e);
      }
    }, 300);

    return () => {
      clearInterval(checkViewer);
      if (layerRef.current && viewerRef.current && !viewerRef.current.isDestroyed()) {
        viewerRef.current.imageryLayers.remove(layerRef.current, true);
        layerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Toggle visibility
  useEffect(() => {
    if (layerRef.current) {
      layerRef.current.show = state.layerVisibility.sarImagery;
    }
  }, [state.layerVisibility.sarImagery]);

  return null;
}
