import { useMemo } from 'react';
import { qrMatrix, qrPath } from '@/lib/qr';

const QUIET_ZONE = 4;

export function PassQr({ value, className, title }: { value: string; className?: string; title: string }) {
  const { size, path } = useMemo(() => {
    const matrix = qrMatrix(value);
    return { size: matrix.size, path: qrPath(matrix) };
  }, [value]);
  const box = size + QUIET_ZONE * 2;

  return (
    <svg
      className={className}
      viewBox={`${-QUIET_ZONE} ${-QUIET_ZONE} ${box} ${box}`}
      role="img"
      aria-label={title}
      shapeRendering="crispEdges"
      data-qr-value={value}
    >
      <rect x={-QUIET_ZONE} y={-QUIET_ZONE} width={box} height={box} fill="#fff" />
      <path d={path} fill="#0b2545" />
    </svg>
  );
}
