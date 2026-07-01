/**
 * Constrained expression evaluator for pipeline transforms and edge conditions.
 *
 * Supported predicate syntax:
 *   r.status === 'open'
 *   r.amount >= 100 && r.active === true
 *   records.length > 0
 *
 * Supported map syntax:
 *   ({ id: r.id, subject: r.subject, active: true })
 *
 * Function calls, assignments, computed properties, constructors, prototypes,
 * and arbitrary JavaScript are intentionally unsupported.
 */

type Token =
  | { kind: 'value'; value: unknown }
  | { kind: 'path'; value: string }
  | { kind: 'func'; value: keyof typeof FUNCTIONS }
  | { kind: 'op'; value: string }
  | { kind: 'paren'; value: '(' | ')' }
  | { kind: 'comma'; value: ',' };

const OPERATORS = ['===', '!==', '>=', '<=', '&&', '||', '==', '!=', '>', '<', '!', '+', '-', '*', '/', '%'];
const FUNCTIONS = {
  abs: (value: unknown) => Math.abs(Number(value)),
  round: (value: unknown, digits: unknown = 0) => {
    const factor = 10 ** Math.max(0, Math.min(10, Number(digits) || 0));
    return Math.round(Number(value) * factor) / factor;
  },
  lower: (value: unknown) => String(value ?? '').toLowerCase(),
  upper: (value: unknown) => String(value ?? '').toUpperCase(),
  string: (value: unknown) => String(value ?? ''),
  number: (value: unknown) => Number(value),
  length: (value: unknown) => Array.isArray(value) || typeof value === 'string'
    ? value.length : value && typeof value === 'object' ? Object.keys(value).length : 0,
  coalesce: (...values: unknown[]) => values.find(value => value !== null && value !== undefined),
  concat: (...values: unknown[]) => values.map(value => String(value ?? '')).join(''),
};

function tokenize(expression: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expression.length) {
    const ch = expression[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === '(' || ch === ')') {
      tokens.push({ kind: 'paren', value: ch }); i++; continue;
    }
    if (ch === ',') { tokens.push({ kind: 'comma', value: ',' }); i++; continue; }
    const op = OPERATORS.find(candidate => expression.startsWith(candidate, i));
    if (op) {
      tokens.push({ kind: 'op', value: op }); i += op.length; continue;
    }
    if (ch === "'" || ch === '"') {
      const quote = ch;
      let value = '';
      i++;
      while (i < expression.length && expression[i] !== quote) {
        if (expression[i] === '\\') {
          i++;
          if (i >= expression.length) throw new Error('unterminated string escape');
          const escaped = expression[i];
          value += escaped === 'n' ? '\n' : escaped === 't' ? '\t' : escaped;
        } else {
          value += expression[i];
        }
        i++;
      }
      if (expression[i] !== quote) throw new Error('unterminated string literal');
      i++;
      tokens.push({ kind: 'value', value });
      continue;
    }
    const number = expression.slice(i).match(/^(?:\d+\.?\d*|\.\d+)/)?.[0];
    if (number) {
      tokens.push({ kind: 'value', value: Number(number) });
      i += number.length;
      continue;
    }
    const identifier = expression.slice(i).match(/^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*/)?.[0];
    if (identifier) {
      if (identifier === 'true') tokens.push({ kind: 'value', value: true });
      else if (identifier === 'false') tokens.push({ kind: 'value', value: false });
      else if (identifier === 'null') tokens.push({ kind: 'value', value: null });
      else if (identifier === 'undefined') tokens.push({ kind: 'value', value: undefined });
      else if (Object.prototype.hasOwnProperty.call(FUNCTIONS, identifier) && expression.slice(i + identifier.length).trimStart().startsWith('(')) {
        tokens.push({ kind: 'func', value: identifier as keyof typeof FUNCTIONS });
      }
      else {
        if (!identifier.startsWith('r.') && identifier !== 'r' &&
            !identifier.startsWith('records.') && identifier !== 'records') {
          throw new Error(`unsupported identifier "${identifier}"`);
        }
        if (identifier.includes('__proto__') || identifier.includes('prototype') || identifier.includes('constructor')) {
          throw new Error('unsafe property access');
        }
        tokens.push({ kind: 'path', value: identifier });
      }
      i += identifier.length;
      continue;
    }
    throw new Error(`unsupported token near "${expression.slice(i, i + 12)}"`);
  }
  return tokens;
}

function resolvePath(path: string, context: Record<string, unknown>): unknown {
  const parts = path.split('.');
  let value: any = context[parts.shift()!];
  for (const part of parts) value = value?.[part];
  return value;
}

function evaluateTokens(tokens: Token[], context: Record<string, unknown>): unknown {
  let index = 0;

  const primary = (): unknown => {
    const token = tokens[index++];
    if (!token) throw new Error('expected value');
    if (token.kind === 'value') return token.value;
    if (token.kind === 'path') return resolvePath(token.value, context);
    if (token.kind === 'func') {
      const open = tokens[index++];
      if (open?.kind !== 'paren' || open.value !== '(') throw new Error('expected function arguments');
      const args: unknown[] = [];
      if (!(tokens[index]?.kind === 'paren' && tokens[index].value === ')')) {
        while (true) {
          args.push(logicalOr());
          if (tokens[index]?.kind !== 'comma') break;
          index++;
        }
      }
      const close = tokens[index++];
      if (close?.kind !== 'paren' || close.value !== ')') throw new Error('missing closing parenthesis');
      return (FUNCTIONS[token.value] as (...values: unknown[]) => unknown)(...args);
    }
    if (token.kind === 'paren' && token.value === '(') {
      const value = logicalOr();
      const close = tokens[index++];
      if (close?.kind !== 'paren' || close.value !== ')') throw new Error('missing closing parenthesis');
      return value;
    }
    throw new Error('expected value');
  };

  const unary = (): unknown => {
    if (tokens[index]?.kind === 'op' && tokens[index].value === '!') {
      index++;
      return !unary();
    }
    if (tokens[index]?.kind === 'op' && tokens[index].value === '-') {
      index++;
      return -Number(unary());
    }
    return primary();
  };

  const multiplicative = (): unknown => {
    let value = unary();
    while (tokens[index]?.kind === 'op' && ['*', '/', '%'].includes(String(tokens[index].value))) {
      const operator = String(tokens[index++].value);
      const right = Number(unary());
      value = operator === '*' ? Number(value) * right : operator === '/' ? Number(value) / right : Number(value) % right;
    }
    return value;
  };

  const additive = (): unknown => {
    let value = multiplicative();
    while (tokens[index]?.kind === 'op' && ['+', '-'].includes(String(tokens[index].value))) {
      const operator = String(tokens[index++].value);
      const right = multiplicative();
      value = operator === '+' ? Number(value) + Number(right) : Number(value) - Number(right);
    }
    return value;
  };

  const comparison = (): unknown => {
    let left = additive();
    const token = tokens[index];
    if (token?.kind !== 'op' || !['===', '!==', '==', '!=', '>', '<', '>=', '<='].includes(token.value)) {
      return left;
    }
    index++;
    const right = additive();
    switch (token.value) {
      case '===': return left === right;
      case '!==': return left !== right;
      case '==': return left == right; // Legacy pipeline compatibility.
      case '!=': return left != right;
      case '>': return (left as any) > (right as any);
      case '<': return (left as any) < (right as any);
      case '>=': return (left as any) >= (right as any);
      case '<=': return (left as any) <= (right as any);
    }
  };

  const logicalAnd = (): unknown => {
    let value = comparison();
    while (tokens[index]?.kind === 'op' && tokens[index].value === '&&') {
      index++;
      const right = comparison();
      value = Boolean(value) && Boolean(right);
    }
    return value;
  };

  const logicalOr = (): unknown => {
    let value = logicalAnd();
    while (tokens[index]?.kind === 'op' && tokens[index].value === '||') {
      index++;
      const right = logicalAnd();
      value = Boolean(value) || Boolean(right);
    }
    return value;
  };

  const result = logicalOr();
  if (index !== tokens.length) throw new Error('unexpected trailing expression');
  return result;
}

export function evaluatePredicate(
  expression: string,
  context: { r?: unknown; records?: unknown[] },
): boolean {
  if (!expression?.trim()) throw new Error('predicate is empty');
  return Boolean(evaluateTokens(tokenize(expression), context));
}

function splitProjectionFields(body: string): string[] {
  const fields: string[] = [];
  let start = 0;
  let quote = '';
  let depth = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = '';
    } else if (ch === "'" || ch === '"') quote = ch;
    else if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) {
      fields.push(body.slice(start, i).trim());
      start = i + 1;
    }
  }
  fields.push(body.slice(start).trim());
  return fields.filter(Boolean);
}

export function evaluateMapExpression(expression: string, record: unknown): unknown {
  const trimmed = expression.trim();
  const objectMatch = trimmed.match(/^\(?\s*\{([\s\S]*)\}\s*\)?$/);
  if (!objectMatch) return evaluateTokens(tokenize(trimmed), { r: record });

  const output: Record<string, unknown> = {};
  for (const field of splitProjectionFields(objectMatch[1])) {
    const separator = field.indexOf(':');
    if (separator <= 0) throw new Error(`invalid map projection field "${field}"`);
    const rawKey = field.slice(0, separator).trim();
    const key = rawKey.replace(/^['"]|['"]$/g, '');
    if (!/^[A-Za-z_$][A-Za-z0-9_$-]*$/.test(key)) {
      throw new Error(`invalid projection key "${key}"`);
    }
    output[key] = evaluateTokens(tokenize(field.slice(separator + 1).trim()), { r: record });
  }
  return output;
}

export function evaluateFormulaExpression(expression: string, record: unknown): unknown {
  if (!expression?.trim()) throw new Error('formula is empty');
  return evaluateTokens(tokenize(expression), { r: record });
}

export interface MapFieldLineage { outputField: string; inputFields: string[] }

export function deriveMapFieldLineage(expression: string): MapFieldLineage[] {
  const objectMatch = expression.trim().match(/^\(?\s*\{([\s\S]*)\}\s*\)?$/);
  if (!objectMatch) return [];
  return splitProjectionFields(objectMatch[1]).map(field => {
    const separator = field.indexOf(':');
    if (separator <= 0) throw new Error(`invalid map projection field "${field}"`);
    const outputField = field.slice(0, separator).trim().replace(/^['"]|['"]$/g, '');
    const inputFields = [...new Set(tokenize(field.slice(separator + 1).trim())
      .filter((token): token is Extract<Token, { kind: 'path' }> => token.kind === 'path' && token.value.startsWith('r.'))
      .map(token => token.value.slice(2)))];
    return { outputField, inputFields };
  });
}

export function validateSafeExpression(expression: string, mode: 'predicate' | 'map' | 'formula'): void {
  if (mode === 'predicate') {
    tokenize(expression);
    return;
  }
  if (mode === 'formula') {
    evaluateFormulaExpression(expression, {});
    return;
  }
  evaluateMapExpression(expression, {});
}
