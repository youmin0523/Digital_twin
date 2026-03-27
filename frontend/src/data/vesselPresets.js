// ═══════════════════════════════════════════════════════════════
// Vessel (Ship) Presets and Base Constants
// Extracted from arctic-hybrid.html lines 2572-2597
// ═══════════════════════════════════════════════════════════════

export const SHIP_PRESETS = {
  icebreaker: {
    disp: 20000,
    len: 160,
    width: 30,
    gm: 3.2,
    iceClass: 'PC2',
    draft: 8.5,
  },
  lng: { disp: 95000, len: 295, width: 46, gm: 5.1, iceClass: 'PC4', draft: 12.0 },
  container: {
    disp: 55000,
    len: 240,
    width: 38,
    gm: 4.3,
    iceClass: 'NONE',
    draft: 14.2,
  },
};

export const BASE_DISP = 20000;
export const BASE_LEN = 160;
export const BASE_WIDTH = 28;
export const BASE_GM = 3.2;
export const BASE_OMEGA_R = 0.176;
export const BASE_OMEGA_P = 0.21;
