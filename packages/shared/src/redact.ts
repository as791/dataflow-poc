const SECRET_VALUE = /((?:password|passwd|token|api[_-]?key|secret)["']?\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;&]+)/gi;
const BASIC_AUTH_URL = /([a-z][a-z0-9+.-]*:\/\/[^:\s/@]+:)[^@\s/]+@/gi;
const BEARER = /\b(Bearer)\s+[^\s,;]+/gi;

export function redactSensitiveText(value: unknown): string {
  return String(value ?? '')
    .replace(BASIC_AUTH_URL, '$1[REDACTED]@')
    .replace(BEARER, '$1 [REDACTED]')
    .replace(SECRET_VALUE, '$1[REDACTED]');
}
