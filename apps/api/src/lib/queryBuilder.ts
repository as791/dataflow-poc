/**
 * Safe ClickHouse query builder for the Analytics API.
 *
 * Security invariants:
 *  - tenant_id is ALWAYS injected server-side as the first named parameter.
 *  - Field names are validated against the discovered schema whitelist.
 *  - Operator values are validated against ALLOWED_OPS.
 *  - Aggregate function names are validated against ALLOWED_FNS.
 *  - All user-supplied values are passed as named ClickHouse query params —
 *    never interpolated into the SQL string.
 */

export const ALLOWED_OPS = ['=', '!=', '>', '<', '>=', '<=', 'LIKE', 'IN'] as const;
export const ALLOWED_FNS = ['count', 'sum', 'avg', 'min', 'max'] as const;

type AllowedOp = typeof ALLOWED_OPS[number];
type AllowedFn = typeof ALLOWED_FNS[number];

export interface QuerySpec {
  /** Name of the sink collection (maps to `collection` column in sink_records). */
  dataset: string;
  /** Columns to SELECT from the parsed record JSON. */
  select?: string[];
  /** WHERE clauses applied to the parsed record. */
  where?: Array<{ field: string; op: string; value: unknown }>;
  /** GROUP BY columns. */
  groupBy?: string[];
  /** Single aggregate expression, e.g. { field: 'amount', fn: 'sum' }. */
  aggregate?: { field: string; fn: string };
  /** ORDER BY clause. */
  orderBy?: { field: string; dir: 'ASC' | 'DESC' };
  /** Row limit (default 1000, max 10000). */
  limit?: number;
}

export interface SchemaColumn {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date';
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function validateField(field: string, validFields: Set<string>): void {
  if (!validFields.has(field)) {
    throw new Error(`Field "${field}" is not in the dataset schema`);
  }
}

function validateOp(op: string): AllowedOp {
  if (!(ALLOWED_OPS as readonly string[]).includes(op)) {
    throw new Error(
      `Operator "${op}" is not allowed. Allowed: ${ALLOWED_OPS.join(', ')}`,
    );
  }
  return op as AllowedOp;
}

function validateFn(fn: string): AllowedFn {
  if (!(ALLOWED_FNS as readonly string[]).includes(fn)) {
    throw new Error(
      `Aggregate function "${fn}" is not allowed. Allowed: ${ALLOWED_FNS.join(', ')}`,
    );
  }
  return fn as AllowedFn;
}

// In ClickHouse we store the full JSON record as a String column called
// `record`. We expose sub-fields by extracting them with JSONExtractRaw /
// JSONExtractString / JSONExtractFloat. For the purposes of this builder we
// use JSONExtractRaw which works for all types and keeps values comparable.
function jsonField(col: string): string {
  // Prevent SQL injection in the column name: only allow word chars + dots.
  if (!/^[\w.]+$/.test(col)) {
    throw new Error(`Invalid column name "${col}"`);
  }
  return `JSONExtractRaw(record, '${col}')`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a parameterised ClickHouse SQL query + params map.
 *
 * @param tenantId - Injected server-side; never from client input.
 * @param schema   - Column definitions discovered from /schema endpoint.
 * @param spec     - Query specification from the client.
 */
export function buildQuery(
  tenantId: string,
  schema: SchemaColumn[],
  spec: QuerySpec,
): { sql: string; params: Record<string, unknown> } {
  const validFields = new Set(schema.map((c) => c.name));
  const params: Record<string, unknown> = {
    tenant_id: tenantId,
    collection: spec.dataset,
  };
  let paramIndex = 0;

  // Helper to add a named param and return its placeholder.
  function addParam(value: unknown): string {
    const key = `p${++paramIndex}`;
    params[key] = value;
    return `{${key}:String}`;
  }

  // ── SELECT ────────────────────────────────────────────────────────────
  const selectParts: string[] = [];

  if (spec.select && spec.select.length > 0) {
    for (const col of spec.select) {
      validateField(col, validFields);
      selectParts.push(`${jsonField(col)} AS \`${col}\``);
    }
  }

  if (spec.groupBy && spec.groupBy.length > 0) {
    for (const col of spec.groupBy) {
      validateField(col, validFields);
      // Only add if not already in select
      if (!spec.select?.includes(col)) {
        selectParts.push(`${jsonField(col)} AS \`${col}\``);
      }
    }
  }

  if (spec.aggregate) {
    validateField(spec.aggregate.field, validFields);
    const fn = validateFn(spec.aggregate.fn);
    selectParts.push(`${fn}(${jsonField(spec.aggregate.field)}) AS aggregate_value`);
  }

  // If nothing was specified just select the raw record.
  if (selectParts.length === 0) {
    selectParts.push('record');
  }

  // ── WHERE ─────────────────────────────────────────────────────────────
  // tenant_id and collection are always first — never omitted.
  const whereParts: string[] = [
    `tenant_id = {tenant_id:UUID}`,
    `collection = {collection:String}`,
  ];

  if (spec.where && spec.where.length > 0) {
    for (const clause of spec.where) {
      validateField(clause.field, validFields);
      const op = validateOp(clause.op);

      if (op === 'IN') {
        // IN operator: value must be an array.
        if (!Array.isArray(clause.value)) {
          throw new Error(`Value for IN operator on field "${clause.field}" must be an array`);
        }
        const placeholders = (clause.value as unknown[]).map((v) => addParam(v));
        whereParts.push(`${jsonField(clause.field)} IN (${placeholders.join(', ')})`);
      } else {
        const placeholder = addParam(clause.value);
        whereParts.push(`${jsonField(clause.field)} ${op} ${placeholder}`);
      }
    }
  }

  // ── GROUP BY ──────────────────────────────────────────────────────────
  let groupByClause = '';
  if (spec.groupBy && spec.groupBy.length > 0) {
    const groupParts = spec.groupBy.map((col) => {
      validateField(col, validFields);
      return jsonField(col);
    });
    groupByClause = `GROUP BY ${groupParts.join(', ')}`;
  }

  // ── ORDER BY ──────────────────────────────────────────────────────────
  let orderByClause = '';
  if (spec.orderBy) {
    const dir = spec.orderBy.dir === 'DESC' ? 'DESC' : 'ASC';
    const col = spec.orderBy.field;
    if (col === 'aggregate_value') {
      // Allow ordering by the aggregate alias directly
      orderByClause = `ORDER BY aggregate_value ${dir}`;
    } else {
      validateField(col, validFields);
      orderByClause = `ORDER BY ${jsonField(col)} ${dir}`;
    }
  }

  // ── LIMIT ─────────────────────────────────────────────────────────────
  const rawLimit = typeof spec.limit === 'number' ? spec.limit : 1000;
  const limit = Math.min(Math.max(1, rawLimit), 10000);

  // ── ASSEMBLE ──────────────────────────────────────────────────────────
  const sql = [
    `SELECT ${selectParts.join(', ')}`,
    `FROM sink_records`,
    `WHERE ${whereParts.join(' AND ')}`,
    groupByClause,
    orderByClause,
    `LIMIT ${limit}`,
  ]
    .filter(Boolean)
    .join('\n');

  return { sql, params };
}

/**
 * Infer a schema from a sample of record rows.
 *
 * Inspects up to 100 rows, unions all keys, and picks the most specific type
 * observed across rows for each key.
 */
export function inferSchema(rows: Record<string, unknown>[]): SchemaColumn[] {
  const sample = rows.slice(0, 100);
  // key → set of observed types
  const typeSets: Map<string, Set<string>> = new Map();

  for (const row of sample) {
    for (const [key, value] of Object.entries(row)) {
      if (!typeSets.has(key)) typeSets.set(key, new Set());
      const observed = typeSets.get(key)!;

      if (value === null || value === undefined) {
        // null doesn't tell us type; skip
        continue;
      }
      if (typeof value === 'number') {
        observed.add('number');
      } else if (typeof value === 'boolean') {
        observed.add('boolean');
      } else if (typeof value === 'string') {
        // Heuristic: ISO date strings
        if (/^\d{4}-\d{2}-\d{2}(T|$)/.test(value)) {
          observed.add('date');
        } else {
          observed.add('string');
        }
      } else if (typeof value === 'object') {
        // Objects/arrays → string for display
        observed.add('string');
      } else {
        observed.add('string');
      }
    }
  }

  const columns: SchemaColumn[] = [];
  for (const [name, types] of typeSets.entries()) {
    // Priority: number > boolean > date > string (most specific wins)
    let type: SchemaColumn['type'] = 'string';
    if (types.has('number')) type = 'number';
    else if (types.has('boolean')) type = 'boolean';
    else if (types.has('date')) type = 'date';
    columns.push({ name, type });
  }

  // Stable alphabetical order for reproducibility
  columns.sort((a, b) => a.name.localeCompare(b.name));
  return columns;
}
