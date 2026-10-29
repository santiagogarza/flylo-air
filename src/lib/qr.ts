import { encode } from 'uqr';

export type QrMatrix = { size: number; modules: boolean[][] };

export function qrMatrix(text: string): QrMatrix {
  const result = encode(text, { ecc: 'M', border: 0 });
  return { size: result.size, modules: result.data };
}

// One SVG path of horizontal runs keeps the code crisp at any scale.
export function qrPath({ modules }: QrMatrix): string {
  const parts: string[] = [];
  modules.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (!row[x]) {
        x += 1;
        continue;
      }
      const start = x;
      while (x < row.length && row[x]) x += 1;
      parts.push(`M${start} ${y}h${x - start}v1h${start - x}z`);
    }
  });
  return parts.join('');
}
