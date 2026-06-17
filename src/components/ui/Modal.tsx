import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  size?: "md" | "lg" | "xl";
}

export function Modal({ open, onClose, title, subtitle, children, footer, className, size = "md" }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-ink-950/70 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div
        className={cn(
          "relative w-full animate-fade-up rounded-lg border border-ink-600/80 bg-ink-800 shadow-panel",
          size === "md" && "max-w-lg",
          size === "lg" && "max-w-3xl",
          size === "xl" && "max-w-5xl",
          className
        )}
      >
        <div className="flex items-start justify-between border-b border-ink-700/60 px-5 py-3.5">
          <div>
            <h2 className="text-sm font-semibold text-ink-50">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-ink-300">{subtitle}</p>}
          </div>
          <button className="icon-btn h-7 w-7" onClick={onClose}>
            <X size={14} />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-ink-700/60 px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
