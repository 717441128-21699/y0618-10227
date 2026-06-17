import { cn } from "@/lib/utils";

export interface SegmentedOption {
  value: string;
  label?: React.ReactNode;
  icon?: React.ReactNode;
  title?: string;
}

interface SegmentedProps<T extends string> {
  options: readonly SegmentedOption[];
  value: T;
  onChange: (v: NoInfer<T>) => void;
  size?: "sm" | "md";
  className?: string;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = "sm",
  className,
}: SegmentedProps<T>) {
  return (
    <div
      className={cn(
        "inline-flex rounded-[4px] border border-ink-600/80 bg-ink-850 p-0.5",
        className
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            title={opt.title}
            onClick={() => onChange(opt.value as T)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[3px] font-medium transition",
              size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-2 text-sm",
              active
                ? "bg-fluor/15 text-fluor-glow shadow-[inset_0_0_0_1px_rgba(45,212,191,0.4)]"
                : "text-ink-200 hover:bg-ink-700/50 hover:text-ink-50"
            )}
          >
            {opt.icon}
            {opt.label != null && <span>{opt.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
