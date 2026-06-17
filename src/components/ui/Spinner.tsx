import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function Spinner({ className, size = 16 }: { className?: string; size?: number }) {
  return (
    <Loader2
      className={cn("animate-spin text-fluor", className)}
      size={size}
      strokeWidth={2}
    />
  );
}

export function ProcessingOverlay({
  show,
  label,
  progress,
}: {
  show: boolean;
  label: string;
  progress?: number;
}) {
  if (!show) return null;
  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-ink-950/80 backdrop-blur-sm animate-fade-in">
      <div className="relative h-14 w-14">
        <div className="absolute inset-0 rounded-full border-2 border-ink-600" />
        <div className="absolute inset-0 animate-spin-slow rounded-full border-2 border-transparent border-t-fluor border-r-fluor" />
        <div className="absolute inset-2 animate-pulse-ring rounded-full border border-fluor/40" />
      </div>
      <div className="text-center">
        <div className="mono text-sm text-fluor-glow">{label}</div>
        {typeof progress === "number" && (
          <div className="mono mt-1 text-2xs uppercase tracking-widest text-ink-300">
            {Math.round(progress * 100)}%
          </div>
        )}
      </div>
      {typeof progress === "number" && (
        <div className="h-[2px] w-48 overflow-hidden rounded-full bg-ink-600">
          <div
            className="h-full rounded-full bg-fluor transition-all duration-300"
            style={{ width: `${Math.round(progress * 100)}%`, boxShadow: "0 0 8px #2dd4bf" }}
          />
        </div>
      )}
    </div>
  );
}
