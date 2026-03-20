import React, { useRef } from 'react';
import { useCesiumViewer } from '../hooks/useCesiumViewer';

export default function CesiumGlobe() {
  const containerRef = useRef<HTMLDivElement>(null);
  useCesiumViewer(containerRef);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 w-full h-full"
      style={{ zIndex: 0 }}
    />
  );
}
