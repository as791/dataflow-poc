export interface MapFieldLineage { outputField: string; inputFields: string[] }

function splitProjectionFields(body: string): string[] {
  const fields: string[] = [];
  let start = 0, depth = 0, quote = '';
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

// Lineage only needs the output-to-input mapping from a safe map projection;
// expression execution is backend-owned in Go.
export function deriveMapFieldLineage(expression: string): MapFieldLineage[] {
  const objectMatch = expression.trim().match(/^\(?\s*\{([\s\S]*)\}\s*\)?$/);
  if (!objectMatch) return [];
  return splitProjectionFields(objectMatch[1]).map(field => {
    const separator = field.indexOf(':');
    if (separator <= 0) throw new Error(`invalid map projection field "${field}"`);
    const outputField = field.slice(0, separator).trim().replace(/^['"]|['"]$/g, '');
    const inputFields = [...new Set(
      [...field.slice(separator + 1).matchAll(/\br\.([A-Za-z_$][A-Za-z0-9_$.]*)/g)]
        .map(match => match[1]),
    )];
    return { outputField, inputFields };
  });
}
