import { useStore } from "@/store/useStore";
import { Loader2 } from "lucide-react";

export function HydrationOverlay() {
  const hydrated = useStore((s) => s.hydrated);
  if (hydrated) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-ink-950/70 backdrop-blur-sm">
      <div className="panel px-6 py-5 shadow-xl flex items-center gap-4">
        <Loader2 size={20} className="animate-spin text-fluor" />
        <div>
          <div className="text-sm font-medium text-ink-100">正在恢复实验数据…</div>
          <div className="mono mt-0.5 text-2xs text-ink-400">从 IndexedDB 恢复大图像与全景图</div>
        </div>
      </div>
    </div>
  );
}
