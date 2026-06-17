import { useCallback, useRef } from "react";
import { cn } from "@/lib/utils";

interface SliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  accent?: "fluor" | "amber";
  className?: string;
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  format,
  accent = "fluor",
  className,
}: SliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const pct = ((value - min) / (max - min)) * 100;
  const accentColor = accent === "amber" ? "#fbbf24" : "#2dd4bf";

  const setFromClientX = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      let t = (clientX - rect.left) / rect.width;
      t = Math.max(0, Math.min(1, t));
      let v = min + t * (max - min);
      v = Math.round(v / step) * step;
      v = Math.max(min, Math.min(max, v));
      onChange(v);
    },
    [min, max, step, onChange]
  );

  const handlePointerDown = (e: React.PointerEvent) => {
    draggingRef.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setFromClientX(e.clientX);
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    setFromClientX(e.clientX);
  };
  const handlePointerUp = (e: React.PointerEvent) => {
    draggingRef.current = false;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // noop
    }
  };

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div
        ref={trackRef}
        className="relative h-5 flex-1 cursor-pointer touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <div className="absolute top-1/2 h-[3px] w-full -translate-y-1/2 rounded-full bg-ink-600" />
        <div
          className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full"
          style={{ width: `${pct}%`, background: accentColor, boxShadow: `0 0 8px ${accentColor}80` }}
        />
        <div
          className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-ink-900 bg-ink-50 transition-transform"
          style={{ left: `${pct}%`, boxShadow: `0 0 0 2px ${accentColor}55, 0 0 10px ${accentColor}80` }}
        />
      </div>
      {format && (
        <span className="mono w-12 shrink-0 text-right text-xs tabular text-ink-100">
          {format(value)}
        </span>
      )}
    </div>
  );
}
