// Compares two `npm run perf` runs and renders the before/after visuals.
// Usage: npm run perf:compare -- --before before --after after
// Writes perf/compare/comparison.md, gauges.html + gauges.png (side-by-side score gauges)
// and filmstrip.html + filmstrip.png (page load filmstrips from the median runs).
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import * as chromeLauncher from 'chrome-launcher';

const { values: args } = parseArgs({
  options: {
    before: { type: 'string', default: 'before' },
    after: { type: 'string', default: 'after' },
  },
});

const outDir = path.join('perf', 'compare');
const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
const before = await readJson(path.join('perf', args.before, 'summary.json'));
const after = await readJson(path.join('perf', args.after, 'summary.json'));
const PRESETS = ['mobile', 'desktop'];

const ROWS = [
  { key: 'performance', label: 'Performance', digits: 0, higherIsBetter: true },
  { key: 'accessibility', label: 'Accessibility', digits: 0, higherIsBetter: true },
  { key: 'bestPractices', label: 'Best Practices', digits: 0, higherIsBetter: true },
  { key: 'seo', label: 'SEO', digits: 0, higherIsBetter: true },
  { key: 'fcpMs', label: 'FCP', digits: 0, unit: ' ms' },
  { key: 'lcpMs', label: 'LCP', digits: 0, unit: ' ms' },
  { key: 'cls', label: 'CLS', digits: 3 },
  { key: 'tbtMs', label: 'TBT', digits: 0, unit: ' ms' },
  { key: 'speedIndexMs', label: 'Speed Index', digits: 0, unit: ' ms' },
  { key: 'jsKb', label: 'JS KB (transfer)', digits: 1 },
  { key: 'totalKb', label: 'Total KB (transfer)', digits: 1 },
];

function delta(row, from, to) {
  const diff = to - from;
  if (Math.abs(diff) < 10 ** -row.digits / 2) return '±0';
  const text = `${diff > 0 ? '+' : ''}${diff.toFixed(row.digits)}${row.unit ?? ''}`;
  const better = row.higherIsBetter ? diff > 0 : diff < 0;
  return better ? `**${text}**` : text;
}

function comparisonMarkdown() {
  const lines = [
    '# Lighthouse before / after',
    '',
    `Before: ${before.measuredAt} · After: ${after.measuredAt} · Lighthouse ${after.lighthouseVersion} · ${after.runs} runs per page and preset, median run.`,
    '',
  ];
  for (const page of after.pages) {
    const old = before.pages.find((p) => p.id === page.id);
    if (!old) continue;
    lines.push(`## ${page.name}`, '', `\`${page.path.replace(/date=[\d-]+/, 'date=<+14 days>').replace(/\d{4}-\d{2}-\d{2}/, '<+14 days>')}\``, '');
    lines.push('| Metric | Mobile before | Mobile after | Δ | Desktop before | Desktop after | Δ |');
    lines.push('| --- | --: | --: | --: | --: | --: | --: |');
    for (const row of ROWS) {
      const cells = PRESETS.flatMap((preset) => {
        const a = old.presets[preset].median[row.key];
        const b = page.presets[preset].median[row.key];
        return [`${a.toFixed(row.digits)}${row.unit ?? ''}`, `${b.toFixed(row.digits)}${row.unit ?? ''}`, delta(row, a, b)];
      });
      lines.push(`| ${row.label} | ${cells.join(' | ')} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

const color = (score) => (score >= 90 ? '#0cce6b' : score >= 50 ? '#ffa400' : '#ff4e42');
const ink = (score) => (score >= 90 ? '#008800' : score >= 50 ? '#c33300' : '#cc0000');

function gauge(score, label, size = 84) {
  const r = 42;
  const c = 2 * Math.PI * r;
  return `<figure class="gauge" style="--size:${size}px">
  <svg viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true">
    <circle cx="50" cy="50" r="${r}" fill="${color(score)}1f" stroke="${color(score)}33" stroke-width="8"/>
    <circle cx="50" cy="50" r="${r}" fill="none" stroke="${color(score)}" stroke-width="8" stroke-linecap="round"
      stroke-dasharray="${(c * score) / 100} ${c}" transform="rotate(-90 50 50)"/>
    <text x="50" y="50" dy="0.35em" text-anchor="middle" fill="${ink(score)}" font-size="30" font-weight="700">${score}</text>
  </svg>
  <figcaption>${label}</figcaption>
</figure>`;
}

const STYLE = `
  :root { --navy:#0b2545; --navy-2:#13315c; --blue:#1d4ed8; --sun:#f97316; --sky:#eef4ff; --line:#dbe2ec; --ink:#0f172a; --ink-soft:#475569;
    --sans: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; }
  * { box-sizing: border-box; }
  body { margin:0; font-family:var(--sans); color:var(--ink); background:#f5f7fb; }
  header { background:linear-gradient(160deg,var(--navy) 0%,var(--navy-2) 55%,var(--blue) 100%); color:#fff; padding:28px 40px 24px; }
  header p { margin:0; color:#dbeafe; }
  .eyebrow { text-transform:uppercase; letter-spacing:.12em; font-size:13px; font-weight:800; color:#fdba74 !important; margin-bottom:6px !important; }
  h1 { margin:0 0 6px; font-size:34px; letter-spacing:-.015em; }
  main { padding:24px 40px 32px; display:grid; gap:16px; }
  .card { background:#fff; border:1px solid var(--line); border-radius:14px; box-shadow:0 1px 2px rgba(11,37,69,.08); padding:18px 22px; }
  h2 { margin:0 0 4px; font-size:20px; }
  .path { color:var(--ink-soft); font-size:13px; font-family:ui-monospace,Menlo,monospace; margin:0 0 12px; }
  .gauge { margin:0; display:grid; justify-items:center; gap:4px; width:96px; }
  .gauge figcaption { font-size:12.5px; color:var(--ink-soft); text-align:center; font-weight:600; }
  .muted { color:var(--ink-soft); }
`;

function gaugesHtml() {
  const rows = after.pages
    .map((page) => {
      const old = before.pages.find((p) => p.id === page.id);
      const side = (summary, title) => {
        const m = summary.presets.mobile.median;
        const d = summary.presets.desktop.median;
        return `<div class="side"><p class="side-title">${title}</p><div class="gauges">
          ${gauge(m.performance, 'Performance')}${gauge(m.accessibility, 'Accessibility')}${gauge(m.bestPractices, 'Best Practices')}${gauge(m.seo, 'SEO')}
          <div class="desk">${gauge(d.performance, 'Desktop perf', 64)}</div></div>
          <p class="facts">LCP <b>${(m.lcpMs / 1000).toFixed(2)} s</b> · CLS <b>${m.cls.toFixed(3)}</b> · TBT <b>${Math.round(m.tbtMs)} ms</b> · JS <b>${m.jsKb.toFixed(1)} KB</b></p></div>`;
      };
      return `<section class="card row"><div class="page"><h2>${page.name}</h2><p class="path">${page.path.split('?')[0]}</p></div>
        ${side(old, 'Before')}<div class="arrow">→</div>${side(page, 'After')}</section>`;
    })
    .join('\n');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>FlyLo-Air Lighthouse before / after</title><style>${STYLE}
  .row { display:grid; grid-template-columns: 170px 1fr 40px 1fr; align-items:center; gap:16px; padding:14px 22px; }
  .side { background:#f8fafc; border:1px solid var(--line); border-radius:12px; padding:10px 14px 8px; }
  .side-title { margin:0 0 6px; font-weight:800; font-size:13px; letter-spacing:.1em; text-transform:uppercase; color:var(--blue); }
  .row .side:last-of-type .side-title { color:#047857; }
  .gauges { display:flex; align-items:flex-end; gap:6px; }
  .desk { margin-left:8px; padding-left:12px; border-left:1px dashed var(--line); }
  .arrow { font-size:30px; color:var(--sun); font-weight:800; text-align:center; }
  .facts { margin:6px 0 0; font-size:13px; color:var(--ink-soft); }
  .facts b { color:var(--ink); }
  </style></head><body>
  <header><p class="eyebrow">Fly more. Pay less. Load faster.</p><h1>FlyLo-Air Lighthouse: before vs after</h1>
  <p>Production build · Lighthouse ${after.lighthouseVersion} · mobile preset gauges (desktop performance on the right of each side) · median of ${after.runs} runs</p></header>
  <main>${rows}</main></body></html>`;
}

async function filmstripHtml() {
  const strip = async (label, page, preset) => {
    const lhr = await readJson(path.join('perf', label, `${page.id}.${preset}.json`));
    const frames = lhr.audits['screenshot-thumbnails']?.details?.items ?? [];
    const lcp = lhr.audits['largest-contentful-paint']?.numericValue ?? 0;
    const fcp = lhr.audits['first-contentful-paint']?.numericValue ?? 0;
    const cells = frames
      .map((frame) => {
        const mark = frame.timing >= lcp ? ' lcp' : frame.timing >= fcp ? ' fcp' : '';
        return `<figure class="frame${mark}"><img src="${frame.data}" alt=""><figcaption>${(frame.timing / 1000).toFixed(1)} s</figcaption></figure>`;
      })
      .join('');
    return `<div class="strip"><p class="strip-title">${label === args.before ? 'Before' : 'After'} · FCP ${(fcp / 1000).toFixed(2)} s · LCP ${(lcp / 1000).toFixed(2)} s</p><div class="frames">${cells}</div></div>`;
  };
  const sections = [];
  for (const page of after.pages) {
    sections.push(`<section class="card"><h2>${page.name} · mobile</h2><p class="path">${page.path.split('?')[0]}</p>
      ${await strip(args.before, page, 'mobile')}${await strip(args.after, page, 'mobile')}</section>`);
  }
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>FlyLo-Air page load filmstrip</title><style>${STYLE}
  .strip { margin-top:10px; }
  .strip-title { margin:0 0 6px; font-weight:700; font-size:14px; }
  .frames { display:flex; gap:8px; }
  .frame { margin:0; display:grid; gap:3px; justify-items:center; }
  .frame img { width:96px; border:2px solid var(--line); border-radius:6px; background:#fff; }
  .frame.fcp img { border-color:#ffa400; }
  .frame.lcp img { border-color:#0cce6b; }
  .frame figcaption { font-size:12px; color:var(--ink-soft); }
  .legend span { display:inline-block; width:12px; height:12px; border-radius:3px; vertical-align:-1px; margin:0 4px 0 12px; }
  </style></head><body>
  <header><p class="eyebrow">Page load comparison</p><h1>FlyLo-Air filmstrip: before vs after</h1>
  <p class="legend">Median mobile run, simulated slow 4G.<span style="background:#ffa400"></span>after first paint<span style="background:#0cce6b"></span>after largest paint</p></header>
  <main>${sections.join('\n')}</main></body></html>`;
}

function screenshot(htmlFile, pngFile, width, height) {
  execFileSync(chromeLauncher.Launcher.getInstallations()[0], [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    `--window-size=${width},${height}`,
    `--screenshot=${path.resolve(pngFile)}`,
    pathToFileURL(path.resolve(htmlFile)).href,
  ], { stdio: 'ignore' });
}

await mkdir(outDir, { recursive: true });
await writeFile(path.join(outDir, 'comparison.md'), comparisonMarkdown());
await writeFile(path.join(outDir, 'gauges.html'), gaugesHtml());
await writeFile(path.join(outDir, 'filmstrip.html'), await filmstripHtml());
screenshot(path.join(outDir, 'gauges.html'), path.join(outDir, 'gauges.png'), 1600, 190 + after.pages.length * 172);
screenshot(path.join(outDir, 'filmstrip.html'), path.join(outDir, 'filmstrip.png'), 1600, 160 + after.pages.length * 330);
console.log(comparisonMarkdown());
console.log(`Saved ${outDir}/comparison.md, gauges.png and filmstrip.png`);
