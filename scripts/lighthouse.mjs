// Reproducible Lighthouse benchmark for the production build.
// Usage: npm run perf -- --label before   (options: --runs 3, --port 3100, --pages home,results, --skip-build)
// Builds (npm run build), starts `next start`, runs Lighthouse with the mobile and desktop
// presets N times per page and keeps the median run (Lighthouse's own computeMedianRun).
// Writes perf/<label>/<page>.<preset>.json (median report), summary.{json,md}, plus HTML reports
// and every individual run in perf/<label>/runs/ (those two are not committed).
import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import * as chromeLauncher from 'chrome-launcher';
import lighthouse from 'lighthouse';
import desktopConfig from 'lighthouse/core/config/desktop-config.js';
import { computeMedianRun } from 'lighthouse/core/lib/median-run.js';
import { ReportGenerator } from 'lighthouse/report/generator/report-generator.js';

const { values: args } = parseArgs({
  options: {
    label: { type: 'string', default: 'latest' },
    runs: { type: 'string', default: '3' },
    port: { type: 'string', default: '3100' },
    pages: { type: 'string' },
    'skip-build': { type: 'boolean', default: false },
  },
});

const label = args.label.replace(/[^a-z0-9-]/gi, '-');
const runs = Math.max(1, Number.parseInt(args.runs, 10) || 3);
const port = Number.parseInt(args.port, 10) || 3100;
const base = `http://localhost:${port}`;
const outDir = path.join('perf', label);

// Same rule as defaultTravelDate() in src/lib/dates.ts: 14 days from the real current date.
const travel = new Date();
travel.setUTCDate(travel.getUTCDate() + 14);
const date = travel.toISOString().slice(0, 10);

const ALL_PAGES = [
  { id: 'home', name: 'Home', path: '/' },
  { id: 'results', name: 'Results', path: `/results?from=SFO&to=JFK&date=${date}&passengers=1` },
  { id: 'checkout', name: 'Checkout', path: `/checkout?flight=SFO-JFK-${date}-0&fare=basic&passengers=1` },
  { id: 'support', name: 'Support (measure only)', path: '/support/' },
];
const PAGES = args.pages ? ALL_PAGES.filter((page) => args.pages.split(',').includes(page.id)) : ALL_PAGES;

const PRESETS = {
  mobile: undefined,
  desktop: desktopConfig,
};

const CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo'];

function run(command, commandArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, { stdio: 'inherit' });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${command} ${commandArgs.join(' ')} exited with ${code}`))));
  });
}

async function waitForServer(url, timeoutMs = 60_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      if (response.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Server at ${url} did not start within ${timeoutMs / 1000}s`);
}

function scriptBytes(lhr) {
  const items = lhr.audits['network-requests']?.details?.items ?? [];
  return items.filter((item) => item.resourceType === 'Script').reduce((sum, item) => sum + (item.transferSize ?? 0), 0);
}

function totalBytes(lhr) {
  return lhr.audits['total-byte-weight']?.numericValue ?? 0;
}

function metrics(lhr) {
  const score = (id) => Math.round((lhr.categories[id]?.score ?? 0) * 100);
  const value = (id) => lhr.audits[id]?.numericValue ?? null;
  return {
    performance: score('performance'),
    accessibility: score('accessibility'),
    bestPractices: score('best-practices'),
    seo: score('seo'),
    fcpMs: value('first-contentful-paint'),
    lcpMs: value('largest-contentful-paint'),
    cls: value('cumulative-layout-shift'),
    tbtMs: value('total-blocking-time'),
    speedIndexMs: value('speed-index'),
    ttfbMs: value('server-response-time'),
    jsKb: scriptBytes(lhr) / 1024,
    totalKb: totalBytes(lhr) / 1024,
  };
}

async function lighthouseOnce(url, preset) {
  const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu'] });
  try {
    const result = await lighthouse(
      url,
      { port: chrome.port, output: 'json', logLevel: 'error', onlyCategories: CATEGORIES, disableFullPageScreenshot: true },
      PRESETS[preset],
    );
    if (!result) throw new Error(`Lighthouse returned no result for ${url}`);
    if (result.lhr.runtimeError) throw new Error(`${url}: ${result.lhr.runtimeError.message}`);
    return result.lhr;
  } finally {
    chrome.kill();
  }
}

function fmt(value, digits = 0) {
  return value === null || value === undefined ? 'n/a' : Number(value).toFixed(digits);
}

function markdown(summary) {
  const lines = [
    `# Lighthouse: ${summary.label}`,
    '',
    `Production build (\`next build && next start\`), Lighthouse ${summary.lighthouseVersion}, ${summary.runs} runs per page and preset, median run shown.`,
    `Measured ${summary.measuredAt} on ${summary.chrome}. Travel date ${summary.travelDate}.`,
    '',
  ];
  for (const preset of Object.keys(PRESETS)) {
    lines.push(`## ${preset === 'mobile' ? 'Mobile' : 'Desktop'}`, '');
    lines.push('| Page | Perf | A11y | Best Practices | SEO | FCP | LCP | CLS | TBT | Speed Index | JS KB | Total KB | Perf per run |');
    lines.push('| --- | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --- |');
    for (const page of summary.pages) {
      const entry = page.presets[preset];
      const m = entry.median;
      lines.push(
        `| ${page.name} | ${m.performance} | ${m.accessibility} | ${m.bestPractices} | ${m.seo} | ${fmt(m.fcpMs)} ms | ${fmt(m.lcpMs)} ms | ${fmt(m.cls, 3)} | ${fmt(m.tbtMs)} ms | ${fmt(m.speedIndexMs)} ms | ${fmt(m.jsKb, 1)} | ${fmt(m.totalKb, 1)} | ${entry.runs.map((r) => r.performance).join(', ')} |`,
      );
    }
    lines.push('');
  }
  lines.push('Pages:', '');
  for (const page of summary.pages) lines.push(`- ${page.name}: \`${page.path}\``);
  lines.push('');
  return lines.join('\n');
}

async function main() {
  const busy = await fetch(base, { signal: AbortSignal.timeout(2_000) }).then(() => true, () => false);
  if (busy) throw new Error(`Something is already listening on ${base}; stop it or pass --port so the benchmark measures a fresh build.`);
  if (!args['skip-build']) await run('npm', ['run', 'build']);

  const server = spawn('npx', ['next', 'start', '-p', String(port)], { stdio: ['ignore', 'inherit', 'inherit'], detached: true });
  const stopServer = () => {
    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch {
      /* already gone */
    }
  };
  process.on('SIGINT', () => {
    stopServer();
    process.exit(130);
  });

  try {
    await waitForServer(base);
    await rm(outDir, { recursive: true, force: true });
    await mkdir(path.join(outDir, 'runs'), { recursive: true });

    const summary = {
      label,
      measuredAt: new Date().toISOString(),
      travelDate: date,
      runs,
      lighthouseVersion: '',
      chrome: '',
      pages: [],
    };

    for (const page of PAGES) {
      const url = `${base}${page.path}`;
      await fetch(url); // warm the server once so no run pays for a cold start
      const pageSummary = { id: page.id, name: page.name, path: page.path, presets: {} };
      for (const preset of Object.keys(PRESETS)) {
        const lhrs = [];
        for (let i = 1; i <= runs; i += 1) {
          const lhr = await lighthouseOnce(url, preset);
          lhrs.push(lhr);
          await writeFile(path.join(outDir, 'runs', `${page.id}.${preset}.${i}.json`), JSON.stringify(lhr));
          console.log(`[${label}] ${page.id} ${preset} run ${i}/${runs}: performance ${metrics(lhr).performance}`);
        }
        const median = computeMedianRun(lhrs);
        summary.lighthouseVersion = median.lighthouseVersion;
        summary.chrome = median.environment?.hostUserAgent?.match(/Chrome\/[\d.]+/)?.[0] ?? '';
        await writeFile(path.join(outDir, `${page.id}.${preset}.json`), JSON.stringify(median));
        await writeFile(path.join(outDir, `${page.id}.${preset}.html`), ReportGenerator.generateReport(median, 'html'));
        pageSummary.presets[preset] = { median: metrics(median), runs: lhrs.map(metrics) };
      }
      summary.pages.push(pageSummary);
    }

    await writeFile(path.join(outDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
    await writeFile(path.join(outDir, 'summary.md'), markdown(summary));
    console.log(`\nSaved ${path.join(outDir, 'summary.md')}\n`);
    console.log(markdown(summary));
  } finally {
    stopServer();
  }
}

await main();
