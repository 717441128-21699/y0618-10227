import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Maximize2, Plus, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface CanvasStageProps {
  width: number;
  height: number;
  draw: (ctx: CanvasRenderingContext2D) => void;
  repaintKey?: unknown;
  mode?: "pan" | "crosshair";
  onImageClick?: (x: number, y: number, e: React.MouseEvent) => void;
  onImageMove?: (x: number, y: number) => void;
  cursor?: string;
  className?: string;
  overlay?: React.ReactNode;
  controls?: React.ReactNode;
}

export function CanvasStage({
  width,
  height,
  draw,
  repaintKey,
  mode = "pan",
  onImageClick,
  onImageMove,
  cursor,
  className,
  overlay,
  controls,
}: CanvasStageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const panRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const downRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  const fit = useCallback(() => {
    const el = containerRef.current;
    if (!el || width === 0 || height === 0) return;
    const rect = el.getBoundingClientRect();
    const s = Math.min(rect.width / width, rect.height / height) * 0.96;
    setScale(s);
    setOffset({ x: (rect.width - width * s) / 2, y: (rect.height - height * s) / 2 });
  }, [width, height]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      setContainerSize({ w: rect.width, h: rect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (containerSize.w > 0 && scale === 1 && offset.x === 0) {
      fit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerSize, width, height]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const cw = containerSize.w || canvas.clientWidth;
    const ch = containerSize.h || canvas.clientHeight;
    if (canvas.width !== cw * dpr || canvas.height !== ch * dpr) {
      canvas.width = cw * dpr;
      canvas.height = ch * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    ctx.save();
    ctx.fillStyle = "#070a10";
    ctx.fillRect(0, 0, cw, ch);
    ctx.translate(offset.x, offset.y);
    ctx.scale(scale, scale);
    draw(ctx);
    ctx.restore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draw, scale, offset, containerSize, repaintKey, width, height]);

  const toImageCoords = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left - offset.x) / scale;
    const y = (clientY - rect.top - offset.y) / scale;
    return { x, y };
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const newScale = Math.max(0.05, Math.min(40, scale * factor));
    const k = newScale / scale;
    setOffset({ x: mx - (mx - offset.x) * k, y: my - (my - offset.y) * k });
    setScale(newScale);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    downRef.current = { x: e.clientX, y: e.clientY, moved: false };
    if (mode === "pan" || e.button === 1 || e.shiftKey) {
      panRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (downRef.current) {
      const dx = e.clientX - downRef.current.x;
      const dy = e.clientY - downRef.current.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) downRef.current.moved = true;
    }
    if (panRef.current) {
      setOffset({
        x: panRef.current.ox + (e.clientX - panRef.current.x),
        y: panRef.current.oy + (e.clientY - panRef.current.y),
      });
    } else {
      if (onImageMove) {
        const { x, y } = toImageCoords(e.clientX, e.clientY);
        onImageMove(x, y);
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    panRef.current = null;
    if (downRef.current && !downRef.current.moved && onImageClick) {
      const { x, y } = toImageCoords(e.clientX, e.clientY);
      onImageClick(x, y, e);
    }
    downRef.current = null;
  };

  return (
    <div className={cn("relative h-full w-full overflow-hidden bg-ink-950", className)}>
      <div ref={containerRef} className="absolute inset-0">
        <canvas
          ref={canvasRef}
          className={cn(
            "block h-full w-full touch-none",
            mode === "pan" ? "cursor-grab active:cursor-grabbing" : cursor ?? "cursor-crosshair"
          )}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        />
      </div>
      {overlay}
      <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex items-center gap-1.5">
        <div className="pointer-events-auto flex items-center gap-0.5 rounded-[4px] border border-ink-600/80 bg-ink-900/80 p-0.5 backdrop-blur">
          <button className="icon-btn h-7 w-7 border-0 bg-transparent" onClick={() => setScale((s) => Math.min(40, s * 1.2))}>
            <Plus size={14} />
          </button>
          <span className="mono w-12 text-center text-2xs tabular text-ink-200">
            {Math.round(scale * 100)}%
          </span>
          <button className="icon-btn h-7 w-7 border-0 bg-transparent" onClick={() => setScale((s) => Math.max(0.05, s / 1.2))}>
            <Minus size={14} />
          </button>
          <button className="icon-btn h-7 w-7 border-0 bg-transparent" onClick={fit} title="适应窗口">
            <Maximize2 size={13} />
          </button>
        </div>
        {controls}
      </div>
    </div>
  );
}
