export function AtomMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="5" width="5" height="14" rx="2.2" fill="#efc17e" />
      <rect x="9.5" y="5" width="5" height="14" rx="2.2" fill="#6c5ce7" />
      <rect x="16" y="5" width="5" height="14" rx="2.2" fill="#e58a17" />
    </svg>
  );
}
