import type { BoardingPass } from './boarding';
import { qrMatrix } from './qr';

const W = 360;
const H = 668;
const SCALE = 3;
const LOGO_PLANE = 'M6 19.5 26 10l-6.2 11.8-4.3-3.1-3.2 3.6-.4-5.1Z';
const PLANE =
  'M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z';

export function passFileName(pass: BoardingPass): string {
  return `flylo-air-boarding-pass-${pass.flightNumber.replace(/\s+/g, '')}-${pass.from.code}-${pass.to.code}.png`;
}

export function renderPassPng(pass: BoardingPass): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('Canvas is not available'));
  const sans = getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif';
  const font = (weight: number, size: number) => `${weight} ${size}px ${sans}`;
  ctx.scale(SCALE, SCALE);

  roundRect(ctx, 0, 0, W, H, 24);
  ctx.save();
  ctx.clip();
  const bg = ctx.createLinearGradient(0, 0, W * 0.6, H);
  bg.addColorStop(0, '#0b2545');
  bg.addColorStop(0.55, '#13315c');
  bg.addColorStop(1, '#1d4ed8');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W - 30, 30, 0, W - 30, 30, 200);
  glow.addColorStop(0, 'rgba(249, 115, 22, 0.38)');
  glow.addColorStop(1, 'rgba(249, 115, 22, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  ctx.save();
  ctx.translate(20, 20);
  roundRect(ctx, 0, 0, 32, 32, 9);
  ctx.fillStyle = '#1d4ed8';
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fill(new Path2D(LOGO_PLANE));
  ctx.beginPath();
  ctx.arc(24, 23, 2.4, 0, Math.PI * 2);
  ctx.fillStyle = '#f97316';
  ctx.fill();
  ctx.restore();

  ctx.textBaseline = 'alphabetic';
  ctx.font = font(800, 18);
  ctx.fillStyle = '#fff';
  ctx.fillText('FlyLo', 62, 42);
  ctx.fillStyle = '#93c5fd';
  ctx.fillText('-Air', 62 + ctx.measureText('FlyLo').width, 42);

  ctx.textAlign = 'right';
  label(ctx, font, 'BOARDING PASS', W - 20, 31);
  ctx.font = font(800, 16);
  ctx.fillStyle = '#fff';
  ctx.fillText(pass.flightNumber, W - 20, 50);
  ctx.textAlign = 'left';

  hairline(ctx, 70);

  ctx.font = font(800, 48);
  ctx.fillStyle = '#fff';
  ctx.fillText(pass.from.code, 20, 132);
  ctx.textAlign = 'right';
  ctx.fillText(pass.to.code, W - 20, 132);
  ctx.font = font(600, 12);
  ctx.fillStyle = '#bfdbfe';
  ctx.fillText(pass.to.city, W - 20, 152);
  ctx.textAlign = 'left';
  ctx.fillText(pass.from.city, 20, 152);

  ctx.save();
  ctx.strokeStyle = 'rgba(191, 219, 254, 0.55)';
  ctx.setLineDash([2, 5]);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(128, 114);
  ctx.lineTo(W / 2 - 18, 114);
  ctx.moveTo(W / 2 + 18, 114);
  ctx.lineTo(W - 128, 114);
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.translate(W / 2, 114);
  ctx.rotate(Math.PI / 4);
  ctx.translate(-14, -14);
  ctx.scale(28 / 24, 28 / 24);
  ctx.strokeStyle = '#fdba74';
  ctx.lineWidth = 1.8;
  ctx.lineJoin = 'round';
  ctx.stroke(new Path2D(PLANE));
  ctx.restore();
  ctx.textAlign = 'center';
  ctx.font = font(600, 11);
  ctx.fillStyle = '#bfdbfe';
  ctx.fillText(pass.duration, W / 2, 144);
  ctx.textAlign = 'left';

  label(ctx, font, 'PASSENGER', 20, 186);
  fitText(ctx, font, pass.passenger.display, 20, 208, 230, 18, 800, '#fff');
  ctx.textAlign = 'right';
  label(ctx, font, 'SEAT', W - 20, 186);
  ctx.font = font(800, 26);
  ctx.fillStyle = '#fdba74';
  ctx.fillText(pass.seat, W - 20, 212);
  ctx.textAlign = 'left';

  const columns = [20, 104, 188, 272];
  const rows: [string, string][][] = [
    [
      ['FLIGHT', pass.flightNumber],
      ['DATE', pass.dateLabel],
      ['DEPARTS', pass.departs],
      ['BOARDS', pass.boards],
    ],
    [
      ['GATE', pass.gate],
      ['TERMINAL', pass.terminal],
      ['ZONE', String(pass.zone)],
      ['FARE', pass.fareName],
    ],
  ];
  rows.forEach((row, r) => {
    row.forEach(([name, value], c) => {
      label(ctx, font, name, columns[c], 244 + r * 52);
      fitText(ctx, font, value, columns[c], 264 + r * 52, 78, 15, 800, '#fff');
    });
  });

  const tear = 336;
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  for (const x of [0, W]) {
    ctx.beginPath();
    ctx.arc(x, tear, 13, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
  ctx.setLineDash([5, 6]);
  ctx.beginPath();
  ctx.moveTo(22, tear);
  ctx.lineTo(W - 22, tear);
  ctx.stroke();
  ctx.restore();

  const tile = 220;
  const tileX = (W - tile) / 2;
  const tileY = 358;
  roundRect(ctx, tileX, tileY, tile, tile, 18);
  ctx.fillStyle = '#fff';
  ctx.fill();
  drawQr(ctx, pass.bcbp, tileX + 12, tileY + 12, tile - 24);

  ctx.textAlign = 'center';
  ctx.font = font(800, 13);
  ctx.fillStyle = '#fff';
  ctx.fillText(`Boards ${pass.boards} · Gate ${pass.gate} · Zone ${pass.zone}`, W / 2, 604);
  ctx.font = font(600, 11);
  ctx.fillStyle = '#bfdbfe';
  ctx.fillText(`Booking code ${pass.pnr} · Seq ${String(pass.sequence).padStart(3, '0')} · ${pass.cabin}`, W / 2, 624);
  ctx.font = font(700, 9);
  ctx.fillStyle = '#93c5fd';
  ctx.fillText('SAMPLE pass · FlyLo-Air is a fictional airline · Fly more. Pay less.', W / 2, 652);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not create the image'))), 'image/png');
  });
}

export async function downloadPassPng(pass: BoardingPass): Promise<string> {
  const blob = await renderPassPng(pass);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = passFileName(pass);
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  return link.download;
}

function drawQr(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size: number) {
  const { size: count, modules } = qrMatrix(value);
  const module = Math.floor((size * SCALE) / count);
  const offsetX = Math.round(x * SCALE + (size * SCALE - module * count) / 2);
  const offsetY = Math.round(y * SCALE + (size * SCALE - module * count) / 2);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0b2545';
  modules.forEach((row, r) => {
    row.forEach((dark, c) => {
      if (dark) ctx.fillRect(offsetX + c * module, offsetY + r * module, module, module);
    });
  });
  ctx.restore();
}

function label(ctx: CanvasRenderingContext2D, font: (weight: number, size: number) => string, text: string, x: number, y: number) {
  ctx.font = font(800, 9);
  ctx.fillStyle = '#93c5fd';
  ctx.letterSpacing = '1.2px';
  ctx.fillText(text, x, y);
  ctx.letterSpacing = '0px';
}

function fitText(
  ctx: CanvasRenderingContext2D,
  font: (weight: number, size: number) => string,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  size: number,
  weight: number,
  color: string,
) {
  let current = size;
  ctx.font = font(weight, current);
  while (current > 9 && ctx.measureText(text).width > maxWidth) {
    current -= 1;
    ctx.font = font(weight, current);
  }
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function hairline(ctx: CanvasRenderingContext2D, y: number) {
  ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.fillRect(20, y, W - 40, 1);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}
