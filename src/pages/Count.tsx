import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Target,
  ArrowLeft,
  ArrowRight,
  Play,
  Trash2,
  Plus,
  MousePointer2,
  Hand,
  Eraser,
  Activity,
  Filter,
  Hash,
  Crosshair,
  AlertTriangle,
  CheckCircle2,
  X,
  Eye,
  History,
  Clock,
  Crop,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { CanvasStage } from "@/components/ui/CanvasStage";
import { Slider } from "@/components/ui/Slider";
import { RangeSlider } from "@/components/ui/RangeSlider";
import { Segmented } from "@/components/ui/Segmented";
import { Toggle } from "@/components/ui/Toggle";
import { ProcessingOverlay } from "@/components/ui/Spinner";
import { Modal } from "@/components/ui/Modal";
import { useStore } from "@/store/useStore";
import { dataUrlToGray } from "@/lib/image";
import { segment, type Polarity } from "@/lib/segmentation";
import {
  defaultFilter,
  filterDetections,
  passesFilter,
  aspectRatioOf,
  summaryStats,
  fmt,
  AUDIT_LABEL,
} from "@/lib/analysis";
import type { Detection, DetectionStatus, Experiment } from "@/types";
import { cn } from "@/lib/utils";

const MANUAL_R = 7;

type StatusFilter = "all" | DetectionStatus;

const STATUS_LABEL: Record<StatusFilter, string> = {
  all: "全部",
  auto: "自动",
  manual: "人工",
  pending: "待确认",
};

const STATUS_COLOR: Record<DetectionStatus, string> = {
  auto: "#2dd4bf",
  manual: "#fbbf24",
  pending: "#f87171",
};

const STATUS_FILL: Record<DetectionStatus, string> = {
  auto: "rgba(45,212,191,0.06)",
  manual: "rgba(251,191,36,0.12)",
  pending: "rgba(248,113,113,0.14)",
};

const STATUS_LABEL_LONG: Record<DetectionStatus, string> = {
  auto: "自动检测",
  manual: "人工标注",
  pending: "待确认",
};

export default function Count() {
  const { expId = "" } = useParams();
  const navigate = useNavigate();
  const exp = useStore((s) => s.experiments.find((e) => e.id === expId));
  const panorama = useStore((s) => s.panoramas[expId] ?? null);
  const detections = useStore((s) => s.detections[expId] ?? []);
  const filter = useStore((s) => s.filters[expId] ?? defaultFilter());
  const setDetections = useStore((s) => s.setDetections);
  const addManualDetection = useStore((s) => s.addManualDetection);
  const removeDetection = useStore((s) => s.removeDetection);
  const updateDetectionStatus = useStore((s) => s.updateDetectionStatus);
  const clearDetections = useStore((s) => s.clearDetections);
  const setFilter = useStore((s) => s.setFilter);
  const updateExperimentStage = useStore((s) => s.updateExperimentStage);

  const [polarity, setPolarity] = useState<Polarity>("bright");
  const [sensitivity, setSensitivity] = useState(0.6);
  const [minArea, setMinArea] = useState(12);
  const [useWatershed, setUseWatershed] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [label, setLabel] = useState("");
  const [tool, setTool] = useState<"pan" | "add" | "delete" | "review" | "select">("pan");
  const [marqueeRect, setMarqueeRect] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [showExcluded, setShowExcluded] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [panoImg, setPanoImg] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!panorama) {
      setPanoImg(null);
      return;
    }
    const img = new Image();
    img.onload = () => setPanoImg(img);
    img.src = panorama.dataUrl;
  }, [panorama?.dataUrl, panorama]);

  const filtered = useMemo(() => filterDetections(detections, filter), [detections, filter]);
  const displayed = useMemo(() => {
    const list = statusFilter === "all" ? filtered : filtered.filter((d) => d.status === statusFilter);
    return list;
  }, [filtered, statusFilter]);

  const counts = useMemo(() => {
    return {
      all: filtered.length,
      auto: filtered.filter((d) => d.status === "auto").length,
      manual: filtered.filter((d) => d.status === "manual").length,
      pending: filtered.filter((d) => d.status === "pending").length,
    };
  }, [filtered]);

  const maxArea = useMemo(() => {
    return Math.max(50, ...detections.map((d) => d.area));
  }, [detections]);
  const maxAR = useMemo(() => Math.max(2, ...detections.map((d) => aspectRatioOf(d))), [detections]);

  const runDetect = async () => {
    if (!panorama) return;
    setRunning(true);
    setProgress(0);
    setLabel("解码全景图");
    await new Promise((r) => setTimeout(r, 50));
    try {
      const maxDim = Math.max(panorama.width, panorama.height);
      const gray = await dataUrlToGray(panorama.dataUrl, maxDim);
      setProgress(0.3);
      setLabel("分割与分水岭");
      await new Promise((r) => setTimeout(r, 30));
      const { detections: auto } = segment(gray, {
        polarity,
        sensitivity,
        minArea,
        watershed: useWatershed,
      });
      setProgress(0.9);
      setLabel("合并标记");
      const existingManual = detections.filter((d) => d.status === "manual" || d.status === "pending");
      let nextId = auto.reduce((m, d) => Math.max(m, d.id), -1) + 1;
      const manual: Detection[] = existingManual.map((d) => ({ ...d, id: nextId++ }));
      setDetections(expId, [...auto, ...manual]);
      setProgress(1);
      setLabel(`检出 ${auto.length} 个目标（保留 ${manual.length} 个复核/人工）`);
      await new Promise((r) => setTimeout(r, 250));
    } catch (e) {
      setLabel(`失败：${e instanceof Error ? e.message : String(e)}`);
      await new Promise((r) => setTimeout(r, 1500));
    } finally {
      setRunning(false);
    }
  };

  const runLocalDetect = async (rect: { x0: number; y0: number; x1: number; y1: number }) => {
    if (!panorama || !panoImg) return;
    const x0 = Math.floor(rect.x0);
    const y0 = Math.floor(rect.y0);
    const w = Math.ceil(rect.x1 - x0);
    const h = Math.ceil(rect.y1 - y0);
    if (w < 4 || h < 4) {
      setMarqueeRect(null);
      return;
    }
    setRunning(true);
    setProgress(0.2);
    setLabel("截取局部区域");
    try {
      await new Promise((r) => setTimeout(r, 30));
      const off = document.createElement("canvas");
      off.width = w;
      off.height = h;
      const octx = off.getContext("2d")!;
      octx.drawImage(panoImg, x0, y0, w, h, 0, 0, w, h);
      const img = octx.getImageData(0, 0, w, h);
      const data = new Float32Array(w * h);
      for (let i = 0, j = 0; i < img.data.length; i += 4, j++) {
        const r = img.data[i], g = img.data[i + 1], b = img.data[i + 2];
        data[j] = 0.299 * r + 0.587 * g + 0.114 * b;
      }
      const gray = { data, w, h } as Awaited<ReturnType<typeof dataUrlToGray>>;
      setProgress(0.5);
      setLabel("局部分割与分水岭");
      await new Promise((r) => setTimeout(r, 20));
      const { detections: localAuto } = segment(gray, {
        polarity,
        sensitivity,
        minArea,
        watershed: useWatershed,
      });
      setProgress(0.85);
      setLabel("合并标记（保留区域外自动目标与所有复核标记）");
      let nextId = Math.max(-1, ...detections.map((d) => d.id)) + 1;
      const shifted: Detection[] = localAuto.map((d) => ({
        ...d,
        id: nextId++,
        cx: d.cx + x0,
        cy: d.cy + y0,
      }));
      const insideBox = (cx: number, cy: number) => cx >= x0 && cx <= x0 + w && cy >= y0 && cy <= y0 + h;
      const preserved = detections.filter((d) => {
        if (d.status === "manual" || d.status === "pending") return true;
        return !insideBox(d.cx, d.cy);
      });
      const merged = [...preserved, ...shifted];
      setDetections(expId, merged);
      setProgress(1);
      setLabel(`局部重检完成：选区内替换 ${shifted.length} 个自动目标，保留 ${preserved.length} 个（区域外自动 + 所有复核）`);
      setMarqueeRect(null);
      await new Promise((r) => setTimeout(r, 300));
    } catch (e) {
      setLabel(`局部重检失败：${e instanceof Error ? e.message : String(e)}`);
      await new Promise((r) => setTimeout(r, 1500));
    } finally {
      setRunning(false);
    }
  };

  const findNearest = (x: number, y: number): Detection | null => {
    let best: Detection | null = null;
    let bestD = Infinity;
    for (const d of displayed) {
      const dx = d.cx - x;
      const dy = d.cy - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const r = Math.max(d.majorAxis, d.minorAxis, 8);
      if (dist <= r && dist < bestD) {
        bestD = dist;
        best = d;
      }
    }
    return best;
  };

  const onImageClick = (x: number, y: number) => {
    if (tool === "add") {
      addManualDetection(expId, {
        cx: x,
        cy: y,
        area: Math.round(Math.PI * MANUAL_R * MANUAL_R),
        perimeter: Math.round(2 * Math.PI * MANUAL_R),
        majorAxis: MANUAL_R,
        minorAxis: MANUAL_R,
        circularity: 1,
        angle: 0,
      });
    } else if (tool === "delete") {
      const near = findNearest(x, y);
      if (near) removeDetection(expId, near.id);
    } else if (tool === "review" || tool === "pan") {
      const near = findNearest(x, y);
      if (near) setSelectedId(near.id);
      else setSelectedId(null);
    }
  };

  const onImageMove = (x: number, y: number) => {
    if (tool === "add") {
      setHoveredId(null);
      return;
    }
    const near = findNearest(x, y);
    setHoveredId(near ? near.id : null);
  };

  const selected = useMemo(
    () => (selectedId != null ? detections.find((d) => d.id === selectedId) ?? null : null),
    [selectedId, detections]
  );

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      if (!panoImg || !panorama) return;
      ctx.drawImage(panoImg, 0, 0, panorama.width, panorama.height);
      for (const d of detections) {
        const isPass = d.manual || d.status === "pending" || passesFilter(d, filter);
        if (!isPass && !showExcluded) continue;
        if (statusFilter !== "all" && d.status !== statusFilter) continue;
        const hovered = hoveredId === d.id || selectedId === d.id;
        ctx.save();
        ctx.translate(d.cx, d.cy);
        ctx.rotate(d.angle);
        const color = STATUS_COLOR[d.status];
        ctx.strokeStyle = hovered ? "#ffffff" : color;
        ctx.lineWidth = (hovered ? 2 : d.status === "pending" ? 1.4 : 1) / ctx.getTransform().a;
        if (d.status === "pending") {
          ctx.setLineDash([3 / ctx.getTransform().a, 3 / ctx.getTransform().a]);
        }
        ctx.fillStyle = isPass ? STATUS_FILL[d.status] : "transparent";
        ctx.beginPath();
        ctx.ellipse(0, 0, Math.max(1, d.majorAxis), Math.max(1, d.minorAxis), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        if (isPass) {
          ctx.save();
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(d.cx, d.cy, 1.4 / ctx.getTransform().a, 0, Math.PI * 2);
          ctx.fill();
          if (d.status === "pending") {
            ctx.fillStyle = "#ffffff";
            ctx.font = `${11 / ctx.getTransform().a}px monospace`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("?", d.cx + (d.majorAxis + 4) / ctx.getTransform().a, d.cy);
          }
          ctx.restore();
        }
      }
    },
    [panoImg, panorama, detections, filter, showExcluded, hoveredId, statusFilter, selectedId]
  );

  if (!exp) {
    return (
      <>
        <PageHeader title="细胞计数" icon={<Target size={16} />} />
        <div className="flex flex-1 items-center justify-center text-sm text-ink-300">实验不存在</div>
      </>
    );
  }

  const areaStats = summaryStats(filtered, "area");
  const circStats = summaryStats(filtered, "circularity");
  const totalArea = filtered.reduce((s, d) => s + d.area, 0);

  const cycleStatus = (d: Detection) => {
    const seq: DetectionStatus[] = ["auto", "pending", "manual"];
    const i = seq.indexOf(d.status);
    const next = seq[(i + 1) % seq.length];
    updateDetectionStatus(expId, d.id, next);
  };

  return (
    <>
      <PageHeader
        title={exp.name}
        subtitle="细胞计数 · 复核模式"
        icon={<Target size={16} />}
        crumbs={[{ label: "实验工作台", to: "/" }, { label: "计数" }]}
        actions={
          <>
            <button className="btn" onClick={() => navigate(`/stitch/${expId}`)}>
              <ArrowLeft size={14} />
              拼接
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                updateExperimentStage(expId, "measure");
                navigate(`/measure/${expId}`);
              }}
              disabled={filtered.length === 0}
            >
              下一步
              <ArrowRight size={14} />
            </button>
          </>
        }
      />

      <div className="flex flex-1 overflow-hidden">
        <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-r border-ink-700/60 bg-ink-850/30">
          <div className="flex flex-col gap-5 p-4">
            <Section title="自动检测" icon={<Activity size={13} />}>
              <Label>极性</Label>
              <Segmented
                options={[
                  { value: "bright" as Polarity, label: "亮目标" },
                  { value: "dark" as Polarity, label: "暗目标" },
                ]}
                value={polarity}
                onChange={setPolarity}
              />
              <Label>灵敏度 · {sensitivity.toFixed(2)}</Label>
              <Slider value={sensitivity} min={0.1} max={0.95} step={0.05} onChange={setSensitivity} />
              <Label>最小面积 · {minArea} px</Label>
              <Slider value={minArea} min={3} max={120} step={1} onChange={setMinArea} />
              <div className="mt-1 rounded-[3px] border border-ink-700/60 bg-ink-900/40 px-3 py-2">
                <Toggle checked={useWatershed} onChange={setUseWatershed} label="分水岭分割" hint="分离粘连目标" />
              </div>
              <button
                className="btn btn-primary mt-2 w-full justify-center"
                onClick={runDetect}
                disabled={running || !panorama}
              >
                <Play size={14} />
                {running ? "检测中…" : "运行自动检测"}
              </button>
              <p className="mono text-2xs text-ink-400">
                重新检测会保留人工标记和待确认目标
              </p>
            </Section>

            <Section title="复核模式" icon={<Eye size={13} />}>
              <Label>按状态筛选</Label>
              <Segmented<StatusFilter>
                options={[
                  { value: "all", label: `全部 (${counts.all})` },
                  { value: "auto", label: `自动 (${counts.auto})` },
                  { value: "manual", label: `人工 (${counts.manual})` },
                  { value: "pending", label: `待确认 (${counts.pending})` },
                ]}
                value={statusFilter}
                onChange={setStatusFilter}
              />
              <div className="mt-3 flex flex-col gap-2">
                <div className="flex items-center gap-2 text-2xs text-ink-300">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: STATUS_COLOR.auto }} />
                  自动检测
                  <span className="ml-2 inline-block h-2 w-2 rounded-full" style={{ background: STATUS_COLOR.manual }} />
                  人工
                  <span className="ml-2 inline-block h-2 w-2 rounded-full" style={{ background: STATUS_COLOR.pending }} />
                  待确认
                </div>
              </div>
            </Section>

            <Section title="形态过滤" icon={<Filter size={13} />}>
              <Label>面积范围 · {filter.minArea}–{filter.maxArea} px</Label>
              <RangeSlider
                valueMin={filter.minArea}
                valueMax={filter.maxArea}
                min={0}
                max={Math.ceil(maxArea * 1.1)}
                step={1}
                onChange={(a, b) => setFilter(expId, { minArea: a, maxArea: b })}
              />
              <Label>圆度 · {filter.minCircularity.toFixed(2)}–{filter.maxCircularity.toFixed(2)}</Label>
              <RangeSlider
                valueMin={filter.minCircularity}
                valueMax={filter.maxCircularity}
                min={0}
                max={1}
                step={0.01}
                onChange={(a, b) => setFilter(expId, { minCircularity: a, maxCircularity: b })}
              />
              <Label>长短轴比 · {filter.minAspectRatio.toFixed(1)}–{filter.maxAspectRatio.toFixed(1)}</Label>
              <RangeSlider
                valueMin={filter.minAspectRatio}
                valueMax={filter.maxAspectRatio}
                min={1}
                max={Math.ceil(maxAR * 1.1)}
                step={0.1}
                onChange={(a, b) => setFilter(expId, { minAspectRatio: a, maxAspectRatio: b })}
              />
              <div className="mt-1 flex items-center justify-between">
                <span className="mono text-2xs text-ink-400">
                  通过 {filtered.length}/{detections.length}
                </span>
                <button
                  className="text-2xs text-ink-300 hover:text-fluor-glow"
                  onClick={() => useStore.getState().resetFilter(expId)}
                >
                  重置
                </button>
              </div>
            </Section>

            <Section title="标注工具" icon={<Crosshair size={13} />}>
              <Segmented
                options={[
                  { value: "pan", label: <Hand size={13} />, title: "平移" },
                  { value: "review", label: <Eye size={13} />, title: "复核（点击目标查详情）" },
                  { value: "select", label: <Crop size={13} />, title: "框选局部重检" },
                  { value: "add", label: <Plus size={13} />, title: "添加标记" },
                  { value: "delete", label: <Eraser size={13} />, title: "删除标记" },
                ]}
                value={tool}
                onChange={(v) => {
                  setTool(v as typeof tool);
                  setMarqueeRect(null);
                }}
              />
              <div className="mt-1 rounded-[3px] border border-ink-700/60 bg-ink-900/40 px-3 py-2">
                <Toggle checked={showExcluded} onChange={setShowExcluded} label="显示过滤外目标" hint="灰色弱化显示" />
              </div>
              <p className="mono mt-2 text-2xs text-ink-400">
                {tool === "add"
                  ? "点击图像添加标记"
                  : tool === "delete"
                    ? "点击目标删除"
                    : tool === "review"
                      ? "点击目标查看详情并切换状态"
                      : tool === "select"
                        ? "在全景图上拖拽矩形框选区域，松开后仅重检该区域内自动目标"
                        : "拖拽平移视图，可点击目标查看详情"}
              </p>
            </Section>

            <Section title="结果摘要" icon={<Hash size={13} />}>
              <div className="grid grid-cols-2 gap-2">
                <Metric label="计数" value={filtered.length} accent />
                <Metric label="自动" value={counts.auto} />
                <Metric label="人工" value={counts.manual} />
                <Metric
                  label="待确认"
                  value={counts.pending}
                  accent={counts.pending > 0}
                />
                <Metric label="总面积" value={fmt(totalArea, 0)} unit="px²" />
                <Metric label="均值面积" value={fmt(areaStats.mean)} unit="px²" />
                <Metric label="中位圆度" value={fmt(circStats.median, 2)} />
                <Metric label="圆度范围" value={`${fmt(circStats.min, 2)}–${fmt(circStats.max, 2)}`} />
              </div>
              {detections.length > 0 && (
                <button
                  className="btn mt-2 w-full justify-center hover:!border-coral/50 hover:!text-coral-glow"
                  onClick={() => {
                    if (counts.pending > 0 && !confirm(`尚有 ${counts.pending} 个待确认目标，确认全部清空？`)) return;
                    clearDetections(expId);
                  }}
                >
                  <Trash2 size={13} />
                  清空标记
                </button>
              )}
            </Section>
          </div>
        </aside>

        <div className="relative flex-1 overflow-hidden">
          {!panorama ? (
            <div className="flex h-full flex-col items-center justify-center text-sm text-ink-300">
              <Target size={28} className="mb-3 text-ink-500" />
              请先完成图像拼接
              <button className="btn mt-4" onClick={() => navigate(`/stitch/${expId}`)}>
                前往拼接
              </button>
            </div>
          ) : (
            <CanvasStage
              width={panorama.width}
              height={panorama.height}
              draw={draw}
              repaintKey={`${detections.length}-${hoveredId}-${selectedId ?? -1}-${statusFilter}-${panoImg ? 1 : 0}-${marqueeRect ? `${marqueeRect.x0}-${marqueeRect.y0}-${marqueeRect.x1}-${marqueeRect.y1}` : "0"}`}
              mode={tool === "pan" ? "pan" : tool === "select" ? "marquee" : "crosshair"}
              onImageClick={onImageClick}
              onImageMove={onImageMove}
              marqueeRect={tool === "select" ? marqueeRect : null}
              onMarqueeStart={(x, y) => setMarqueeRect({ x0: x, y0: y, x1: x, y1: y })}
              onMarqueeMove={(x, y) => setMarqueeRect((prev) => (prev ? { ...prev, x1: x, y1: y } : null))}
              onMarqueeEnd={(rect) => {
                if (!panorama) return;
                const x0 = Math.max(0, Math.min(rect.x0, rect.x1));
                const x1 = Math.min(panorama.width, Math.max(rect.x0, rect.x1));
                const y0 = Math.max(0, Math.min(rect.y0, rect.y1));
                const y1 = Math.min(panorama.height, Math.max(rect.y0, rect.y1));
                if (x1 - x0 < 8 || y1 - y0 < 8) {
                  setMarqueeRect(null);
                  return;
                }
                runLocalDetect({ x0, y0, x1, y1 });
              }}
              cursor={
                tool === "add" ? "crosshair" :
                tool === "delete" ? "not-allowed" :
                tool === "review" ? "pointer" :
                tool === "select" ? "crosshair" :
                hoveredId != null ? "pointer" : undefined
              }
              controls={
                <div className="pointer-events-auto flex items-center gap-2 rounded-[4px] border border-ink-600/80 bg-ink-900/80 px-2.5 py-1 text-2xs text-ink-200 backdrop-blur">
                  <MousePointer2 size={11} />
                  {detections.length} 标记 · 显示 {displayed.length}
                  {counts.pending > 0 && (
                    <>
                      <span className="text-ink-600">·</span>
                      <span className="flex items-center gap-1 text-red">
                        <AlertTriangle size={11} />
                        {counts.pending} 待确认
                      </span>
                    </>
                  )}
                </div>
              }
            />
          )}
          {running && <ProcessingOverlay show={running} progress={progress} label={label} />}
        </div>
      </div>

      <DetectionDetailModal
        exp={exp}
        detection={selected}
        onClose={() => setSelectedId(null)}
        onPrev={() => {
          if (selectedId == null) return;
          const idx = displayed.findIndex((d) => d.id === selectedId);
          const prev = displayed[(idx - 1 + displayed.length) % displayed.length];
          if (prev) setSelectedId(prev.id);
        }}
        onNext={() => {
          if (selectedId == null) return;
          const idx = displayed.findIndex((d) => d.id === selectedId);
          const next = displayed[(idx + 1) % displayed.length];
          if (next) setSelectedId(next.id);
        }}
        onCycle={cycleStatus}
        onDelete={(d) => {
          removeDetection(expId, d.id);
          setSelectedId(null);
        }}
      />
    </>
  );
}

function DetectionDetailModal({
  exp,
  detection,
  onClose,
  onPrev,
  onNext,
  onCycle,
  onDelete,
}: {
  exp: Experiment;
  detection: Detection | null;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onCycle: (d: Detection) => void;
  onDelete: (d: Detection) => void;
}) {
  return (
    <Modal
      open={!!detection}
      onClose={onClose}
      title="目标详情 · 复核"
      subtitle={detection ? `${exp.name} · ID ${detection.id}` : undefined}
      size="md"
      footer={
        detection ? (
          <>
            <button className="btn btn-ghost" onClick={() => onDelete(detection)}>
              <Trash2 size={13} />
              删除
            </button>
            <div className="mr-auto flex items-center gap-1">
              <button className="icon-btn h-7 w-7" onClick={onPrev} title="上一个">
                <ArrowLeft size={13} />
              </button>
              <button className="icon-btn h-7 w-7" onClick={onNext} title="下一个">
                <ArrowRight size={13} />
              </button>
            </div>
            <button className="btn" onClick={() => onCycle(detection)}>
              {detection.status === "auto" ? (
                <>
                  <AlertTriangle size={13} />
                  标为待确认
                </>
              ) : detection.status === "pending" ? (
                <>
                  <CheckCircle2 size={13} />
                  转为人工
                </>
              ) : (
                <>
                  <CheckCircle2 size={13} />
                  转回自动
                </>
              )}
            </button>
            <button className="btn btn-primary" onClick={onClose}>
              完成
            </button>
          </>
        ) : undefined
      }
    >
      {detection && <DetectionDetailBody detection={detection} />}
    </Modal>
  );
}

function DetectionDetailBody({ detection }: { detection: Detection }) {
  const ar = aspectRatioOf(detection);
  const rows: Array<{ label: string; value: string; hint?: string }> = [
    { label: "状态", value: STATUS_LABEL_LONG[detection.status], hint: detection.status === "pending" ? "复核后转为人工" : undefined },
    { label: "类型", value: detection.manual ? "人工" : "自动" },
    { label: "中心", value: `(${fmt(detection.cx, 1)}, ${fmt(detection.cy, 1)}) px`, hint: "相对全景图坐标" },
    { label: "面积", value: `${fmt(detection.area, 1)} px²` },
    { label: "周长", value: `${fmt(detection.perimeter, 1)} px` },
    { label: "圆度", value: fmt(detection.circularity, 3), hint: "1 = 完美圆形，越接近 0 越不规则" },
    { label: "长轴", value: `${fmt(detection.majorAxis, 1)} px` },
    { label: "短轴", value: `${fmt(detection.minorAxis, 1)} px` },
    { label: "长短轴比", value: fmt(ar, 2), hint: "1 = 对称，越大越细长" },
    { label: "倾角", value: `${fmt((detection.angle * 180) / Math.PI, 1)}°`, hint: "-90° 到 90°" },
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-[4px] border border-ink-600/60 bg-ink-900/40 p-3">
        <div className="mb-2 flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COLOR[detection.status] }} />
          <span className="mono text-xs font-medium text-ink-100">
            Detection #{detection.id}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          {rows.map((r) => (
            <div key={r.label} className="border-b border-ink-700/50 py-1.5">
              <div className="mono flex items-center justify-between text-2xs text-ink-400">
                <span>{r.label}</span>
                <span className="text-ink-100 font-medium tabular">{r.value}</span>
              </div>
              {r.hint && <div className="mono mt-0.5 text-2xs text-ink-500">{r.hint}</div>}
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-[4px] border border-ink-600/60 bg-ink-900/40 p-3">
        <div className="mb-2 flex items-center gap-2">
          <History size={13} className="text-ink-400" />
          <span className="text-xs font-medium text-ink-200">处理轨迹</span>
        </div>
        <ol className="relative ml-2 border-l border-ink-600/70">
          {(detection.history ?? []).slice().reverse().map((ev, idx) => {
            const t = new Date(ev.at);
            const hhmmss = t.toLocaleTimeString();
            const mmdd = t.toLocaleDateString(undefined, { month: "2-digit", day: "2-digit" });
            return (
              <li key={idx} className="relative ml-4 pb-3 last:pb-0">
                <span className="absolute -left-[22px] top-0.5 h-2.5 w-2.5 rounded-full border-2 border-ink-800 bg-ink-400" />
                <div className="flex items-center gap-2 text-2xs">
                  <span className="font-medium text-ink-100">{AUDIT_LABEL[ev.action] ?? ev.action}</span>
                  {ev.fromStatus && (
                    <span className="mono text-ink-500">← {STATUS_LABEL_LONG[ev.fromStatus]}</span>
                  )}
                </div>
                <div className="mono mt-0.5 flex items-center gap-1 text-2xs text-ink-500">
                  <Clock size={10} />
                  {mmdd} {hhmmss}
                  {ev.note && <span>· {ev.note}</span>}
                </div>
              </li>
            );
          })}
          {(!detection.history || detection.history.length === 0) && (
            <li className="ml-4 pb-0 text-2xs text-ink-500">暂无记录</li>
          )}
        </ol>
      </div>
      <div className="rounded-[4px] border border-ink-600/40 bg-ink-850/40 px-3 py-2 text-2xs text-ink-300">
        提示：点击下方「标为待确认 / 转为人工 / 转回自动」可快速切换该目标的分类状态；
        待确认目标在测量页和报告中会单独统计。
      </div>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-1.5">
        <span className="text-ink-400">{icon}</span>
        <span className="field-label">{title}</span>
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="mono text-2xs text-ink-300">{children}</span>;
}

function Metric({
  label,
  value,
  unit,
  accent,
}: {
  label: string;
  value: number | string;
  unit?: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-[3px] border border-ink-700/60 bg-ink-900/40 px-2.5 py-2">
      <div className="mono text-2xs uppercase tracking-wider text-ink-400">{label}</div>
      <div className={cn("mono text-xs font-semibold tabular", accent ? "text-fluor-glow" : "text-ink-100")}>
        {value}
        {unit && <span className="ml-0.5 text-2xs text-ink-400">{unit}</span>}
      </div>
    </div>
  );
}
