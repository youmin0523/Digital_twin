import React from 'react';

export default function BinocularsMask({ visible, label }) {
  return (
    <div id="binoculars-mask" className={visible ? 'show' : ''}>
      <span id="bino-label">{label || 'x 8.0 BINOCULARS'}</span>
    </div>
  );
}
