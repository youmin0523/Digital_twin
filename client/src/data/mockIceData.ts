import { IceDataset, IceGridCell } from '../types';

// Seeded PRNG (mulberry32) — deterministic per (lon, lat)
function mulberry32(seed: number) {
  let t = seed + 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function cellNoise(lon: number, lat: number): number {
  // unique seed per cell
  const seed = ((lon + 180) * 1000 + (lat + 90) * 37) | 0;
  return mulberry32(seed);
}

// Seasonal factor: 1.0 in Feb (max ice), 0.0 in Aug (min ice)
function seasonalFactor(month: number): number {
  return 0.5 + 0.5 * Math.cos((2 * Math.PI * (month - 2)) / 12);
}

// Clamp helper
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

const LON_STEP = 2;    // degrees longitude per cell
const LAT_STEP = 1.5;  // degrees latitude per cell
const LAT_MIN = 65;
const LAT_MAX = 90;
const LON_MIN = -180;
const LON_MAX = 180;

export function generateMonthlyDataset(month: number): IceDataset {
  const sf = seasonalFactor(month);
  const cells: IceGridCell[] = [];

  for (let lat = LAT_MIN; lat < LAT_MAX; lat += LAT_STEP) {
    for (let lon = LON_MIN; lon < LON_MAX; lon += LON_STEP) {
      const noise = cellNoise(lon, lat);

      // Latitude gradient: higher latitude → more ice
      const latitudeGradient = (lat - LAT_MIN) / (LAT_MAX - LAT_MIN);

      // Longitude regional variation (e.g. Canadian Archipelago icy, Atlantic less so)
      const lonBias = lon > -120 && lon < -60 ? 0.15 : 0; // Canadian/Greenland side bonus

      const concentration = clamp(
        latitudeGradient * (0.4 + 0.6 * sf) + noise * 0.15 - 0.05 + lonBias * sf,
        0,
        1
      );

      // Skip effectively ice-free cells
      if (concentration < 0.05) continue;

      const thicknessNoise = cellNoise(lon + 500, lat + 500);
      const thickness = clamp(concentration * 4.5 + thicknessNoise * 0.5, 0, 5);

      cells.push({
        lon,
        lat,
        lonStep: LON_STEP,
        latStep: LAT_STEP,
        concentration,
        thickness,
      });
    }
  }

  return { month, cells };
}

// Pre-generate all 12 months at module load time
export const ALL_ICE_DATASETS: IceDataset[] = Array.from({ length: 12 }, (_, i) =>
  generateMonthlyDataset(i)
);

export function getIceDataset(month: number): IceDataset {
  return ALL_ICE_DATASETS[month];
}

/**
 * Sample ice concentration at a given (lon, lat) from a dataset.
 * Returns 0 if no cell found (open ocean).
 */
export function sampleConcentration(
  dataset: IceDataset,
  lon: number,
  lat: number
): number {
  const cell = dataset.cells.find(
    (c) =>
      lon >= c.lon &&
      lon < c.lon + c.lonStep &&
      lat >= c.lat &&
      lat < c.lat + c.latStep
  );
  return cell ? cell.concentration : 0;
}
