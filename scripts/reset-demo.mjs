// Clears the server-side ticket list and restarts ids at FLY-SUP-1001.
// Usage: DEMO_URL=https://your-deployment.example DEMO_RESET_KEY=... npm run reset-demo
try {
  process.loadEnvFile('.env.local');
} catch {
  /* optional */
}

const base = (process.env.DEMO_URL || 'http://localhost:3000').replace(/\/$/, '');
const key = process.env.DEMO_RESET_KEY;

if (!key) {
  console.error('Set DEMO_RESET_KEY (in the environment or .env.local) to the value configured on the server.');
  process.exit(1);
}

try {
  const response = await fetch(`${base}/api/reset`, {
    method: 'POST',
    headers: { 'x-demo-reset-key': key },
    signal: AbortSignal.timeout(10_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.ok) {
    console.error(`Reset failed (${response.status}): ${body.error ?? 'unexpected response'}`);
    process.exit(1);
  }
  console.log(`Reset ${base}: cleared ${body.cleared} ticket(s). Next id is FLY-SUP-1001.`);
} catch (error) {
  console.error(`Could not reach ${base}: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
