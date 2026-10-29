#!/usr/bin/env node
// Accessibility audit for FlyLo-Air (WCAG 2.1 AA via axe-core).
//
// Starts the built app (`next start`), loads every route at desktop and mobile
// widths with Playwright + @axe-core/playwright and writes a JSON + Markdown report.
//
//   npm run a11y                                   # build, then audit into a11y-report/
//   node scripts/a11y-audit.mjs --label before --out docs/a11y
//   node scripts/a11y-audit.mjs --url http://localhost:3000   # audit a server that is already running
//
// Exits 1 when an in-scope page has violations. /support/ is audited and reported but is out of scope.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const IMPACTS = ['critical', 'serious', 'moderate', 'minor'];
const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'mobile', width: 390, height: 844 },
];

const args = parseArgs(process.argv.slice(2));
const label = args.label ?? 'latest';
const outDir = path.resolve(ROOT, args.out ?? 'a11y-report');
const port = Number(args.port ?? 3100);

const travelDate = (() => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 14);
  return date.toISOString().slice(0, 10);
})();
const flightId = `SFO-JFK-${travelDate}-0`;
const checkoutUrl = (passengers) => `/checkout?flight=${flightId}&fare=main&passengers=${passengers}`;

const fillSample = (page) => page.getByRole('button', { name: 'Fill sample details' }).click();
const submitEmpty = async (page) => {
  await page.getByRole('button', { name: /^Pay / }).click();
  await page.getByRole('alert').first().waitFor();
};

const PAGES = [
  { key: 'home', title: 'Home (/)', inScope: true, states: [{ name: 'default', url: '/' }] },
  {
    key: 'results',
    title: 'Results (/results)',
    inScope: true,
    states: [{ name: 'SFO to JFK, 2 travelers', url: `/results?from=SFO&to=JFK&date=${travelDate}&passengers=2` }],
  },
  {
    key: 'checkout',
    title: 'Checkout (/checkout)',
    inScope: true,
    states: [1, 2].flatMap((passengers) => {
      const who = `${passengers} ${passengers === 1 ? 'traveler' : 'travelers'}`;
      return [
        { name: `${who} · empty`, url: checkoutUrl(passengers) },
        { name: `${who} · sample details filled`, url: checkoutUrl(passengers), act: fillSample },
        { name: `${who} · validation error`, url: checkoutUrl(passengers), act: submitEmpty },
      ];
    }),
  },
  {
    key: 'checkout-invalid',
    title: 'Checkout, invalid flight',
    inScope: true,
    states: [{ name: 'unknown flight', url: '/checkout?flight=XXX-YYY-2000-01-01-9&fare=main&passengers=1' }],
  },
  { key: 'support', title: 'Support (/support/)', inScope: false, states: [{ name: 'default', url: '/support/' }] },
];

async function main() {
  let server;
  let baseUrl = args.url?.replace(/\/$/, '');
  if (!baseUrl) {
    if (!existsSync(path.join(ROOT, '.next', 'BUILD_ID'))) {
      throw new Error('No production build found. Run `npm run build` first (or use `npm run a11y`).');
    }
    baseUrl = `http://127.0.0.1:${port}`;
    server = await startServer(port, baseUrl);
  }

  const browser = await launchBrowser();
  const results = [];
  try {
    console.log(`Auditing ${baseUrl} (travel date ${travelDate}) with axe tags: ${TAGS.join(', ')}\n`);
    for (const pageDef of PAGES) {
      for (const state of pageDef.states) {
        for (const viewport of VIEWPORTS) {
          const run = await auditState(browser, baseUrl, pageDef, state, viewport);
          results.push(run);
          const counts = countByImpact(run.violations);
          const scope = pageDef.inScope ? '' : ' (out of scope)';
          console.log(
            `${run.violations.length === 0 ? 'PASS' : 'FAIL'}  ${pageDef.title}${scope} · ${state.name} · ${viewport.name} ${viewport.width}px  ` +
              IMPACTS.map((impact) => `${impact}:${counts[impact]}`).join(' '),
          );
        }
      }
    }
  } finally {
    await browser.close();
    server?.kill('SIGTERM');
  }

  const report = buildReport(baseUrl, results);
  await mkdir(outDir, { recursive: true });
  const jsonPath = path.join(outDir, `${label}.json`);
  const mdPath = path.join(outDir, `${label}.md`);
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(mdPath, renderMarkdown(report));

  console.log('\nSummary (unique rules failing per page, all states and viewports):');
  console.table(
    Object.fromEntries(
      report.pages.map((p) => [
        p.title + (p.inScope ? '' : ' [out of scope]'),
        { ...p.rulesByImpact, rules: p.ruleCount, nodes: p.nodeCount },
      ]),
    ),
  );
  console.log(`In-scope violations: ${report.totals.inScopeRules} rules, ${report.totals.inScopeNodes} nodes`);
  console.log(`Wrote ${path.relative(ROOT, jsonPath)} and ${path.relative(ROOT, mdPath)}`);
  process.exitCode = report.totals.inScopeRules > 0 ? 1 : 0;
}

async function auditState(browser, baseUrl, pageDef, state, viewport) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const page = await context.newPage();
  try {
    await page.goto(baseUrl + state.url, { waitUntil: 'networkidle' });
    if (state.act) await state.act(page);
    await page.waitForTimeout(150);
    const axe = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    return {
      page: pageDef.key,
      title: pageDef.title,
      inScope: pageDef.inScope,
      state: state.name,
      url: state.url,
      viewport: viewport.name,
      width: viewport.width,
      violations: axe.violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact ?? 'minor',
        help: violation.help,
        helpUrl: violation.helpUrl,
        tags: violation.tags.filter((tag) => tag.startsWith('wcag') || tag === 'best-practice'),
        nodes: violation.nodes.map((node) => ({
          target: node.target.join(' '),
          html: node.html.slice(0, 200),
          summary: node.failureSummary,
        })),
      })),
      passes: axe.passes.length,
      incomplete: axe.incomplete.map((item) => item.id),
    };
  } finally {
    await context.close();
  }
}

function buildReport(baseUrl, results) {
  const pages = PAGES.map((pageDef) => {
    const runs = results.filter((run) => run.page === pageDef.key);
    const rules = new Map();
    for (const run of runs) {
      for (const violation of run.violations) {
        const rule = rules.get(violation.id) ?? {
          id: violation.id,
          impact: violation.impact,
          help: violation.help,
          helpUrl: violation.helpUrl,
          tags: violation.tags,
          nodes: 0,
          seenIn: [],
          targets: new Set(),
        };
        rule.nodes += violation.nodes.length;
        rule.seenIn.push(`${run.state} · ${run.viewport}`);
        violation.nodes.forEach((node) => rule.targets.add(node.target));
        rules.set(violation.id, rule);
      }
    }
    const ruleList = [...rules.values()]
      .map((rule) => ({ ...rule, targets: [...rule.targets].slice(0, 8) }))
      .sort((a, b) => IMPACTS.indexOf(a.impact) - IMPACTS.indexOf(b.impact) || a.id.localeCompare(b.id));
    return {
      key: pageDef.key,
      title: pageDef.title,
      inScope: pageDef.inScope,
      runs: runs.length,
      ruleCount: ruleList.length,
      nodeCount: ruleList.reduce((total, rule) => total + rule.nodes, 0),
      rulesByImpact: countByImpact(ruleList),
      rules: ruleList,
    };
  });
  const inScope = pages.filter((p) => p.inScope);
  return {
    generatedAt: new Date().toISOString(),
    baseUrl,
    travelDate,
    tags: TAGS,
    viewports: VIEWPORTS,
    totals: {
      inScopeRules: inScope.reduce((total, p) => total + p.ruleCount, 0),
      inScopeNodes: inScope.reduce((total, p) => total + p.nodeCount, 0),
      outOfScopeRules: pages.filter((p) => !p.inScope).reduce((total, p) => total + p.ruleCount, 0),
    },
    pages,
    runs: results,
  };
}

function renderMarkdown(report) {
  const lines = [
    `# FlyLo-Air accessibility audit (${label})`,
    '',
    `- Generated: ${report.generatedAt}`,
    `- Engine: axe-core via @axe-core/playwright, tags \`${report.tags.join('`, `')}\``,
    `- Viewports: ${report.viewports.map((v) => `${v.name} ${v.width}×${v.height}`).join(', ')}`,
    `- Search date: ${report.travelDate} (today + 14 days)`,
    `- In-scope result: **${report.totals.inScopeRules} failing rules, ${report.totals.inScopeNodes} failing nodes**`,
    '',
    '## Summary by page',
    '',
    'Counts are unique failing axe rules per page across every state and viewport, grouped by impact. "Nodes" is the total number of failing elements across all runs.',
    '',
    '| Page | Scope | Critical | Serious | Moderate | Minor | Nodes |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: |',
    ...report.pages.map(
      (p) =>
        `| ${p.title} | ${p.inScope ? 'In scope' : 'Out of scope, not changed'} | ${IMPACTS.map((i) => p.rulesByImpact[i]).join(' | ')} | ${p.nodeCount} |`,
    ),
    '',
    '## Runs',
    '',
    '| Page | State | Viewport | Critical | Serious | Moderate | Minor |',
    '| --- | --- | --- | ---: | ---: | ---: | ---: |',
    ...report.runs.map((run) => {
      const counts = countByImpact(run.violations);
      return `| ${run.title} | ${run.state} | ${run.viewport} ${run.width}px | ${IMPACTS.map((i) => counts[i]).join(' | ')} |`;
    }),
    '',
    '## Findings',
    '',
  ];
  for (const p of report.pages) {
    lines.push(`### ${p.title}${p.inScope ? '' : ' (out of scope, not changed)'}`, '');
    if (p.rules.length === 0) {
      lines.push('No violations.', '');
      continue;
    }
    for (const rule of p.rules) {
      lines.push(
        `- **${rule.id}** (${rule.impact}, ${rule.nodes} nodes): ${rule.help}. [Rule docs](${rule.helpUrl})`,
        `  - Seen in: ${[...new Set(rule.seenIn)].join('; ')}`,
        `  - Elements: ${rule.targets.map((t) => `\`${t.replace(/`/g, "'")}\``).join(', ')}`,
      );
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

function countByImpact(items) {
  const counts = Object.fromEntries(IMPACTS.map((impact) => [impact, 0]));
  for (const item of items) counts[item.impact ?? 'minor'] += 1;
  return counts;
}

async function startServer(serverPort, baseUrl) {
  const nextBin = path.join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next');
  const child = spawn(process.execPath, [nextBin, 'start', '-p', String(serverPort), '-H', '127.0.0.1'], {
    cwd: ROOT,
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`next start exited with code ${child.exitCode}`);
    try {
      const response = await fetch(baseUrl, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return child;
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  child.kill('SIGTERM');
  throw new Error(`next start did not answer on ${baseUrl} within 30s`);
}

async function launchBrowser() {
  try {
    return await chromium.launch();
  } catch (error) {
    // Fall back to a locally installed Chrome when Playwright's own browser is not downloaded.
    try {
      return await chromium.launch({ channel: 'chrome' });
    } catch {
      throw error;
    }
  }
}

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const match = /^--([^=]+)(?:=(.*))?$/.exec(argv[i]);
    if (!match) continue;
    parsed[match[1]] = match[2] ?? argv[i + 1];
    if (match[2] === undefined) i += 1;
  }
  return parsed;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 2;
});
