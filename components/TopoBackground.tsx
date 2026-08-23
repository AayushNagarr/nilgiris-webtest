// Decorative contour-line motif — a nod to the Nilgiris' topography.
// Purely decorative: aria-hidden, no interactive content.
export function TopoBackground({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden
      className={`pointer-events-none absolute inset-0 h-full w-full opacity-[0.08] ${className}`}
      viewBox="0 0 400 300"
      preserveAspectRatio="none"
    >
      {[40, 65, 90, 115, 140, 165].map((r, i) => (
        <ellipse
          key={i}
          cx={i % 2 === 0 ? 90 : 320}
          cy={i % 2 === 0 ? 60 : 230}
          rx={r}
          ry={r * 0.6}
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
        />
      ))}
    </svg>
  );
}
