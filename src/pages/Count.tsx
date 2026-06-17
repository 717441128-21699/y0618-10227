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
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { CanvasStage } from "@/components/ui/CanvasStage";
import { Slider } from "@/components/ui/Slider";
import { RangeSlider } from "@/components/ui/RangeSlider";
import { Segmented } from "@/components/ui/Segmented";
import { Toggle } from "@/components/ui/Toggle";
import { ProcessingOverlay } from "@/components/ui/Spinner";
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
} from "@/lib/analysis";
import type { Detection } from "@/types";
import { cn } from "@/lib/utils";

const MANUAL_R = 7;

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
  const [tool, setTool] = useState<"pan" | "add" | "delete">("pan");
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [showExcluded, setShowExcluded] = useState(true);
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
  const manualDets = useMemo(() => detections.filter((d) => d.manual), [detections]);

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
      const existingManual = detections.filter((d) => d.manual);
      let nextId = auto.reduce((m, d) => Math.max(m, d.id), -1) + 1;
      const manual: Detection[] = existingManual.map((d) => ({ ...d, id: nextId++ }));
      setDetections(expId, [...auto, ...manual]);
      setProgress(1);
      setLabel(`检出 ${auto.length} 个目标`);
      await new Promise((r) => setTimeout(r, 250));
    } catch (e) {
      setLabel(`失败：${e instanceof Error ? e.message : String(e)}`);
      await new Promise((r) => setTimeout(r, 1500));
    } finally {
      setRunning(false);
    }
  };

  const findNearest = (x: number, y: number): Detection | null => {
    let best: Detection | null = null;
    let bestD = Infinity;
    for (const d of detections) {
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
    }
  };

  const onImageMove = (x: number, y: number) => {
    if (tool !== "delete") return;
    const near = findNearest(x, y);
    setHoveredId(near ? near.id : null);
  };

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      if (!panoImg || !panorama) return;
      ctx.drawImage(panoImg, 0, 0, panorama.width, panorama.height);
      for (const d of detections) {
        const isManual = d.manual;
        const isPass = isManual || passesFilter(d, filter);
        if (!isPass && !showExcluded) continue;
        const hovered = hoveredId === d.id;
        ctx.save();
        ctx.translate(d.cx, d.cy);
        ctx.rotate(d.angle);
        if (isManual) {
          ctx.strokeStyle = "#fbbf24";
          ctx.lineWidth = (hovered ? 2 : 1.4) / ctx.getTransform().a;
          ctx.fillStyle = "rgba(251,191,36,0.12)";
        } else if (isPass) {
          ctx.strokeStyle = hovered ? "#5eead4" : "#2dd4bf";
          ctx.lineWidth = (hovered ? 1.8 : 1) / ctx.getTransform().a;
          ctx.fillStyle = "rgba(45,212,191,0.06)";
        } else {
          ctx.strokeStyle = "rgba(120,130,150,0.5)";
          ctx.lineWidth = 0.7 / ctx.getTransform().a;
          ctx.fillStyle = "transparent";
        }
        ctx.beginPath();
        ctx.ellipse(0, 0, Math.max(1, d.majorAxis), Math.max(1, d.minorAxis), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        if (isPass || isManual) {
          ctx.save();
          ctx.fillStyle = isManual ? "#fbbf24" : "#2dd4bf";
          ctx.beginPath();
          ctx.arc(d.cx, d.cy, 1.4 / ctx.getTransform().a, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
    },
    [panoImg, panorama, detections, filter, showExcluded, hoveredId]
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

  return (
    <>
      <PageHeader
        title={exp.name}
        subtitle="细胞计数"
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
                  { value: "add", label: <Plus size={13} />, title: "添加标记" },
                  { value: "delete", label: <Eraser size={13} />, title: "删除标记" },
                ]}
                value={tool}
                onChange={(v) => setTool(v as typeof tool)}
              />
              <div className="mt-1 rounded-[3px] border border-ink-700/60 bg-ink-900/40 px-3 py-2">
                <Toggle checked={showExcluded} onChange={setShowExcluded} label="显示过滤外目标" hint="灰色弱化显示" />
              </div>
              <p className="mono mt-2 text-2xs text-ink-400">
                {tool === "add" ? "点击图像添加标记" : tool === "delete" ? "点击目标删除" : "拖拽平移视图"}
              </p>
            </Section>

            <Section title="结果摘要" icon={<Hash size={13} />}>
              <div className="grid grid-cols-2 gap-2">
                <Metric label="计数" value={filtered.length} accent />
                <Metric label="手动" value={manualDets.length} />
                <Metric label="总面积" value={fmt(totalArea, 0)} unit="px²" />
                <Metric label="均值面积" value={fmt(areaStats.mean)} unit="px²" />
                <Metric label="中位圆度" value={fmt(circStats.median, 2)} />
                <Metric label="圆度范围" value={`${fmt(circStats.min, 2)}–${fmt(circStats.max, 2)}`} />
              </div>
              {detections.length > 0 && (
                <button
                  className="btn mt-2 w-full justify-center hover:!border-coral/50 hover:!text-coral-glow"
                  onClick={() => clearDetections(expId)}
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
              repaintKey={`${detections.length}-${hoveredId}-${panoImg ? 1 : 0}`}
              mode={tool === "pan" ? "pan" : "crosshair"}
              onImageClick={onImageClick}
              onImageMove={onImageMove}
              cursor={tool === "add" ? "crosshair" : tool === "delete" ? "not-allowed" : undefined}
              controls={
                <div className="pointer-events-auto flex items-center gap-1 rounded-[4px] border border-ink-600/80 bg-ink-900/80 px-2 py-0.5 text-2xs text-ink-200 backdrop-blur">
                  <MousePointer2 size={11} />
                  {detections.length} 标记
                </div>
              }
            />
          )}
          {running && <ProcessingOverlay show={running} progress={progress} label={label} />}
        </div>
      </div>
    </>
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
