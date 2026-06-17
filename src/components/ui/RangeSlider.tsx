import { useCallback, useRef } from "react";
import { cn } from "@/lib/utils";

interface RangeSliderProps {
  valueMin: number;
  valueMax: number;
  min: number;
  max: number;
  step?: number;
  onChange: (min: number, max: number) => void;
  format?: (v: number) => string;
  className?: string;
}

export function RangeSlider({
  valueMin,
  valueMax,
  min,
  max,
  step = 1,
  onChange,
  className,
}: RangeSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<"min" | "max" | null>(null);

  const pctMin = ((valueMin - min) / (max - min)) * 100;
  const pctMax = ((valueMax - min) / (max - min)) * 100;

  const setFromClientX = useCallback(
    (clientX: number, which: "min" | "max") => {
      const el = trackRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      let t = (clientX - rect.left) / rect.width;
      t = Math.max(0, Math.min(1, t));
      let v = min + t * (max - min);
      v = Math.round(v / step) * step;
      v = Math.max(min, Math.min(max, v));
      if (which === "min") {
        onChange(Math.min(v, valueMax - step), valueMax);
      } else {
        onChange(valueMin, Math.max(v, valueMin + step));
      }
    },
    [min, max, step, onChange, valueMin, valueMax]
  );

  const handleTrackDown = (e: React.PointerEvent) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const t = (e.clientX - rect.left) / rect.width;
    const mid = (pctMin + pctMax) / 2 / 100;
    const which = t < mid ? "min" : "max";
    dragRef.current = which;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setFromClientX(e.clientX, which);
  };

  const handleMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    setFromClientX(e.clientX, dragRef.current);
  };

  const handleUp = (e: React.PointerEvent) => {
    dragRef.current = null;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // noop
    }
  };

  return (
    <div className={cn("relative h-5 w-full touch-none", className)}>
      <div
        ref={trackRef}
        className="relative h-5 w-full cursor-pointer"
        onPointerDown={handleTrackDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
      >
        <div className="absolute top-1/2 h-[3px] w-full -translate-y-1/2 rounded-full bg-ink-600" />
        <div
          className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-fluor"
          style={{
            left: `${pctMin}%`,
            width: `${pctMax - pctMin}%`,
            boxShadow: "0 0 8px #2dd4bf80",
          }}
        />
        <div
          className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-ink-900 bg-ink-50"
          style={{ left: `${pctMin}%`, boxShadow: "0 0 0 2px #2dd4bf55, 0 0 10px #2dd4bf80" }}
        />
        <div
          className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-ink-900 bg-ink-50"
          style={{ left: `${pctMax}%`, boxShadow: "0 0 0 2px #2dd4bf55, 0 0 10px #2dd4bf80" }}
        />
      </div>
    </div>
  );
}
