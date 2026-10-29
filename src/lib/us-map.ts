import { greatCirclePath, screenHeading, type LatLon, type Point } from './flight-tracker';
import { HAWAII_OUTLINE, LOWER_48_OUTLINE, STATE_BORDERS } from './us-map-data';

export const MAP_WIDTH = 960;
export const MAP_HEIGHT = 600;

type Box = { x: number; y: number; width: number; height: number };

export const MAINLAND_BOX: Box = { x: 64, y: 22, width: MAP_WIDTH - 148, height: MAP_HEIGHT - 44 };
export const HAWAII_INSET: Box = { x: 22, y: 468, width: 228, height: 118 };

type Projection = (point: LatLon) => [number, number];

/** Albers equal-area conic on a sphere, returning unitless x/y with y pointing down. */
function albers(parallel1: number, parallel2: number, originLat: number, originLon: number): Projection {
  const rad = Math.PI / 180;
  const n = (Math.sin(parallel1 * rad) + Math.sin(parallel2 * rad)) / 2;
  const c = Math.cos(parallel1 * rad) ** 2 + 2 * n * Math.sin(parallel1 * rad);
  const rho0 = Math.sqrt(c - 2 * n * Math.sin(originLat * rad)) / n;
  return ({ lat, lon }) => {
    const rho = Math.sqrt(Math.max(0, c - 2 * n * Math.sin(lat * rad))) / n;
    const theta = n * (lon - originLon) * rad;
    return [rho * Math.sin(theta), -(rho0 - rho * Math.cos(theta))];
  };
}

function parseRing(ring: string): LatLon[] {
  return ring.split(',').map((pair) => {
    const [lon, lat] = pair.split(' ').map(Number);
    return { lat, lon };
  });
}

/** Scales and centres a projection so the given rings fill `box`. */
function fitTo(project: Projection, rings: LatLon[][], box: Box): (point: LatLon) => Point {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ring of rings) {
    for (const point of ring) {
      const [x, y] = project(point);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  const scale = Math.min(box.width / (maxX - minX), box.height / (maxY - minY));
  const offsetX = box.x + (box.width - (maxX - minX) * scale) / 2;
  const offsetY = box.y + (box.height - (maxY - minY) * scale) / 2;
  return (point) => {
    const [x, y] = project(point);
    return { x: offsetX + (x - minX) * scale, y: offsetY + (y - minY) * scale };
  };
}

const lower48 = LOWER_48_OUTLINE.map(parseRing);
const borders = STATE_BORDERS.map(parseRing);
const hawaii = HAWAII_OUTLINE.map(parseRing);

const INSET_PADDING = 14;
const projectMainland = fitTo(albers(29.5, 45.5, 38.7, -96), lower48, MAINLAND_BOX);
const projectHawaii = fitTo(albers(8, 18, 20.5, -157), hawaii, {
  x: HAWAII_INSET.x + INSET_PADDING,
  y: HAWAII_INSET.y + INSET_PADDING,
  width: HAWAII_INSET.width - INSET_PADDING * 2,
  height: HAWAII_INSET.height - INSET_PADDING * 2,
});

export function isInHawaii({ lat, lon }: LatLon): boolean {
  return lon < -150 && lat < 30;
}

/** Projects a point onto the map, drawing Hawaii in its inset. */
export function projectPoint(point: LatLon): Point {
  return isInHawaii(point) ? projectHawaii(point) : projectMainland(point);
}

/** Rotates, scales and moves `points` so the first lands on `start` and the last on `end`. */
export function fitBetween(points: Point[], start: Point, end: Point): Point[] {
  const first = points[0];
  const last = points[points.length - 1];
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  const length2 = dx * dx + dy * dy;
  if (length2 === 0) return points.map(() => ({ ...start }));
  const ex = end.x - start.x;
  const ey = end.y - start.y;
  const cos = (ex * dx + ey * dy) / length2;
  const sin = (ey * dx - ex * dy) / length2;
  return points.map((p) => {
    const x = p.x - first.x;
    const y = p.y - first.y;
    return { x: start.x + x * cos - y * sin, y: start.y + x * sin + y * cos };
  });
}

/**
 * Projected points along the great circle from `a` to `b`. A route to or from Hawaii keeps the
 * shape of its real great circle, turned and scaled so it ends at Hawaii's inset.
 */
export function projectRoute(a: LatLon, b: LatLon, segments = 64): Point[] {
  const points = greatCirclePath(a, b, segments).map(projectMainland);
  if (!isInHawaii(a) && !isInHawaii(b)) return points;
  return fitBetween(points, projectPoint(a), projectPoint(b));
}

/** The position and screen heading a fraction `t` of the way along a projected route. */
export function pointAlong(points: Point[], t: number): Point & { angle: number } {
  const last = points.length - 1;
  const position = Math.min(1, Math.max(0, t)) * last;
  const index = Math.min(last - 1, Math.floor(position));
  const frac = position - index;
  const from = points[index];
  const to = points[index + 1];
  return {
    x: from.x + (to.x - from.x) * frac,
    y: from.y + (to.y - from.y) * frac,
    angle: screenHeading(from, to),
  };
}

/** The part of a projected route already flown at fraction `t`. */
export function flownPoints(points: Point[], t: number): Point[] {
  const end = pointAlong(points, t);
  const count = Math.floor(Math.min(1, Math.max(0, t)) * (points.length - 1)) + 1;
  return [...points.slice(0, count), { x: end.x, y: end.y }];
}

export function pathFromPoints(points: Point[], closed = false): string {
  if (points.length === 0) return '';
  const body = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('');
  return closed ? `${body}Z` : body;
}

export type View = { k: number; x: number; y: number };

export const FULL_VIEW: View = { k: 1, x: 0, y: 0 };

/** A zoom (k) and pan (x, y) that frames the given points, kept inside the map's edges. */
export function viewFor(points: Point[], maxZoom = 2.6, padding = 70): View {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const k = Math.max(
    1,
    Math.min(maxZoom, MAP_WIDTH / (maxX - minX + padding * 2), MAP_HEIGHT / (maxY - minY + padding * 2)),
  );
  const x = MAP_WIDTH / 2 - k * ((minX + maxX) / 2);
  const y = MAP_HEIGHT / 2 - k * ((minY + maxY) / 2);
  return {
    k,
    x: Math.min(0, Math.max(MAP_WIDTH - k * MAP_WIDTH, x)),
    y: Math.min(0, Math.max(MAP_HEIGHT - k * MAP_HEIGHT, y)),
  };
}

export function mixView(from: View, to: View, t: number): View {
  return { k: from.k + (to.k - from.k) * t, x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
}

export const LAND_PATH = lower48.map((ring) => pathFromPoints(ring.map(projectMainland), true)).join('');
export const BORDERS_PATH = borders.map((line) => pathFromPoints(line.map(projectMainland))).join('');
export const HAWAII_PATH = hawaii.map((ring) => pathFromPoints(ring.map(projectHawaii), true)).join('');

function graticule(): string {
  const lines: LatLon[][] = [];
  for (let lon = -130; lon <= -60; lon += 10) {
    const line: LatLon[] = [];
    for (let lat = 20; lat <= 54; lat += 2) line.push({ lat, lon });
    lines.push(line);
  }
  for (let lat = 20; lat <= 50; lat += 5) {
    const line: LatLon[] = [];
    for (let lon = -134; lon <= -58; lon += 2) line.push({ lat, lon });
    lines.push(line);
  }
  return lines.map((line) => pathFromPoints(line.map(projectMainland))).join('');
}

export const GRATICULE_PATH = graticule();
