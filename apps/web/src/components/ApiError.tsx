import { AlertTriangle } from 'lucide-react';

export function ApiError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  let display = message;
  const spaceIdx = message.indexOf(' ');
  const body = spaceIdx >= 0 ? message.slice(spaceIdx + 1) : '';
  try { const parsed = JSON.parse(body); if (parsed?.error) display = parsed.error; } catch { /* not JSON */ }
  return (
    <div className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger/90">
      <AlertTriangle size={14} className="flex-none" />
      <span className="flex-1">{display}</span>
      {onRetry && <button className="glass-btn-ghost px-2 py-1 text-[11px]" onClick={onRetry}>Retry</button>}
    </div>
  );
}
