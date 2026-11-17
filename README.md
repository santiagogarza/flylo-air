# FlyLo-Air

FlyLo-Air is a **fictional airline** and this is a **SAMPLE** site for workshop demos. Flights, fares and bookings are generated; no real payments are taken.

One Next.js app (pages and API routes together) that deploys to Vercel as a single project.

| Page | What it does |
| --- | --- |
| `/` | Flight search (from, to, date, travelers) |
| `/results` | Generated flights with Basic, Main and Flex fares |
| `/checkout` | Traveler details and a sample card payment |
| `/support/` | "Call FlyLo-Air Support": a browser voice call that fills in the ticket form, then the caller presses Submit. This is the `flylo-support` scenario. The page and the webhook payload are unchanged. |
| `/intake?scenario=<id>` | The same form, skinned from `src/scenarios/<id>.ts` |
| `/intake/pay?scenario=lakeline-hardship` | Sample Lakeline payment portal. No card is charged. |
| `/intake/review?scenario=<id>` | Human review queue. Seeded for Lakeline. |
| `/intake/policy?scenario=<id>` | The scenario policy, when the config names one. |

| API route | What it does |
| --- | --- |
| `POST /api/checkout` | Validates the order and card, takes the (sample) payment and returns a booking reference |
| `POST /api/tickets` | Validates a support ticket, gives it an id (`FLY-SUP-1001`, `FLY-SUP-1002`, …) and forwards it to the support webhook |
| `POST /api/voice/session` | Mints a short-lived xAI realtime client secret for the call |
| `POST /api/cases` | Ingests a review case. Needs `CASES_INGEST_KEY`, or `DEMO_RESET_KEY` when that override is unset. |
| `POST /api/cases/<ticketId>` | Mock Send, Edit & send, Escalate, Reject, or Request changes. Does not email. |
| `POST /api/reset` | Clears tickets and reloads sample cases (needs `DEMO_RESET_KEY`) |

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

## Environment variables

All of these are **server-only**. Never prefix them with `NEXT_PUBLIC_`, and never commit them.

| Name | Used for |
| --- | --- |
| `XAI_API_KEY` | Minting realtime voice sessions. Without it the call button reports that voice is not configured and the form still works. |
| `SUPPORT_WEBHOOK_URL` | Where new tickets are POSTed. Also the fallback URL for any scenario whose own URL env var is unset. |
| `SUPPORT_WEBHOOK_HEADER` | Name of the header that carries the webhook key. Lakeline reuses this name. |
| `SUPPORT_WEBHOOK_KEY` | Value sent in that header. Also the fallback key. |
| `LAKELINE_WEBHOOK_URL` | Optional. Lakeline tickets POST here when this is set. |
| `LAKELINE_WEBHOOK_KEY` | Optional. Lakeline sender key. When unset, `SUPPORT_WEBHOOK_KEY` is used. |
| `DEMO_RESET_KEY` | Protects `POST /api/reset` (sent as `x-demo-reset-key`). Also authorizes `POST /api/cases` when `CASES_INGEST_KEY` is unset. |
| `CASES_INGEST_KEY` | Optional. When set, case ingest uses this key instead of `DEMO_RESET_KEY`. |
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

The call keeps whatever was already filled in if the microphone is blocked or the call drops. The form stays usable. A second click on Submit while a request is in flight is ignored. If the webhook times out or returns a non-2xx status, the form stays filled and shows an error so the caller can press Submit again.

## Add a new scenario in 5 minutes

A new customer variant is **one config file + one Grok Bot + that bot's webhook routine**. The app does not decide eligibility.

1. Copy `src/scenarios/lakeline-hardship.ts` to `src/scenarios/<id>.ts`.
2. Change the id, brand name, brand color, tagline, fields, categories, greeting, demo line, and voice instructions.
3. Give each field a `pattern` and a `normalize` name (`trim`, `email`, `booking`, `loan`, or a function) when the value has a format. Loan numbers use `normalize: 'loan'` and `pattern: '^LAF-\\d{5}$'`, so `laf 20417` and `LAF20417` become `LAF-20417`. If the value still does not match, the field stays visible and shows `Enter a loan number like LAF-20417.`
4. Set `webhook` to env var **names**, never values:

```ts
webhook: { urlEnv: 'ACME_WEBHOOK_URL', keyEnv: 'ACME_WEBHOOK_KEY', headerEnv: 'SUPPORT_WEBHOOK_HEADER' }
```

5. Register the config in `src/scenarios/index.ts`.
6. Add the env vars in Vercel. The Grok Bot webhook routine's request URL goes in `<X>_WEBHOOK_URL`. The sender key goes in `<X>_WEBHOOK_KEY`. The header name stays `SUPPORT_WEBHOOK_HEADER` (the value of that variable is the header name, not the key).

```bash
vercel env add ACME_WEBHOOK_URL
vercel env add ACME_WEBHOOK_KEY
```

Lakeline is already wired that way:

```bash
vercel env add LAKELINE_WEBHOOK_URL
vercel env add LAKELINE_WEBHOOK_KEY
```

If those are unset, the ticket is sent with `SUPPORT_WEBHOOK_URL`, `SUPPORT_WEBHOOK_HEADER`, and `SUPPORT_WEBHOOK_KEY`. Do not create a second pipeline and do not prefix any of these with `NEXT_PUBLIC_`.

| Variant | Scenario id | Prefix | URL env | Key env |
| --- | --- | --- | --- | --- |
| University student support | `university-support` | `UNI-SUP-` | `UNIVERSITY_WEBHOOK_URL` | `UNIVERSITY_WEBHOOK_KEY` |
| Insurance claim | `insurance-claim` | `INS-CLM-` | `INSURANCE_WEBHOOK_URL` | `INSURANCE_WEBHOOK_KEY` |
| Medical appointment | `clinic-appointment` | `CLN-APT-` | `CLINIC_WEBHOOK_URL` | `CLINIC_WEBHOOK_KEY` |

Commented sketches of those three live in `src/scenarios/examples.ts`. Every variant reuses `SUPPORT_WEBHOOK_HEADER`.

Open the form at `/intake?scenario=<id>`. An unknown id shows the list of scenarios. `/support/` stays the FlyLo form.

### Reset

`POST /api/reset` with header `x-demo-reset-key: $DEMO_RESET_KEY` clears the in-memory ticket list and restarts every prefix at 1001 (`FLY-SUP-1001`, `LAF-REQ-1001`, …). It also clears reviewer actions on cases and reloads the sample queue from `loans.json`. The response is `{ ok: true, cleared, casesCleared }`. Reloading the form, or pressing **Start a new request**, only clears the browser. It does not call the reset API.

```bash
DEMO_URL=https://<your-deployment> DEMO_RESET_KEY=<key> npm run reset-demo
```

Tickets live in memory on each server instance. A cold start also empties them.

### Lakeline payload

`POST /api/tickets` with a `scenario` of `lakeline-hardship` forwards:

```json
{
  "scenario": "lakeline-hardship",
  "id": "LAF-REQ-1001",
  "createdAt": "2026-11-17T12:00:00.000Z",
  "channel": "voice",
  "fields": {
    "fullName": "Maya Chen",
    "loanNumber": "LAF-20417",
    "email": "maya.chen@example.com",
    "reason": "I had a medical bill this month and need to push my payment back a few weeks.",
    "requestedChange": "Payment extension",
    "callbackWindow": "Afternoons"
  },
  "category": "Payment extension",
  "summary": "Payment extension request from Maya Chen (LAF-20417): I had a medical bill this month and need to push my payment back a few weeks.",
  "description": "Maya Chen (loan LAF-20417, maya.chen@example.com) requested Payment extension. Reason: I had a medical bill this month and need to push my payment back a few weeks. Best callback window: Afternoons."
}
```

Greeting: *"Lakeline Auto Finance customer care. How can I help?"*

Demo line: *"Hi, I'm Maya Chen, loan LAF-20417, maya.chen@example.com. I had a medical bill this month and need to push my payment back a few weeks. Afternoons are best to call me."*

`/intake/pay?scenario=lakeline-hardship` accepts a loan number and a normal amount and shows a confirmation. It does not charge a card. Callers who say the payment portal failed are talking about this page.

Reference copies of the mock loans and the hardship policy are in `src/scenarios/lakeline/`. The intake form still does not decide eligibility. The review desk does, from those two files.

### Review queue

`/intake/review?scenario=lakeline-hardship` lists seeded cases. Compliance stops come first, then other escalations, then payment plans, then approvals. `/intake/review/<ticketId>` shows the request, the loan on file, a Why panel (each rule links to `/intake/policy?scenario=lakeline-hardship#s1` through `#s6`), disclosures, and a draft reply.

**Send, Edit & send, Escalate, Reject, and Request changes are mock.** They write a name and a time onto the in-memory case. They do not email, text, or call a webhook. Sending twice returns the current status and does not add another log line. Editing the draft and then sending stores the new text.

`POST /api/cases` ingests a case. Auth is `Authorization: Bearer <key>` or the `x-demo-reset-key` header. The key is `CASES_INGEST_KEY` when that variable is set, otherwise `DEMO_RESET_KEY`. A missing or wrong key returns 401 with `Unauthorized. Send Authorization: Bearer <key>, or the x-demo-reset-key header.` If neither variable is set, the response is 503: `Case ingest is not configured. Set CASES_INGEST_KEY or DEMO_RESET_KEY.` A bad body returns 400 and names the field, for example `ticketId is required.` or `request.loanNumber is required.`

Lakeline cases are evaluated from `hardship-policy.md` and `loans.json`. Other scenarios have no evaluator, so `decision` and `rules` are required.

```json
{
  "ticketId": "LAF-REQ-2001",
  "scenario": "lakeline-hardship",
  "request": {
    "fullName": "Maya Chen",
    "loanNumber": "LAF-20417",
    "email": "maya.chen@example.com",
    "reason": "I had a medical bill this month and need to push my payment back a few weeks.",
    "requestedChange": "Payment extension",
    "callbackWindow": "Afternoons"
  },
  "history": { "priorTickets": [] },
  "draft": "Optional. If omitted, the desk writes a draft that includes the required disclosures."
}
```

Cases live in memory, same as tickets. Reset reloads the eleven sample cases.
