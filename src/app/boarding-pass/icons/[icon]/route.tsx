import { ImageResponse } from 'next/og';

const ICONS: Record<string, { size: number; fullBleed: boolean }> = {
  'icon-192.png': { size: 192, fullBleed: false },
  'icon-512.png': { size: 512, fullBleed: false },
  'maskable-512.png': { size: 512, fullBleed: true },
  'apple-touch-icon.png': { size: 180, fullBleed: true },
};

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(ICONS).map((icon) => ({ icon }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ icon: string }> }) {
  const { icon } = await params;
  const spec = ICONS[icon];
  if (!spec) return new Response('Not found', { status: 404 });
  const { size, fullBleed } = spec;
  // Maskable icons must keep the artwork inside the central 80% safe zone.
  const mark = Math.round(size * (fullBleed ? 0.56 : 0.66));

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: fullBleed ? 0 : size * 0.22,
          background: 'linear-gradient(150deg, #0b2545 0%, #13315c 55%, #1d4ed8 100%)',
        }}
      >
        <svg width={mark} height={mark} viewBox="0 0 32 32">
          <path d="M6 19.5 26 10l-6.2 11.8-4.3-3.1-3.2 3.6-.4-5.1Z" fill="#fff" />
          <circle cx="24" cy="23" r="2.4" fill="#f97316" />
        </svg>
      </div>
    ),
    { width: size, height: size },
  );
}
