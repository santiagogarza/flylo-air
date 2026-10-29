import { cleanTicket, validateTicket, type TicketFields } from '@/lib/support';
import { asString, isAllowedOrigin, json, readJson, type ServerContext } from './http';

export const FIRST_TICKET_NUMBER = 1001;
export const WEBHOOK_TIMEOUT_MS = 10_000;

type StoredTicket = TicketFields & {
  id: string;
  createdAt: string;
  channel: 'voice' | 'web';
  delivered: boolean;
};

// In-memory only: each server instance keeps its own list, and a cold start empties it.
const state: { next: number; tickets: StoredTicket[] } = { next: FIRST_TICKET_NUMBER, tickets: [] };

export function resetTickets(): { cleared: number } {
  const cleared = state.tickets.length;
  state.next = FIRST_TICKET_NUMBER;
  state.tickets = [];
  return { cleared };
}

export function ticketCount(): number {
  return state.tickets.length;
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

  const ticket: StoredTicket = {
    ...cleanTicket(fields),
    id: `FLY-SUP-${state.next}`,
    createdAt: new Date().toISOString(),
    channel: raw.channel === 'voice' ? 'voice' : 'web',
    delivered: false,
  };
  state.next += 1;
  state.tickets.push(ticket);

  ticket.delivered = await forwardTicket(ticket, ctx);
  if (!ticket.delivered) return json(502, { ok: false, id: ticket.id, status: 'not_delivered' });
  return json(201, { ok: true, id: ticket.id, status: 'received' });
}

async function forwardTicket(ticket: StoredTicket, ctx: ServerContext): Promise<boolean> {
  const { SUPPORT_WEBHOOK_URL: url, SUPPORT_WEBHOOK_HEADER: headerName, SUPPORT_WEBHOOK_KEY: key } = ctx.env;
  if (!url || !headerName || !key) {
    ctx.log('support webhook skipped: not configured', ticket.id);
    return false;
  }

  let headers: Headers;
  try {
    headers = new Headers({ 'content-type': 'application/json' });
    headers.set(headerName, key);
  } catch {
    ctx.log('support webhook skipped: header name is not valid', ticket.id);
    return false;
  }

  const body = JSON.stringify({
    id: ticket.id,
    createdAt: ticket.createdAt,
    channel: ticket.channel,
    fullName: ticket.fullName,
    bookingReference: ticket.bookingReference,
    email: ticket.email,
    category: ticket.category,
    description: ticket.description,
    summary: summarize(ticket),
  });

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
    ctx.log('support webhook', delivered ? 'delivered' : `status ${response.status}`, ticket.id);
    return delivered;
  } catch (error) {
    const reason = error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'network';
    ctx.log('support webhook failed', reason, ticket.id);
    return false;
  }
}
