import { cleanTicket, validateTicket, type TicketFields } from '@/lib/support';
import { getScenario } from '@/scenarios';
import {
  cleanScenarioFields,
  scenarioCategory,
  scenarioDescription,
  scenarioSummary,
  validateScenario,
} from '@/scenarios/validate';
import { resolveWebhook, type WebhookTarget } from '@/scenarios/webhook';
import { getCase } from './cases';
import { currentBag, IdClaimError } from './demo-store';
import { asString, isAllowedOrigin, json, readJson, type ServerContext } from './http';

export const FIRST_TICKET_NUMBER = 1001;
/** Sample review cases use LAF-REQ-9001 and up. Live scenario ids jump over this block. */
export const RESERVED_TICKET_NUMBER = 9001;
export const RESERVED_TICKET_SPAN = 999;
export const CLAIM_ATTEMPTS = 50;
export const WEBHOOK_TIMEOUT_MS = 10_000;
export const LEGACY_PREFIX = 'FLY-SUP-';

type Channel = 'voice' | 'web';

type StoredTicket = {
  id: string;
  createdAt: string;
  channel: Channel;
  delivered: boolean;
};

type TicketFile = { nextByPrefix: Record<string, number>; tickets: StoredTicket[] };

// Ids and the webhook body are unchanged. The list is saved through the demo store.
async function loadTickets(): Promise<TicketFile> {
  const stored = await (await currentBag()).read('tickets');
  if (!stored || typeof stored !== 'object') return { nextByPrefix: {}, tickets: [] };
  const value = stored as TicketFile;
  return { nextByPrefix: value.nextByPrefix ?? {}, tickets: value.tickets ?? [] };
}

async function saveTickets(state: TicketFile): Promise<void> {
  await (await currentBag()).write('tickets', state);
}

export async function resetTickets(): Promise<{ cleared: number }> {
  const state = await loadTickets();
  const cleared = state.tickets.length;
  await saveTickets({ nextByPrefix: {}, tickets: [] });
  return { cleared };
}

export async function ticketCount(): Promise<number> {
  return (await loadTickets()).tickets.length;
}

export function scenarioTicketNumber(sequence: number): number {
  const number = FIRST_TICKET_NUMBER - 1 + sequence;
  return number >= RESERVED_TICKET_NUMBER ? number + RESERVED_TICKET_SPAN : number;
}

// Scenario ids come from a counter that reset never touches, so a new caller cannot
// receive an id that an older case already used.
async function claimScenarioId(prefix: string): Promise<string> {
  const bag = await currentBag();
  const sequence = await bag.claimSeq(prefix, {
    maxAttempts: CLAIM_ATTEMPTS,
    name: (k) => `${prefix}${scenarioTicketNumber(k)}`,
    accept: async (k) => !(await getCase(`${prefix}${scenarioTicketNumber(k)}`)),
  });
  return `${prefix}${scenarioTicketNumber(sequence)}`;
}

function allocateId(state: TicketFile, prefix: string): string {
  const next = state.nextByPrefix[prefix] ?? FIRST_TICKET_NUMBER;
  if (next >= RESERVED_TICKET_NUMBER) {
    throw new Error(`Live ${prefix} tickets stop before ${RESERVED_TICKET_NUMBER}.`);
  }
  state.nextByPrefix[prefix] = next + 1;
  return `${prefix}${next}`;
}

export function summarize(ticket: TicketFields): string {
  const text = ticket.description.replace(/\s+/g, ' ');
  const short = text.length > 160 ? `${text.slice(0, 157).trimEnd()}…` : text;
  return `${ticket.category} issue from ${ticket.fullName} (${ticket.bookingReference}): ${short}`;
}

export async function handleCreateTicket(request: Request, ctx: ServerContext): Promise<Response> {
  if (!isAllowedOrigin(request, ctx.env)) return json(403, { ok: false, id: null, status: 'forbidden' });

  const parsed = await readJson(request);
  if ('error' in parsed) return json(400, { ok: false, id: null, status: 'invalid' });

  const raw = parsed.value;
  // /support posts the original flat ticket and must stay on this path, even if a scenario id is absent.
  if (isScenarioSubmission(raw)) return handleScenarioTicket(raw, ctx);

  const fields: TicketFields = {
    fullName: asString(raw.fullName),
    bookingReference: asString(raw.bookingReference),
    email: asString(raw.email),
    category: asString(raw.category),
    description: asString(raw.description),
  };
  if (Object.keys(validateTicket(fields)).length > 0) {
    return json(400, { ok: false, id: null, status: 'invalid' });
  }

  const cleaned = cleanTicket(fields);
  const state = await loadTickets();
  const ticket: StoredTicket = {
    id: allocateId(state, LEGACY_PREFIX),
    createdAt: new Date().toISOString(),
    channel: raw.channel === 'voice' ? 'voice' : 'web',
    delivered: false,
  };
  state.tickets.push(ticket);
  await saveTickets(state);

  const body = JSON.stringify({
    id: ticket.id,
    createdAt: ticket.createdAt,
    channel: ticket.channel,
    fullName: cleaned.fullName,
    bookingReference: cleaned.bookingReference,
    email: cleaned.email,
    category: cleaned.category,
    description: cleaned.description,
    summary: summarize(cleaned),
  });

  ticket.delivered = await deliver(ticket.id, body, resolveWebhook(undefined, ctx.env), ctx);
  await saveTickets(state);
  if (!ticket.delivered) return json(502, { ok: false, id: ticket.id, status: 'not_delivered' });
  return json(201, { ok: true, id: ticket.id, status: 'received' });
}

function isScenarioSubmission(raw: Record<string, unknown>): boolean {
  if (typeof raw.scenario !== 'string' || raw.scenario.trim().length === 0) return false;
  // flylo-support is rendered by the shared form but still posts the legacy body.
  if (raw.scenario.trim() === 'flylo-support') return false;
  return true;
}

async function handleScenarioTicket(raw: Record<string, unknown>, ctx: ServerContext): Promise<Response> {
  const scenario = getScenario(asString(raw.scenario));
  if (!scenario || scenario.legacyPayload) return json(400, { ok: false, id: null, status: 'invalid' });

  const incoming = asFieldMap(raw.fields);
  if (Object.keys(validateScenario(scenario, incoming)).length > 0) {
    return json(400, { ok: false, id: null, status: 'invalid' });
  }

  const fields = cleanScenarioFields(scenario, incoming);
  const category = scenarioCategory(scenario, fields);
  const createdAt = new Date().toISOString();
  const channel: Channel = raw.channel === 'voice' ? 'voice' : 'web';
  let id: string;
  try {
    id = await claimScenarioId(scenario.ticketPrefix);
  } catch (error) {
    if (!(error instanceof IdClaimError)) throw error;
    ctx.log('ticket id claim failed', scenario.ticketPrefix, error.message);
    return json(503, { ok: false, id: null, status: 'unavailable' });
  }
  const state = await loadTickets();
  const ticket: StoredTicket = {
    id,
    createdAt,
    channel,
    delivered: false,
  };
  state.tickets.push(ticket);
  await saveTickets(state);

  const body = JSON.stringify({
    scenario: scenario.id,
    id: ticket.id,
    createdAt: ticket.createdAt,
    channel: ticket.channel,
    fields,
    category,
    summary: scenarioSummary(scenario, fields, category),
    description: scenarioDescription(scenario, fields),
  });

  ticket.delivered = await deliver(ticket.id, body, resolveWebhook(scenario.webhook, ctx.env), ctx);
  await saveTickets(state);
  if (!ticket.delivered) return json(502, { ok: false, id: ticket.id, status: 'not_delivered' });
  return json(201, { ok: true, id: ticket.id, status: 'received' });
}

function asFieldMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === 'string') out[key] = item;
  }
  return out;
}

async function deliver(id: string, body: string, target: WebhookTarget, ctx: ServerContext): Promise<boolean> {
  const { url, headerName, key } = target;
  if (!url || !headerName || !key) {
    if (target.demoWhenUnset && !url) {
      ctx.log('ticket accepted in demo mode', id);
      return true;
    }
    ctx.log('support webhook skipped: not configured', id);
    return false;
  }

  let headers: Headers;
  try {
    headers = new Headers({ 'content-type': 'application/json' });
    // Send the key exactly as stored. Do not add a Bearer prefix.
    headers.set(headerName, key);
  } catch {
    ctx.log('support webhook skipped: header name is not valid', id);
    return false;
  }

  try {
    const response = await ctx.fetchImpl(url, {
      method: 'POST',
      headers,
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });
    await response.body?.cancel().catch(() => undefined);
    const delivered = response.status >= 200 && response.status < 300;
    ctx.log('support webhook', delivered ? 'delivered' : `status ${response.status}`, id);
    return delivered;
  } catch (error) {
    const reason = error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'network';
    ctx.log('support webhook failed', reason, id);
    return false;
  }
}
