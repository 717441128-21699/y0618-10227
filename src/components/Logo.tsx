export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="16" cy="16" r="14.5" stroke="#222b3c" strokeWidth="1" />
      <circle cx="16" cy="16" r="9.5" stroke="#2dd4bf" strokeWidth="1" opacity="0.35" />
      <g stroke="#2dd4bf" strokeWidth="1.4" strokeLinecap="round">
        <path d="M16 3.5 L16 9.5" />
        <path d="M16 22.5 L16 28.5" />
        <path d="M3.5 16 L9.5 16" />
        <path d="M22.5 16 L28.5 16" />
      </g>
      <circle cx="16" cy="16" r="4.2" fill="#2dd4bf" opacity="0.18" />
      <circle cx="16" cy="16" r="2.6" fill="#2dd4bf" />
      <circle cx="16" cy="16" r="2.6" stroke="#070a10" strokeWidth="0.6" />
      <path d="M16 6 L17.2 9.5 L14.8 9.5 Z" fill="#fbbf24" opacity="0.9" />
    </svg>
  );
}
