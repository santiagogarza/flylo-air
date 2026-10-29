import { describe, expect, it } from 'vitest';
import { ISSUE_CATEGORIES, matchCategory, normalizeBookingReference, normalizeEmail, TICKET_FIELDS, validateTicket } from '@/lib/support';
import { GREETING, KEYTERMS, sessionConfig } from '@/lib/voice-call';

describe('ticket fields', () => {
  it('normalizes spoken booking references', () => {
    expect(normalizeBookingReference('fly 48213')).toBe('FLY-48213');
    expect(normalizeBookingReference('FLY48213')).toBe('FLY-48213');
    expect(normalizeBookingReference('F.L.Y. 4-8-2-1-3')).toBe('FLY-48213');
  });

  it('normalizes emails', () => {
    expect(normalizeEmail(' Maya.Chen @Example.com ')).toBe('maya.chen@example.com');
  });

  it('maps loose category names onto the list', () => {
    expect(matchCategory('Checkout / payment')).toBe('Checkout / payment');
    expect(matchCategory('checkout or payment')).toBe('Checkout / payment');
    expect(matchCategory('Payment')).toBe('Checkout / payment');
    expect(matchCategory('change flight')).toBe('Change flight');
    expect(matchCategory('lost bag')).toBe('Baggage');
    expect(matchCategory('other')).toBe('Other');
    expect(matchCategory('weather')).toBeUndefined();
  });

  it('validates a complete ticket', () => {
    expect(
      validateTicket({
        fullName: 'Maya Chen',
        bookingReference: 'FLY-48213',
        email: 'maya.chen@example.com',
        category: 'Checkout / payment',
        description: 'Checkout keeps failing at payment.',
      }),
    ).toEqual({});
  });

  it('flags every missing field', () => {
    const errors = validateTicket({ fullName: '', bookingReference: '', email: '', category: '', description: '' });
    expect(Object.keys(errors).sort()).toEqual(TICKET_FIELDS.map((field) => field.name).sort());
  });
});

describe('voice session config', () => {
  const config = sessionConfig(TICKET_FIELDS, ISSUE_CATEGORIES);

  it('greets as FlyLo-Air support', () => {
    expect(GREETING).toBe('FlyLo-Air support. How can I help?');
  });

  it('keeps replies short and skips the read-back', () => {
    expect(config.instructions).toContain('one or two short, warm sentences');
    expect(config.instructions).toContain('ask for all of them in one short question');
    expect(config.instructions).toContain('do not read them back');
    expect(config.instructions).toContain('press Submit');
    expect(config.instructions).toContain('email them an update');
  });

  it('lists the categories and fields', () => {
    for (const category of ISSUE_CATEGORIES) expect(config.instructions).toContain(category);
    expect(config.tools[0].parameters.properties.name.enum).toEqual(TICKET_FIELDS.map((field) => field.name));
  });

  it('boosts the demo terms in transcription', () => {
    expect(config.audio.input.transcription.keyterms).toEqual(KEYTERMS);
    expect(KEYTERMS).toEqual(['FlyLo', 'FlyLo-Air', 'Maya Chen', 'FLY-48213', 'maya.chen@example.com']);
  });
});
