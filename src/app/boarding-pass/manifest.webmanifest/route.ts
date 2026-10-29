import { boardingPassHref, normalizeSeat, parsePassengerName } from '@/lib/boarding';
import { findFare, findFlight } from '@/lib/flights';

// Public: browsers fetch the install manifest without credentials; it only echoes sanitized pass params.
export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const flight = findFlight(params.get('flight'));
  const fare = flight ? findFare(flight, params.get('fare')) : undefined;
  const startUrl =
    flight && fare
      ? boardingPassHref(flight.id, fare.key, parsePassengerName(params.get('name')).display, normalizeSeat(params.get('seat')))
      : '/boarding-pass';

  const manifest = {
    id: '/boarding-pass',
    name: 'FlyLo-Air Boarding Pass',
    short_name: 'FlyLo Pass',
    description: 'Your FlyLo-Air boarding pass, one tap from your Home Screen. SAMPLE app for a fictional airline.',
    start_url: startUrl,
    scope: '/boarding-pass',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0b2545',
    theme_color: '#0b2545',
    icons: [
      { src: '/boarding-pass/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/boarding-pass/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/boarding-pass/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };

  return new Response(JSON.stringify(manifest), {
    headers: { 'content-type': 'application/manifest+json; charset=utf-8', 'cache-control': 'no-store' },
  });
}
