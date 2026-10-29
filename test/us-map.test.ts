import { describe, expect, it } from 'vitest';
import { AIRPORTS, findAirport } from '@/lib/airports';
import {
  FULL_VIEW,
  HAWAII_INSET,
  HAWAII_PATH,
  LAND_PATH,
  MAP_HEIGHT,
  MAP_WIDTH,
  fitBetween,
  flownPoints,
  mixView,
  pathFromPoints,
  pointAlong,
  projectPoint,
  projectRoute,
  viewFor,
} from '@/lib/us-map';

const inside = (p: { x: number; y: number }, box: { x: number; y: number; width: number; height: number }) =>
  p.x >= box.x && p.x <= box.x + box.width && p.y >= box.y && p.y <= box.y + box.height;

describe('projection', () => {
  it('puts every airport on the map, with Honolulu in the Hawaii inset', () => {
    for (const airport of AIRPORTS) {
      const point = projectPoint(airport);
      expect(inside(point, { x: 0, y: 0, width: MAP_WIDTH, height: MAP_HEIGHT })).toBe(true);
      expect(inside(point, HAWAII_INSET)).toBe(airport.code === 'HNL');
    }
  });

  it('keeps geography the right way round', () => {
    const [sea, mia, sfo, bos] = ['SEA', 'MIA', 'SFO', 'BOS'].map((code) => projectPoint(findAirport(code)!));
    expect(sea.x).toBeLessThan(mia.x);
    expect(sea.y).toBeLessThan(mia.y);
    expect(sfo.x).toBeLessThan(bos.x);
  });

  it('builds land paths', () => {
    expect(LAND_PATH.startsWith('M')).toBe(true);
    expect(HAWAII_PATH.split('Z').length).toBeGreaterThan(4);
  });
});

describe('routes', () => {
  const sfo = findAirport('SFO')!;
  const jfk = findAirport('JFK')!;
  const den = findAirport('DEN')!;
  const hnl = findAirport('HNL')!;

  it('starts and ends on the projected airports, including Hawaii', () => {
    for (const [a, b] of [[sfo, jfk], [den, hnl]]) {
      const route = projectRoute(a, b, 32);
      expect(route).toHaveLength(33);
      expect(route[0].x).toBeCloseTo(projectPoint(a).x, 6);
      expect(route[0].y).toBeCloseTo(projectPoint(a).y, 6);
      expect(route[32].x).toBeCloseTo(projectPoint(b).x, 6);
      expect(route[32].y).toBeCloseTo(projectPoint(b).y, 6);
    }
  });

  it('fits a shape between two points without distorting it', () => {
    const shape = [{ x: 0, y: 0 }, { x: 1, y: -1 }, { x: 2, y: 0 }];
    const fitted = fitBetween(shape, { x: 10, y: 10 }, { x: 10, y: 14 });
    const expected = [{ x: 10, y: 10 }, { x: 12, y: 12 }, { x: 10, y: 14 }];
    fitted.forEach((p, i) => {
      expect(p.x).toBeCloseTo(expected[i].x, 9);
      expect(p.y).toBeCloseTo(expected[i].y, 9);
    });
  });

  it('curves north of the straight line between SFO and JFK', () => {
    const route = projectRoute(sfo, jfk, 32);
    const middle = route[16];
    const chordY = (route[0].y + route[32].y) / 2;
    expect(middle.y).toBeLessThan(chordY);
  });

  it('finds positions and headings along a route', () => {
    const points = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
    expect(pointAlong(points, 0)).toEqual({ x: 0, y: 0, angle: 0 });
    expect(pointAlong(points, 0.25)).toEqual({ x: 5, y: 0, angle: 0 });
    expect(pointAlong(points, 0.75)).toEqual({ x: 10, y: 5, angle: 90 });
    expect(pointAlong(points, 1)).toEqual({ x: 10, y: 10, angle: 90 });
    expect(pointAlong(points, 2)).toEqual({ x: 10, y: 10, angle: 90 });
    expect(flownPoints(points, 0.75)).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }]);
    expect(pathFromPoints(points)).toBe('M0.0 0.0L10.0 0.0L10.0 10.0');
    expect(pathFromPoints(points, true).endsWith('Z')).toBe(true);
  });
});

describe('views', () => {
  it('zooms in on a short route and stays inside the map', () => {
    const route = projectRoute(findAirport('SEA')!, findAirport('LAX')!);
    const view = viewFor(route);
    expect(view.k).toBeGreaterThan(1);
    expect(view.x).toBeLessThanOrEqual(0);
    expect(view.y).toBeLessThanOrEqual(0);
    expect(view.x).toBeGreaterThanOrEqual(MAP_WIDTH - view.k * MAP_WIDTH);
    expect(view.y).toBeGreaterThanOrEqual(MAP_HEIGHT - view.k * MAP_HEIGHT);
  });

  it('shows the whole map for coast-to-coast routes', () => {
    expect(viewFor(projectRoute(findAirport('SEA')!, findAirport('MIA')!))).toEqual(FULL_VIEW);
    expect(viewFor(projectRoute(findAirport('SFO')!, findAirport('JFK')!))).toEqual(FULL_VIEW);
    expect(viewFor(projectRoute(findAirport('LAX')!, findAirport('LAS')!)).k).toBe(2.6);
    expect(mixView(FULL_VIEW, { k: 3, x: -100, y: -50 }, 0.5)).toEqual({ k: 2, x: -50, y: -25 });
  });
});
