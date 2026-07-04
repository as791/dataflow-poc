export function AtomMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <ellipse cx="12" cy="12" rx="9.5" ry="4" stroke="rgba(255,255,255,.85)" strokeWidth="1.4" transform="rotate(-28 12 12)" />
      <ellipse cx="12" cy="12" rx="9.5" ry="4" stroke="rgba(255,255,255,.55)" strokeWidth="1.4" transform="rotate(28 12 12)" />
      <circle cx="10.6" cy="12.6" r="2.1" fill="#fff" />
      <circle cx="13.5" cy="11.2" r="2.1" fill="rgba(255,255,255,.65)" />
    </svg>
  );
}
