export interface Dataset {
  collection: string;
  row_count: number;
}

export interface SchemaField {
  name: string;
  type: string;
}

export interface QuerySpec {
  select?: string[];
  where?: Array<{ field: string; op: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'LIKE' | 'IN'; value: unknown }>;
  groupBy?: string[];
  aggregate?: { field: string; fn: 'count' | 'sum' | 'avg' | 'min' | 'max' };
  orderBy?: { field: string; dir: 'ASC' | 'DESC' };
  limit?: number;
}

export interface TimeRange {
  from: string;
  to: string;
}

export function timeRangeFor(hours: number, now = new Date()): TimeRange {
  return { from: new Date(now.getTime() - hours * 3_600_000).toISOString(), to: now.toISOString() };
}

export type ChartType = 'bar' | 'line' | 'pie' | 'table';

export interface WidgetDef {
  id: string;
  layout: { x: number; y: number; w: number; h: number };
  type: ChartType;
  dataset: string;
  title: string;
  spec: QuerySpec;
  data?: any[];
}

export interface DashboardDefinition {
  widgets: WidgetDef[];
  timeRange?: TimeRange;
}

export interface Dashboard {
  id: string;
  name: string;
  definition: DashboardDefinition;
}
