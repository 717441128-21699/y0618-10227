import { cn } from "@/lib/utils";

interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  hint?: string;
  accent?: "fluor" | "amber";
}

export function Toggle({ checked, onChange, label, hint, accent = "fluor" }: ToggleProps) {
  const color = accent === "amber" ? "bg-amber" : "bg-fluor";
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 text-left"
    >
      {(label || hint) && (
        <span className="min-w-0">
          {label && <span className="block text-xs text-ink-100">{label}</span>}
          {hint && <span className="mono mt-0.5 block text-2xs text-ink-400">{hint}</span>}
        </span>
      )}
      <span
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors",
          checked ? color : "bg-ink-600"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-4" : "translate-x-0.5"
          )}
        />
      </span>
    </button>
  );
}
