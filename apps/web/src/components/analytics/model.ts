import type { BucketInterval, ChartType, DashboardDefinition, QuerySpec, SchemaField, WidgetDef } from './types';

export type EditableFilterOp = '=' | '!=' | '>' | '<' | '>=' | '<=' | 'LIKE';
export interface FilterRow { field: string; op: EditableFilterOp; value: string }

export const FILTER_OPS: EditableFilterOp[] = ['=', '!=', '>', '<', '>=', '<=', 'LIKE'];
export const CHART_TYPES: ChartType[] = ['bar', 'line', 'area', 'pie', 'stat', 'table'];
export const BUCKETS: BucketInterval[] = ['minute', '5 minute', '15 minute', 'hour', 'day', 'week'];
export const AGG_OPTIONS: Array<'count' | 'sum' | 'avg' | 'min' | 'max' | 'none'> = ['count', 'sum', 'avg', 'min', 'max', 'none'];

export function chartKeys(widget: WidgetDef) {
  return {
    xKey: widget.spec.bucket ? 'time_bucket' : (widget.spec.groupBy?.[0] ?? widget.spec.select?.[0] ?? ''),
    yKey: widget.spec.aggregate ? 'aggregate_value' : (widget.spec.select?.[1] ?? widget.spec.select?.[0] ?? ''),
  };
}

export function editableFilters(spec?: QuerySpec): FilterRow[] {
  return (spec?.where ?? [])
    .filter(where => where.op !== 'IN')
    .map(where => ({ field: where.field, op: where.op as EditableFilterOp, value: String(where.value) }));
}

export function buildWidgetSpec(input: {
  chartType: ChartType;
  xCol: string;
  yCol: string;
  agg: 'count' | 'sum' | 'avg' | 'min' | 'max' | 'none';
  bucket?: BucketInterval | '';
  fields: SchemaField[];
  filters: FilterRow[];
  editingSpec?: QuerySpec;
}): QuerySpec {
  const fieldType = (name: string) => input.fields.find(field => field.name === name)?.type;
  const inClauses = (input.editingSpec?.where ?? []).filter(where => where.op === 'IN');
  const where = [
    ...inClauses,
    ...input.filters
      .filter(filter => filter.field && filter.value !== '')
      .map(filter => ({
        field: filter.field,
        op: filter.op,
        value: fieldType(filter.field) === 'number' && !Number.isNaN(Number(filter.value)) ? Number(filter.value) : filter.value,
      })),
  ];
  const fn = (input.agg === 'none' ? 'count' : input.agg) as 'count' | 'sum' | 'avg' | 'min' | 'max';
  const base: QuerySpec = input.chartType === 'table'
    ? { select: [input.xCol, ...(input.yCol ? [input.yCol] : [])], limit: 50 }
    : input.chartType === 'stat'
      ? { aggregate: { field: input.yCol, fn }, limit: 1 }
      : input.agg === 'none'
        ? { select: [input.xCol, input.yCol], limit: 50 }
        : input.bucket && input.chartType !== 'pie'
          ? { bucket: input.bucket, aggregate: { field: input.yCol, fn }, limit: 500 }
          : { groupBy: [input.xCol], aggregate: { field: input.yCol, fn }, limit: 50 };
  return where.length ? { ...base, where } : base;
}

export function dashboardDefinition(widgets: WidgetDef[], hours: number): DashboardDefinition {
  return {
    widgets: widgets.map(({ id, layout, type, dataset, title, spec }) => ({ id, layout, type, dataset, title, spec })),
    timeRangeHours: hours,
  };
}

export function layoutChanged(widgets: WidgetDef[], newLayout: Array<{ i: string; x: number; y: number; w: number; h: number }>) {
  return widgets.some(widget => {
    const layout = newLayout.find(next => next.i === widget.id);
    return layout && (
      layout.x !== widget.layout.x ||
      layout.y !== widget.layout.y ||
      layout.w !== widget.layout.w ||
      layout.h !== widget.layout.h
    );
  });
}
