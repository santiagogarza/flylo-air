import { applyNormalizer } from './normalizers';
import type { ScenarioConfig, ScenarioField } from './types';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeField(field: ScenarioField, raw: string): string {
  return applyNormalizer(field.normalize, raw ?? '');
}

export type InterpretedField = {
  value: string;
  error?: string;
};

/** Normalizes one raw value and, when it still fails, returns the inline format hint. */
export function interpretFieldInput(field: ScenarioField, raw: string, categories: readonly string[]): InterpretedField {
  const value = normalizeField(field, raw);
  if (!value) return { value: '' };
  const error = messageFor(field, value, categories);
  return error ? { value, error } : { value };
}

export function validateScenario(scenario: ScenarioConfig, raw: Record<string, string>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of scenario.fields) {
    const value = normalizeField(field, raw[field.key] ?? '');
    const error = messageFor(field, value, scenario.categories);
    if (error) errors[field.key] = error;
  }
  return errors;
}

export function cleanScenarioFields(scenario: ScenarioConfig, raw: Record<string, string>): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const field of scenario.fields) {
    fields[field.key] = normalizeField(field, raw[field.key] ?? '');
  }
  return fields;
}

export function scenarioCategory(scenario: ScenarioConfig, fields: Record<string, string>): string {
  return fields[scenario.categoryKey] ?? '';
}

export function scenarioDescription(scenario: ScenarioConfig, fields: Record<string, string>): string {
  if (scenario.describe) return scenario.describe(fields);
  return scenario.fields.map((field) => `${field.label}: ${fields[field.key] ?? ''}`).join('\n');
}

export function scenarioSummary(scenario: ScenarioConfig, fields: Record<string, string>, category: string): string {
  const who = fields.fullName?.trim() || fields.guestName?.trim() || 'A caller';
  const reason = (fields[scenario.summaryKey] ?? '').replace(/\s+/g, ' ').trim();
  const short = reason.length > 160 ? `${reason.slice(0, 157).trimEnd()}…` : reason;
  const ref = scenario.referenceKey ? fields[scenario.referenceKey] : '';
  const refPart = ref ? ` (${ref})` : '';
  return `${category} request from ${who}${refPart}: ${short}`;
}

export function matchScenarioCategory(
  value: string,
  categories: readonly string[],
  aliases?: Record<string, readonly string[]>,
): string | undefined {
  const key = simplify(value);
  if (!key) return undefined;
  const exact = categories.find((category) => simplify(category) === key);
  if (exact) return exact;
  if (aliases) {
    for (const category of categories) {
      const names = aliases[category] ?? [];
      if (names.some((alias) => simplify(alias) === key)) return category;
    }
    const included = categories.filter((category) =>
      (aliases[category] ?? []).some((alias) => simplify(alias).length >= 5 && key.includes(simplify(alias))),
    );
    if (included.length === 1) return included[0];
  }
  const contained = categories.filter((category) => {
    const simple = simplify(category);
    return simple.length >= 5 && (key.includes(simple) || simple.includes(key));
  });
  if (contained.length === 1) return contained[0];
  return undefined;
}

/** The limit error for a value longer than the field allows, so the form can show it while typing. */
export function overLimitMessage(field: ScenarioField, value: string): string | undefined {
  if (!field.maxLength || value.length <= field.maxLength) return undefined;
  return field.messages?.maxLength ?? `Use ${field.maxLength.toLocaleString('en-US')} characters or fewer.`;
}

function messageFor(field: ScenarioField, value: string, categories: readonly string[]): string | undefined {
  if (!value) {
    if (!field.required) return undefined;
    return field.messages?.required ?? `Enter ${field.label.toLowerCase()}.`;
  }
  const limit = overLimitMessage(field, value);
  if (limit) return limit;
  if (field.minLength && value.length < field.minLength) {
    return field.messages?.minLength ?? `Use at least ${field.minLength} characters.`;
  }
  if (field.type === 'email' && !EMAIL_PATTERN.test(value)) {
    return field.messages?.invalid ?? 'Enter an email like name@example.com.';
  }
  if (field.type === 'select') {
    const options = field.options ?? categories;
    if (!options.includes(value)) return field.messages?.invalid ?? `Choose a ${field.label.toLowerCase()}.`;
  }
  if (field.pattern && !patternTest(field.pattern, value)) {
    if (field.messages?.pattern) return field.messages.pattern;
    if (field.example) return `Enter a value like ${field.example}.`;
    return `Check the format of ${field.label.toLowerCase()}.`;
  }
  return undefined;
}

function patternTest(source: string, value: string): boolean {
  try {
    return new RegExp(source).test(value);
  } catch {
    return true;
  }
}

function simplify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}
