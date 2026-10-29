export type Airport = {
  code: string;
  city: string;
  lat: number;
  lon: number;
};

export const AIRPORTS: Airport[] = [
  { code: 'ATL', city: 'Atlanta', lat: 33.64, lon: -84.43 },
  { code: 'AUS', city: 'Austin', lat: 30.19, lon: -97.67 },
  { code: 'BOS', city: 'Boston', lat: 42.36, lon: -71.01 },
  { code: 'ORD', city: 'Chicago', lat: 41.98, lon: -87.9 },
  { code: 'DEN', city: 'Denver', lat: 39.86, lon: -104.67 },
  { code: 'HNL', city: 'Honolulu', lat: 21.32, lon: -157.92 },
  { code: 'LAS', city: 'Las Vegas', lat: 36.08, lon: -115.15 },
  { code: 'LAX', city: 'Los Angeles', lat: 33.94, lon: -118.41 },
  { code: 'MIA', city: 'Miami', lat: 25.79, lon: -80.29 },
  { code: 'JFK', city: 'New York', lat: 40.64, lon: -73.78 },
  { code: 'SFO', city: 'San Francisco', lat: 37.62, lon: -122.38 },
  { code: 'SEA', city: 'Seattle', lat: 47.45, lon: -122.31 },
];

export function findAirport(code: string | undefined | null): Airport | undefined {
  if (!code) return undefined;
  const upper = code.toUpperCase();
  return AIRPORTS.find((airport) => airport.code === upper);
}

export function distanceKm(a: Airport, b: Airport): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
