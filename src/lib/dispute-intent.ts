/**
 * Detects a caller claiming that a debt, fee, balance, charge, or payment record is wrong, in English or Spanish,
 * whether or not they use the word "dispute". Plain hardship wording ("my balance is high", "I owe more than I
 * expected") is not a claim and does not match.
 */

const SUBJECT = '(?:this|that|the|my|your|our|a|an)?\\s*(?:late\\s+|monthly\\s+)?';
const THING_EN = '(?:balance|amount|fee|fees|charge|charges|payment|payments|record|records|statement|bill|interest|loan|debt|account)';
const WRONG_EN = '(?:wrong|incorrect|incorrectly|inaccurate|not\\s+right|not\\s+correct|a\\s+mistake|mistaken|in\\s+error|an\\s+error|false|bogus)';
const THING_ES = '(?:saldo|monto|cantidad|cargo|cargos|cobro|cobros|pago|pagos|registro|registros|estado\\s+de\\s+cuenta|factura|interes|intereses|prestamo|deuda|cuenta)';
const WRONG_ES = '(?:incorrecto|incorrecta|erroneo|erronea|equivocado|equivocada|mal|indebido|indebida|falso|falsa|un\\s+error)';

const PATTERNS: RegExp[] = [
  /\bdisput(?:e|es|ed|ing)\b/,
  /\b(?:i|we)\s+(?:do\s*not|don'?t|dont|did\s*not|didn'?t)\s+owe\s+(?:this|that|it|any|anything|you|them|the)\b/,
  /\bi\s+owe\s+(?:nothing|none)\b/,
  /\b(?:this|that|it)\s+(?:is\s*not|isn'?t|is\s+not\s+even|was\s*not|wasn'?t)\s+(?:even\s+)?(?:my|our|mine)\b/,
  /\bnot\s+my\s+(?:loan|debt|account|balance|bill|car|vehicle)\b/,
  /\b(?:charged|billed|overcharged)\s+(?:me\s+)?(?:wrong|incorrectly|twice|in\s+error|by\s+mistake|too\s+much|for\s+something)\b/,
  /\b(?:wrong|incorrect|inaccurate|bogus|false|erroneous)\s+(?:late\s+)?(?:balance|amount|fee|fees|charge|charges|payment|record|records|statement|bill|interest)\b/,
  new RegExp(`\\b${THING_EN}s?\\s+(?:is|are|was|were|looks?|seems?|shows?)\\s+(?:completely\\s+|totally\\s+|just\\s+|clearly\\s+)?${WRONG_EN}\\b`),
  new RegExp(`\\b${SUBJECT}${THING_EN}\\s+(?:is\\s*not|isn'?t|are\\s*not|aren'?t)\\s+(?:right|correct|accurate)\\b`),
  /\b(?:never|did\s*not|didn'?t|do\s*not|don'?t)\s+(?:ever\s+)?(?:authorized?|authorise[ds]?|agree\s+to|agreed\s+to|sign\s+for|signed\s+for)\b/,
  /\bunauthori[sz]ed\s+(?:charge|charges|payment|payments|withdrawal|debit|debits|transaction)\b/,
  /\bidentity\s+theft\b|\bfraudulent\b/,
  /\bdebo\s+(?:esto|eso|nada|este|ese|esta|esa)\b/,
  /\bno\s+debo\b/,
  /\bno\s+le\s+debo\b/,
  /\b(?:este|esta|ese|esa|eso|esto)\s+no\s+es\s+(?:mi|mio|mia)\b/,
  /\bno\s+es\s+(?:mi|mio)\s+(?:prestamo|deuda|cuenta|saldo|carro|auto|vehiculo)\b/,
  new RegExp(`\\b${THING_ES}\\s+(?:es|son|esta|estan|fue|fueron)?\\s*${WRONG_ES}\\b`),
  new RegExp(`\\b(?:cobro|cargo|saldo|monto|registro|pago)\\s+(?:incorrecto|erroneo|equivocado|indebido)\\b`),
  /\b(?:nunca|jamas)\s+autorice\b/,
  /\bno\s+autorice\b/,
  /\bdisputo\b|\bdisputa\b|\bdisputar\b|\bimpugno\b/,
  /\bme\s+(?:cobraron|cobro|facturaron)\s+(?:mal|de\s+mas|dos\s+veces|por\s+error)\b/,
];

function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc`]/g, "'")
    .replace(/\s+/g, ' ');
}

export function claimsDispute(text: string): boolean {
  const hay = fold(text);
  return PATTERNS.some((pattern) => pattern.test(hay));
}
