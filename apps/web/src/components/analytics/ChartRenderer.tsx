import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import type { WidgetDef } from './types';

const COLORS = [
  '#818cf8', '#34d399', '#fbbf24', '#f87171', '#60a5fa',
  '#a78bfa', '#fb923c', '#4ade80', '#f472b6', '#38bdf8',
];

const CHART_STYLE = { background: 'transparent' };
const AXIS_STYLE = { fill: 'rgba(255,255,255,0.5)', fontSize: 11 };
const GRID_STYLE = { stroke: 'rgba(255,255,255,0.08)' };
const TOOLTIP_STYLE = {
  contentStyle: { background: 'rgba(15,12,41,0.9)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8 },
  labelStyle: { color: 'rgba(255,255,255,0.7)' },
  itemStyle: { color: '#818cf8' },
};
const LEGEND_STYLE = { wrapperStyle: { fontSize: 11, color: 'rgba(255,255,255,0.5)' } };

export function ChartRenderer({ widget }: { widget: WidgetDef }) {
  const data = widget.data ?? [];
  const xKey = widget.spec.x_column;
  const yKey = widget.spec.y_column;

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-white/30 text-xs">No data</div>
    );
  }

  if (widget.type === 'table') {
    const cols = Object.keys(data[0] ?? {});
    return (
      <div className="overflow-auto h-full">
        <table className="w-full text-xs text-white/80">
          <thead>
            <tr>
              {cols.map(c => (
                <th key={c} className="text-left py-1 px-2 text-white/50 border-b border-white/10 sticky top-0 bg-white/5">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={i} className="border-b border-white/5 hover:bg-white/5">
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
