import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import type { WidgetDef } from './types';
import { chartKeys } from './model';

const COLORS = [
  '#818cf8', '#34d399', '#fbbf24', '#f87171', '#60a5fa',
  '#a78bfa', '#fb923c', '#4ade80', '#f472b6', '#38bdf8',
];

const CHART_STYLE = { background: 'transparent' };
const AXIS_STYLE = { fill: 'var(--chart-muted)', fontSize: 11 };
const GRID_STYLE = { stroke: 'var(--chart-grid)' };
const TOOLTIP_STYLE = {
  contentStyle: { background: 'var(--chart-tooltip-bg)', border: '1px solid var(--chart-grid)', borderRadius: 8 },
  labelStyle: { color: 'var(--chart-text)' },
  itemStyle: { color: '#818cf8' },
};
const LEGEND_STYLE = { wrapperStyle: { fontSize: 11, color: 'var(--chart-muted)' } };

export function ChartRenderer({ widget }: { widget: WidgetDef }) {
  const data = widget.data ?? [];
  const { xKey, yKey } = chartKeys(widget);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 dark:text-white/30 text-xs">No data</div>
    );
  }

  if (widget.type === 'table') {
    const cols = Object.keys(data[0] ?? {});
    return (
      <div className="overflow-auto h-full">
        <table className="w-full text-xs text-gray-700 dark:text-white/80">
          <thead>
            <tr>
              {cols.map(c => (
                <th key={c} className="text-left py-1 px-2 text-gray-500 dark:text-white/50 border-b border-gray-200 dark:border-white/10 sticky top-0 bg-gray-50 dark:bg-white/5">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={i} className="border-b border-gray-100 hover:bg-gray-50 dark:border-white/5 dark:hover:bg-white/5">
                {cols.map(c => (
                  <td key={c} className="py-1 px-2 truncate max-w-[120px]">{String(row[c] ?? '')}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (widget.type === 'stat') {
    const value = data[0]?.[yKey];
    const num = typeof value === 'number' ? value : Number(value);
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-4xl font-semibold text-gray-800 dark:text-white/90">
          {Number.isFinite(num) ? num.toLocaleString() : String(value ?? '—')}
        </span>
      </div>
    );
  }

  if (widget.type === 'area') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} style={CHART_STYLE}>
          <CartesianGrid {...GRID_STYLE} />
          <XAxis dataKey={xKey} tick={AXIS_STYLE} axisLine={false} tickLine={false} />
          <YAxis tick={AXIS_STYLE} axisLine={false} tickLine={false} />
          <Tooltip {...TOOLTIP_STYLE} />
          <Legend {...LEGEND_STYLE} />
          <Area type="monotone" dataKey={yKey} stroke={COLORS[0]} fill={COLORS[0]} fillOpacity={0.25} strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  if (widget.type === 'pie') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart style={CHART_STYLE}>
          <Pie data={data} dataKey={yKey} nameKey={xKey} cx="50%" cy="50%" outerRadius="70%" label>
            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} fillOpacity={0.85} />)}
          </Pie>
          <Tooltip {...TOOLTIP_STYLE} />
          <Legend {...LEGEND_STYLE} />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (widget.type === 'line') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} style={CHART_STYLE}>
          <CartesianGrid {...GRID_STYLE} />
          <XAxis dataKey={xKey} tick={AXIS_STYLE} axisLine={false} tickLine={false} />
          <YAxis tick={AXIS_STYLE} axisLine={false} tickLine={false} />
          <Tooltip {...TOOLTIP_STYLE} />
          <Legend {...LEGEND_STYLE} />
          <Line type="monotone" dataKey={yKey} stroke={COLORS[0]} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  // bar (default)
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} style={CHART_STYLE}>
        <CartesianGrid {...GRID_STYLE} />
        <XAxis dataKey={xKey} tick={AXIS_STYLE} axisLine={false} tickLine={false} />
        <YAxis tick={AXIS_STYLE} axisLine={false} tickLine={false} />
        <Tooltip {...TOOLTIP_STYLE} />
        <Legend {...LEGEND_STYLE} />
        <Bar dataKey={yKey} fill={COLORS[0]} fillOpacity={0.85} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
