export function AtomMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 6.5h3.2c3.8 0 4.5 5.5 8.4 5.5H21" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M3 12h4.2c3.2 0 4 5.5 7.4 5.5H21" stroke="rgba(255,255,255,.72)" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M3 17.5h3.2c3.8 0 4.5-11 8.4-11H21" stroke="rgba(255,255,255,.44)" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="21" cy="6.5" r="1.5" fill="#fff" />
      <circle cx="21" cy="12" r="1.5" fill="#fff" />
      <circle cx="21" cy="17.5" r="1.5" fill="#fff" />
    </svg>
  );
}
