import { ArcticRoute } from '../types';

export const ARCTIC_ROUTES: ArcticRoute[] = [
  {
    id: 'NSR',
    name: 'Northern Sea Route (NSR)',
    nameKo: '북동항로 (NSR)',
    totalDistanceNm: 7000,
    waypoints: [
      { lon: 33,  lat: 69,  label: '무르만스크' },
      { lon: 52,  lat: 71,  label: '노바야젬랴 서방' },
      { lon: 60,  lat: 72,  label: '노바야젬랴' },
      { lon: 73,  lat: 73,  label: '카라해 진입' },
      { lon: 80,  lat: 75,  label: '카라해' },
      { lon: 95,  lat: 77,  label: '세베르나야젬랴 서방' },
      { lon: 100, lat: 79,  label: '세베르나야젬랴' },
      { lon: 113, lat: 77,  label: '랍테프해 진입' },
      { lon: 125, lat: 76,  label: '랍테프해' },
      { lon: 140, lat: 75,  label: '신시베리아제도 서방' },
      { lon: 145, lat: 74,  label: '동시베리아해 진입' },
      { lon: 155, lat: 71,  label: '동시베리아해' },
      { lon: 160, lat: 70,  label: '축치해 진입' },
      { lon: 168, lat: 67,  label: '베링해협 (NSR 종점)' },
    ],
  },
  {
    id: 'NWP',
    name: 'Northwest Passage (NWP)',
    nameKo: '북서항로 (NWP)',
    totalDistanceNm: 9000,
    waypoints: [
      { lon: -65,  lat: 72, label: '배핀만 진입' },
      { lon: -78,  lat: 74, label: '랭커스터해협 동방' },
      { lon: -85,  lat: 74, label: '랭커스터해협' },
      { lon: -96,  lat: 75, label: '배로해협' },
      { lon: -105, lat: 75, label: '빅토리아해협' },
      { lon: -112, lat: 74, label: '퀸엘리자베스제도 남방' },
      { lon: -118, lat: 74, label: 'M\'클루어해협 동방' },
      { lon: -122, lat: 73, label: 'M\'클루어해협' },
      { lon: -125, lat: 71, label: '아문센만 진입' },
      { lon: -133, lat: 70, label: '아문센만' },
      { lon: -140, lat: 70, label: '보퍼트해 동방' },
      { lon: -155, lat: 68, label: '보퍼트해' },
      { lon: -168, lat: 66, label: '베링해협 (NWP 종점)' },
    ],
  },
  {
    id: 'CUSTOM',
    name: 'Trans-Polar Route (TPR)',
    nameKo: '횡극항로 (TPR) — 미개척',
    totalDistanceNm: 6500,
    waypoints: [
      { lon: 0,   lat: 72, label: '그린란드해 북방' },
      { lon: 0,   lat: 78, label: '스발바르 북방' },
      { lon: 0,   lat: 84, label: '북극해 진입' },
      { lon: 30,  lat: 87, label: '북극점 근방' },
      { lon: 90,  lat: 85, label: '극점 통과' },
      { lon: 150, lat: 82, label: '축치고원 북방' },
      { lon: 168, lat: 75, label: '척치해 진입' },
      { lon: 168, lat: 67, label: '베링해협' },
    ],
  },
];

export function getRoute(id: string): ArcticRoute | undefined {
  return ARCTIC_ROUTES.find((r) => r.id === id);
}
