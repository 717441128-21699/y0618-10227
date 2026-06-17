import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ScanLine,
  Upload,
  Star,
  X,
  Play,
  RotateCcw,
  ArrowRight,
  Image as ImageIcon,
  Layers,
  Sun,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { CanvasStage } from "@/components/ui/CanvasStage";
import { Toggle } from "@/components/ui/Toggle";
import { ProcessingOverlay } from "@/components/ui/Spinner";
import { useStore } from "@/store/useStore";
import { dataUrlToGray, grayToCanvas, readImageFilesToTiles } from "@/lib/image";
import { stitch } from "@/lib/stitching";
import type { Panorama } from "@/types";

export default function Stitch() {
  const { expId = "" } = useParams();
  const navigate = useNavigate();
  const exp = useStore((s) => s.experiments.find((e) => e.id === expId));
  const tiles = useStore((s) => s.tiles[expId] ?? []);
  const panorama = useStore((s) => s.panoramas[expId] ?? null);
  const addTiles = useStore((s) => s.addTiles);
  const removeTile = useStore((s) => s.removeTile);
  const reorderTiles = useStore((s) => s.reorderTiles);
  const setReferenceTile = useStore((s) => s.setReferenceTile);
  const clearTiles = useStore((s) => s.clearTiles);
  const setPanorama = useStore((s) => s.setPanorama);
  const updateExperimentStage = useStore((s) => s.updateExperimentStage);

  const [equalize, setEqualize] = useState(true);
  const [showSeams, setShowSeams] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [matchedCount, setMatchedCount] = useState(0);
  const [panoImg, setPanoImg] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!panorama) {
      setPanoImg(null);
      return;
    }
    const img = new Image();
    img.onload = () => setPanoImg(img);
    img.src = panorama.dataUrl;
  }, [panorama?.dataUrl, panorama]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const uploaded = await readImageFilesToTiles(Array.from(files));
    addTiles(
      expId,
      uploaded.map((t) => ({ name: t.name, dataUrl: t.dataUrl, width: t.width, height: t.height }))
    );
    if (panorama) setPanorama(expId, null);
  };

  const runStitch = async () => {
    if (tiles.length < 2) {
      setError("至少需要 2 个视野才能拼接");
      return;
    }
    setError("");
    setRunning(true);
    setProgress(0);
    setProgressLabel("准备图像");
    await new Promise((r) => setTimeout(r, 60));
    try {
      const refIndex = Math.max(0, tiles.findIndex((t) => t.isReference));
      const grays = [];
      for (let i = 0; i < tiles.length; i++) {
        setProgressLabel(`解码视野 ${i + 1}/${tiles.length}`);
        setProgress(0.05 + (i / tiles.length) * 0.1);
        grays.push(await dataUrlToGray(tiles[i].dataUrl, 640));
        await new Promise((r) => setTimeout(r, 20));
      }
      const result = stitch(grays, refIndex < 0 ? 0 : refIndex, {
        equalize,
        onProgress: (p, label) => {
          setProgress(0.15 + p * 0.8);
          setProgressLabel(label);
        },
      });
      setProgressLabel("生成全景图");
      setProgress(0.97);
      const canvas = grayToCanvas(result.panorama);
      const pano: Panorama = {
        width: result.panorama.w,
        height: result.panorama.h,
        dataUrl: canvas.toDataURL("image/jpeg", 0.92),
        seams: result.seams,
      };
      setPanorama(expId, pano);
      setMatchedCount(result.matched.filter(Boolean).length);
      setProgress(1);
      setProgressLabel("完成");
      await new Promise((r) => setTimeout(r, 200));
    } catch (e) {
      setError(`拼接失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRunning(false);
    }
  };

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      if (!panoImg || !panorama) return;
      ctx.drawImage(panoImg, 0, 0, panorama.width, panorama.height);
      if (showSeams) {
        ctx.save();
        ctx.strokeStyle = "rgba(45,212,191,0.55)";
        ctx.lineWidth = 1 / ctx.getTransform().a;
        ctx.setLineDash([6, 4]);
        for (const s of panorama.seams) {
          ctx.strokeRect(s.x, s.y, s.w, s.h);
        }
        ctx.restore();
      }
    },
    [panoImg, panorama, showSeams]
  );

  if (!exp) {
    return (
      <>
        <PageHeader title="拼接工作台" icon={<ScanLine size={16} />} />
        <div className="flex flex-1 items-center justify-center text-sm text-ink-300">实验不存在</div>
      </>
    );
  }

  const goCount = () => {
    updateExperimentStage(expId, "count");
    navigate(`/count/${expId}`);
  };

  return (
    <>
      <PageHeader
        title={exp.name}
        subtitle="图像拼接"
        icon={<ScanLine size={16} />}
        crumbs={[{ label: "实验工作台", to: "/" }, { label: "拼接" }]}
        actions={
          <>
            {panorama && (
              <button className="btn" onClick={runStitch} disabled={running}>
                <RotateCcw size={14} />
                重新拼接
              </button>
            )}
            <button
              className="btn btn-primary"
              onClick={goCount}
              disabled={!panorama}
              title={panorama ? "进入细胞计数" : "请先完成拼接"}
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
            <TilePanel
              tiles={tiles}
              onUpload={handleFiles}
              onRemove={(id) => {
                removeTile(expId, id);
                if (panorama) setPanorama(expId, null);
              }}
              onSetRef={(id) => setReferenceTile(expId, id)}
              onMove={(id, dir) => {
                const idx = tiles.findIndex((t) => t.id === id);
                const ni = idx + dir;
                if (ni < 0 || ni >= tiles.length) return;
                const ids = tiles.map((t) => t.id);
                [ids[idx], ids[ni]] = [ids[ni], ids[idx]];
                reorderTiles(expId, ids);
                if (panorama) setPanorama(expId, null);
              }}
              onClear={() => {
                clearTiles(expId);
                setPanorama(expId, null);
              }}
            />

            <Section title="拼接参数" icon={<Layers size={13} />}>
              <div className="rounded-[3px] border border-ink-700/60 bg-ink-900/40 px-3 py-2.5">
                <Toggle
                  checked={equalize}
                  onChange={setEqualize}
                  label="亮度均衡"
                  hint="基于重叠区统计校正增益/偏置"
                />
              </div>
              <p className="mono mt-2 text-2xs text-ink-400">
                算法：Harris 角点 → NCC 匹配 → 投票位移 → 多频带拉普拉斯融合
              </p>
            </Section>

            <Section title="执行" icon={<Play size={13} />}>
              <button
                className="btn btn-primary w-full justify-center"
                onClick={runStitch}
                disabled={running || tiles.length < 2}
              >
                <Play size={14} />
                {running ? "拼接中…" : "开始拼接"}
              </button>
              {tiles.length < 2 && (
                <p className="mono mt-2 flex items-center gap-1 text-2xs text-amber-glow">
                  <AlertTriangle size={11} />
                  至少需要 2 个视野
                </p>
              )}
              {error && (
                <p className="mt-2 flex items-center gap-1 text-2xs text-coral-glow">
                  <AlertTriangle size={11} />
                  {error}
                </p>
              )}
            </Section>

            {panorama && (
              <Section title="结果" icon={<CheckCircle2 size={13} />}>
                <div className="grid grid-cols-2 gap-2">
                  <Metric label="全景尺寸" value={`${panorama.width}×${panorama.height}`} />
                  <Metric label="匹配视野" value={`${matchedCount}/${tiles.length}`} accent />
                  <Metric label="重叠区域" value={`${panorama.seams.length}`} />
                  <Metric
                    label="亮度均衡"
                    value={equalize ? "已启用" : "关闭"}
                    accent={equalize}
                  />
                </div>
              </Section>
            )}
          </div>
        </aside>

        <div className="relative flex-1 overflow-hidden">
          {tiles.length === 0 ? (
            <DropZone onUpload={handleFiles} />
          ) : !panorama ? (
            <PreStitchMontage tiles={tiles} onStitch={runStitch} running={running} />
          ) : (
            <CanvasStage
              width={panorama.width}
              height={panorama.height}
              draw={draw}
              repaintKey={panoImg}
              mode="pan"
              controls={
                <button
                  className={`pointer-events-auto icon-btn h-7 px-2 text-2xs ${showSeams ? "!border-fluor/50 !text-fluor" : ""}`}
                  onClick={() => setShowSeams((v) => !v)}
                  title="显示拼接缝"
                >
                  重叠缝
                </button>
              }
            />
          )}
          {running && <ProcessingOverlay show={running} progress={progress} label={progressLabel} />}
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
      {children}
    </section>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-[3px] border border-ink-700/60 bg-ink-900/40 px-2.5 py-2">
      <div className="mono text-2xs uppercase tracking-wider text-ink-400">{label}</div>
      <div className={`mono text-xs font-semibold tabular ${accent ? "text-fluor-glow" : "text-ink-100"}`}>{value}</div>
    </div>
  );
}

interface TilePanelProps {
  tiles: { id: string; name: string; dataUrl: string; isReference: boolean; width: number; height: number }[];
  onUpload: (files: FileList | null) => void;
  onRemove: (id: string) => void;
  onSetRef: (id: string) => void;
  onMove: (id: string, dir: number) => void;
  onClear: () => void;
}

function TilePanel({ tiles, onUpload, onRemove, onSetRef, onMove, onClear }: TilePanelProps) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <span className="field-label flex items-center gap-1.5">
          <ImageIcon size={13} className="text-ink-400" />
          视野图像
          <span className="mono ml-1 rounded bg-ink-700/50 px-1.5 text-2xs text-ink-200">{tiles.length}</span>
        </span>
        {tiles.length > 0 && (
          <button className="icon-btn h-6 px-1.5 text-2xs hover:!border-coral/50 hover:!text-coral-glow" onClick={onClear}>
            清空
          </button>
        )}
      </div>
      <button
        className="flex w-full items-center justify-center gap-2 rounded-[4px] border border-dashed border-ink-600 bg-ink-900/30 py-2.5 text-2xs text-ink-300 transition hover:border-fluor/50 hover:text-fluor-glow"
        onClick={() => fileRef.current?.click()}
      >
        <Upload size={12} />
        导入视野图片
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => onUpload(e.target.files)}
      />
      {tiles.length > 0 && (
        <div className="mt-2 flex flex-col gap-1.5">
          {tiles.map((t, i) => (
            <div
              key={t.id}
              className="group flex items-center gap-2 rounded-[3px] border border-ink-700/60 bg-ink-900/40 p-1.5"
            >
              <img
                src={t.dataUrl}
                alt={t.name}
                className="h-10 w-10 shrink-0 rounded-[2px] object-cover"
                style={{ imageRendering: "pixelated" }}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-2xs font-medium text-ink-100">{t.name}</div>
                <div className="mono text-2xs text-ink-400">
                  {t.width}×{t.height}
                </div>
              </div>
              <div className="flex items-center gap-0.5">
                <button
                  className="icon-btn h-6 w-6"
                  title="上移"
                  onClick={() => onMove(t.id, -1)}
                  disabled={i === 0}
                >
                  ↑
                </button>
                <button
                  className="icon-btn h-6 w-6"
                  title="下移"
                  onClick={() => onMove(t.id, 1)}
                  disabled={i === tiles.length - 1}
                >
                  ↓
                </button>
                <button
                  className={`icon-btn h-6 w-6 ${t.isReference ? "!border-amber/60 !text-amber" : ""}`}
                  title="设为参考视野"
                  onClick={() => onSetRef(t.id)}
                >
                  <Star size={11} fill={t.isReference ? "currentColor" : "none"} />
                </button>
                <button
                  className="icon-btn h-6 w-6 hover:!border-coral/50 hover:!text-coral-glow"
                  title="移除"
                  onClick={() => onRemove(t.id)}
                >
                  <X size={11} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function DropZone({ onUpload }: { onUpload: (files: FileList | null) => void }) {
  const [dragOver, setDragOver] = useState(false);
  return (
    <div
      className="flex h-full items-center justify-center p-8"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        onUpload(e.dataTransfer.files);
      }}
    >
      <div
        className={`flex max-w-md flex-col items-center rounded-xl border-2 border-dashed px-10 py-16 text-center transition ${
          dragOver ? "border-fluor bg-fluor/5" : "border-ink-600/70 bg-ink-900/30"
        }`}
      >
        <Upload size={32} className="text-ink-400" />
        <h3 className="mt-4 text-sm font-semibold text-ink-100">拖拽图片到此处</h3>
        <p className="mt-1 text-2xs text-ink-400">支持 PNG / JPG，可多选同一样本的不同视野</p>
        <button
          className="btn btn-primary mt-5"
          onClick={() => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = "image/*";
            input.multiple = true;
            input.onchange = () => onUpload(input.files);
            input.click();
          }}
        >
          <Upload size={14} />
          选择图片
        </button>
      </div>
    </div>
  );
}

function PreStitchMontage({
  tiles,
  onStitch,
  running,
}: {
  tiles: { id: string; name: string; dataUrl: string }[];
  onStitch: () => void;
  running: boolean;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center overflow-y-auto p-8">
      <div className="mb-5 flex items-center gap-2 text-2xs text-ink-300">
        <Sun size={13} className="text-amber" />
        已导入 {tiles.length} 个视野，点击下方按钮自动拼接
      </div>
      <div className="mb-6 flex max-w-2xl flex-wrap justify-center gap-2">
        {tiles.map((t, i) => (
          <div key={t.id} className="relative overflow-hidden rounded-[3px] border border-ink-600/70">
            <img src={t.dataUrl} alt={t.name} className="h-28 w-28 object-cover" style={{ imageRendering: "pixelated" }} />
            <span className="mono absolute left-1 top-1 rounded bg-ink-950/80 px-1 text-2xs text-ink-200">#{i + 1}</span>
          </div>
        ))}
      </div>
      <button className="btn btn-primary" onClick={onStitch} disabled={running}>
        <Play size={14} />
        {running ? "拼接中…" : "开始拼接"}
      </button>
    </div>
  );
}
