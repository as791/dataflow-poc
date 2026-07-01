import { Calendar, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Clock, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const DAY_LABELS = ['Su','Mo','Tu','We','Th','Fr','Sa'];

function pad2(n: number) { return String(n).padStart(2, '0'); }

function parseLocal(v: string) {
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  return { year: +m[1], month: +m[2] - 1, day: +m[3], hour: +m[4], minute: +m[5], second: +m[6] };
}

function makeLocal(y: number, mo: number, d: number, h: number, mi: number, s: number) {
  return `${y}-${pad2(mo + 1)}-${pad2(d)}T${pad2(h)}:${pad2(mi)}:${pad2(s)}`;
}

function Spinner({ label, v, min, max, onChange }: {
  label: string; v: number; min: number; max: number; onChange: (n: number) => void;
}) {
  const wrap = (n: number) => n < min ? max : n > max ? min : n;
  return (
    <div className="flex flex-col items-center gap-0.5">
      <button type="button" tabIndex={-1} aria-label={`Increase ${label}`}
        onClick={() => onChange(wrap(v + 1))}
        className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:text-gray-700
          dark:text-white/30 dark:hover:text-white/80 hover:bg-gray-100 dark:hover:bg-white/[0.07] transition-colors">
        <ChevronUp size={12} />
      </button>
      <input
        type="number" aria-label={label} min={min} max={max} value={pad2(v)}
        className="w-10 rounded-lg border border-gray-200 dark:border-white/[0.1] bg-gray-50 dark:bg-black/20
          text-center text-[13px] font-semibold tabular-nums text-gray-900 dark:text-white/90
          py-1 outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400/30 transition-colors"
        onChange={e => { const n = Number(e.target.value); if (!isNaN(n)) onChange(Math.min(max, Math.max(min, n))); }}
      />
      <button type="button" tabIndex={-1} aria-label={`Decrease ${label}`}
        onClick={() => onChange(wrap(v - 1))}
        className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:text-gray-700
          dark:text-white/30 dark:hover:text-white/80 hover:bg-gray-100 dark:hover:bg-white/[0.07] transition-colors">
        <ChevronDown size={12} />
      </button>
    </div>
  );
}

export interface DateTimePickerProps {
  value: string;              // '' or 'YYYY-MM-DDTHH:MM:SS' (local time)
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}

export function DateTimePicker({ value, onChange, placeholder = 'Select date & time', className = '' }: DateTimePickerProps) {
  const [open, setOpen] = useState(false);
  const [flipRight, setFlipRight] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const parsed = parseLocal(value);
  const now = new Date();

  const [view, setView] = useState({
    year: parsed?.year ?? now.getFullYear(),
    month: parsed?.month ?? now.getMonth(),
  });
  const [sel, setSel] = useState<{ year: number; month: number; day: number } | null>(
    parsed ? { year: parsed.year, month: parsed.month, day: parsed.day } : null,
  );
  const [time, setTime] = useState({
    hour: parsed?.hour ?? 0,
    minute: parsed?.minute ?? 0,
    second: parsed?.second ?? 0,
  });

  // Sync if value changes from outside
  useEffect(() => {
    const p = parseLocal(value);
    if (p) {
      setSel({ year: p.year, month: p.month, day: p.day });
      setTime({ hour: p.hour, minute: p.minute, second: p.second });
      setView({ year: p.year, month: p.month });
    } else {
      setSel(null);
    }
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  // Flip popover to right-anchored when it would overflow viewport right edge
  useEffect(() => {
    if (!open || !containerRef.current) return;
    const { left } = containerRef.current.getBoundingClientRect();
    setFlipRight(left + 280 > window.innerWidth - 12);
  }, [open]);

  const prevMonth = () => setView(v => {
    const d = new Date(v.year, v.month - 1);
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const nextMonth = () => setView(v => {
    const d = new Date(v.year, v.month + 1);
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const calCells = () => {
    const firstDay = new Date(view.year, view.month, 1).getDay();
    const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    return cells;
  };

  const applyAndClose = () => {
    if (!sel) return;
    onChange(makeLocal(sel.year, sel.month, sel.day, time.hour, time.minute, time.second));
    setOpen(false);
  };

  const clear = () => { onChange(''); setSel(null); setOpen(false); };

  const displayLabel = value
    ? new Date(value).toLocaleString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      })
    : '';

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`glass-input flex items-center gap-2 py-1.5 text-[12px] min-w-[188px] text-left ${
          displayLabel ? 'text-gray-800 dark:text-white/85' : 'text-gray-400 dark:text-white/30'
        }`}
      >
        <Calendar size={12} className="flex-none text-gray-400 dark:text-white/30" />
        <span className="flex-1 truncate">{displayLabel || placeholder}</span>
        {value
          ? (
            <span
              role="button"
              tabIndex={-1}
              onMouseDown={e => { e.preventDefault(); e.stopPropagation(); clear(); }}
              className="flex-none text-gray-400 hover:text-gray-600 dark:text-white/30 dark:hover:text-white/60"
            >
              <X size={11} />
            </span>
          )
          : <ChevronDown size={11} className="flex-none text-gray-400 dark:text-white/25" />
        }
      </button>

      {/* Popover */}
      {open && (
        <div className={`absolute top-full z-[200] mt-1.5 w-[272px] rounded-2xl border border-gray-200
          dark:border-white/[0.09] bg-white dark:bg-[#13161f] shadow-2xl dark:shadow-black/60
          ${flipRight ? 'right-0' : 'left-0'}`}>

          {/* Month nav */}
          <div className="flex items-center justify-between px-4 py-3">
            <button type="button" onClick={prevMonth}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200
                dark:border-white/[0.08] text-gray-500 hover:bg-gray-100
                dark:text-white/40 dark:hover:bg-white/[0.06] transition-colors">
              <ChevronLeft size={13} />
            </button>
            <span className="text-[13px] font-semibold text-gray-900 dark:text-white/90">
              {MONTH_NAMES[view.month]} {view.year}
            </span>
            <button type="button" onClick={nextMonth}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200
                dark:border-white/[0.08] text-gray-500 hover:bg-gray-100
                dark:text-white/40 dark:hover:bg-white/[0.06] transition-colors">
              <ChevronRight size={13} />
            </button>
          </div>

          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 px-3 mb-1">
            {DAY_LABELS.map(d => (
              <div key={d} className="text-center text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-white/30">
                {d}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 px-3 pb-1 gap-y-0.5">
            {calCells().map((day, i) => {
              if (!day) return <div key={`blank-${i}`} />;
              const isSel = sel?.year === view.year && sel?.month === view.month && sel?.day === day;
              const isToday = now.getFullYear() === view.year && now.getMonth() === view.month && now.getDate() === day;
              return (
                <button key={day} type="button"
                  onClick={() => setSel({ year: view.year, month: view.month, day })}
                  className={`mx-auto flex h-8 w-8 items-center justify-center rounded-lg text-[12px] font-medium transition-all ${
                    isSel
                      ? 'bg-brand-500 text-white shadow-sm shadow-brand-500/30'
                      : isToday
                      ? 'ring-1 ring-brand-400/60 text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-500/10'
                      : 'text-gray-700 dark:text-white/70 hover:bg-gray-100 dark:hover:bg-white/[0.06]'
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Time pickers */}
          <div className="border-t border-gray-100 dark:border-white/[0.06] mx-3 mt-1 pt-3 pb-1">
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-1.5">
                <Clock size={11} className="text-gray-400 dark:text-white/30" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-white/30">Time</span>
              </div>
              <span className="text-[10px] text-gray-400 dark:text-white/25 truncate max-w-[130px]" title={tz}>{tz}</span>
            </div>
            <div className="flex items-center justify-center gap-3">
              <Spinner label="Hour"   v={time.hour}   min={0} max={23} onChange={h => setTime(t => ({ ...t, hour: h }))} />
              <span className="text-[20px] font-light text-gray-300 dark:text-white/20 leading-none -mt-1">:</span>
              <Spinner label="Minute" v={time.minute} min={0} max={59} onChange={m => setTime(t => ({ ...t, minute: m }))} />
              <span className="text-[20px] font-light text-gray-300 dark:text-white/20 leading-none -mt-1">:</span>
              <Spinner label="Second" v={time.second} min={0} max={59} onChange={s => setTime(t => ({ ...t, second: s }))} />
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 px-4 py-3">
            <button type="button" onClick={clear}
              className="flex-1 glass-btn-ghost text-[12px]">Clear</button>
            <button type="button" onClick={applyAndClose} disabled={!sel}
              className="flex-1 glass-btn-primary text-[12px] disabled:opacity-40">Set</button>
          </div>
        </div>
      )}
    </div>
  );
}
