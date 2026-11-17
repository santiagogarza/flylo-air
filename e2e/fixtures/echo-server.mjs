// Local stand-in for every outbound webhook during e2e runs. Records each request and replies
// according to a mode the tests set over HTTP. Never forwards anything anywhere.
//
//   POST /__mode   { "status": 503, "delayMs": 0, "times": 1 }  next `times` hook calls use this (omit times = until reset)
//   GET  /__requests                                             everything recorded since the last reset
//   POST /__reset                                                clear requests and mode
//   any other path                                              recorded, then answered per mode (default 200 {"ok":true})
import http from 'node:http';

const port = Number(process.env.ECHO_PORT ?? 4599);
let requests = [];
let mode = null;

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    const text = Buffer.concat(chunks).toString('utf8');
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);

    if (url.pathname === '/__requests') return send(res, 200, requests);
    if (url.pathname === '/__reset') {
      requests = [];
      mode = null;
      return send(res, 200, { ok: true });
    }
    if (url.pathname === '/__mode') {
      mode = text ? JSON.parse(text) : null;
      return send(res, 200, { ok: true, mode });
    }
    if (url.pathname === '/__health') return send(res, 200, { ok: true });

    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    requests.push({ method: req.method, path: url.pathname, headers: req.headers, body, at: Date.now() });

    const active = mode;
    if (active && typeof active.times === 'number') {
      active.times -= 1;
      if (active.times <= 0) mode = null;
    }
    const status = active?.status ?? 200;
    const delay = active?.delayMs ?? 0;
    setTimeout(() => {
      if (res.destroyed) return;
      send(res, status, status >= 200 && status < 300 ? { ok: true } : { ok: false });
    }, delay);
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`echo listener on http://127.0.0.1:${port}`);
});
