# FlyLo-Air

FlyLo-Air is a **fictional airline** and this is a **SAMPLE** site for workshop demos. Flights, fares and bookings are generated; no real payments are taken.

One Next.js app (pages and API routes together) that deploys to Vercel as a single project.

| Page | What it does |
| --- | --- |
| `/` | Flight search (from, to, date, travelers) |
| `/results` | Generated flights with Basic, Main and Flex fares |
| `/checkout` | Traveler details and a sample card payment |
| `/support/` | "Call FlyLo-Air Support": a browser voice call that fills in the ticket form, then the caller presses Submit |

| API route | What it does |
| --- | --- |
| `POST /api/checkout` | Validates the order and card, takes the (sample) payment and returns a booking reference |
| `POST /api/tickets` | Validates a support ticket, gives it an id (`FLY-SUP-1001`, `FLY-SUP-1002`, …) and forwards it to the support webhook |
| `POST /api/voice/session` | Mints a short-lived xAI realtime client secret for the call |
| `POST /api/reset` | Clears the server's ticket list (needs `DEMO_RESET_KEY`) |

## Run it

```bash
npm install
cp .env.example .env.local   # fill in what you have
npm run dev                  # http://localhost:3000
```

```bash
npm test          # vitest
npm run typecheck
npm run build
```

## Performance benchmark

```bash
npm run perf -- --label after                        # build, next start, Lighthouse mobile + desktop, 3 runs, median
npm run perf:compare -- --before before --after after
```

`npm run perf` measures `/`, `/results` (SFO → JFK, 14 days out), `/checkout` for one flight and `/support/`, and saves the median JSON reports plus `summary.md` in `perf/<label>/`. `perf:compare` writes `perf/compare/comparison.md` and renders side-by-side gauges and a page-load filmstrip (`gauges.png`, `filmstrip.png`). Options: `--runs`, `--port`, `--pages home,results`, `--skip-build`.

## Environment variables

All of these are **server-only**. Never prefix them with `NEXT_PUBLIC_`, and never commit them.

| Name | Used for |
| --- | --- |
| `XAI_API_KEY` | Minting realtime voice sessions. Without it the call button reports that voice is not configured and the form still works. |
| `SUPPORT_WEBHOOK_URL` | Where new tickets are POSTed. |
| `SUPPORT_WEBHOOK_HEADER` | Name of the header that carries the webhook key. |
| `SUPPORT_WEBHOOK_KEY` | Value sent in that header. |
| `DEMO_RESET_KEY` | Protects `POST /api/reset` (sent as `x-demo-reset-key`). |
| `ALLOWED_ORIGINS` | Optional, comma separated. Same-origin and localhost are always allowed. |

On Vercel: `vercel env add XAI_API_KEY production` (and the same for each name), then `vercel --prod`.

## Ticket forwarding

`POST /api/tickets` makes exactly one request to `SUPPORT_WEBHOOK_URL`: no retries, a 10 second timeout, `redirect: 'manual'` (a redirect counts as not delivered). The JSON body is:

```json
{
  "id": "FLY-SUP-1001",
  "createdAt": "2026-10-29T17:00:00.000Z",
  "channel": "voice",
  "fullName": "Maya Chen",
  "bookingReference": "FLY-48213",
  "email": "maya.chen@example.com",
  "category": "Checkout / payment",
  "description": "…",
  "summary": "Checkout / payment issue from Maya Chen (FLY-48213): …"
}
```

The browser only ever gets `{ ok, id, status }` back: `status` is `received`, `not_delivered`, `invalid` or `forbidden`.

## Resetting the demo

The support form keeps nothing in the browser: **reloading `/support/` always shows a fresh, empty form**, and "Start a new request" does the same without a reload.

The server keeps tickets in memory only, to number them. To clear that list and restart at `FLY-SUP-1001`:

```bash
DEMO_URL=https://<your-deployment> DEMO_RESET_KEY=<key> npm run reset-demo
# or
curl -X POST https://<your-deployment>/api/reset -H "x-demo-reset-key: <key>"
```

On Vercel each server instance has its own memory, and a cold start also empties it, so numbering restarts at `FLY-SUP-1001` after a redeploy too.

## Voice call

`src/lib/voice-call.ts` connects the browser straight to the xAI realtime API with a client secret minted by `/api/voice/session`. The agent calls a `set_field` tool for each field as soon as it hears it; the form highlights each field as it fills. It keeps replies to one or two sentences, asks for everything missing in one question, does not read the form back, and finishes by asking the caller to check the form and press Submit.

Demo line: *"Hi, I'm Maya Chen, booking FLY-48213, maya.chen@example.com. I'm trying to book a flight for me and my son and checkout keeps failing at payment."*
