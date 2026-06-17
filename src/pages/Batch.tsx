import { useCallback, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Play,
  Square,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ScanLine,
  Target,
  Ruler,
  ListChecks,
  ArrowRight,
  Lightbulb,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Toggle } from "@/components/ui/Toggle";
import { Segmented } from "@/components/ui/Segmented";
import { Slider } from "@/components/ui/Slider";
import { useStore } from "@/store/useStore";
import type { Experiment } from "@/types";
import type { Polarity } from "@/lib/segmentation";
import { runBatch, type BatchProgress, type BatchResult, type BatchStageOptions } from "@/lib/batchPipeline";
import { cn } from "@/lib/utils";

type Stage = "stitch" | "count" | "measure";

const STAGE_META: Record<Stage, { label: string; icon: React.ReactNode }> = {
  stitch: { label: "拼接", icon: <ScanLine size={13} /> },
  count: { label: "计数", icon: <Target size={13} /> },
  measure: { label: "测量", icon: <Ruler size={13} /> },
};

type RowProgress = BatchProgress & { done?: boolean };

export default function Batch() {
  const navigate = useNavigate();
  const experiments = useStore((s) => s.experiments);
  const tiles = useStore((s) => s.tiles);
  const panoramas = useStore((s) => s.panoramas);
  const detections = useStore((s) => s.detections);
  const setFilter = useStore((s) => s.setFilter);
  const updateExperimentStage = useStore((s) => s.updateExperimentStage);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [stages, setStages] = useState<Set<Stage>>(new Set(["stitch", "count", "measure"]));
  const [polarity, setPolarity] = useState<Polarity>("bright");
  const [sensitivity, setSensitivity] = useState(0.6);
  const [minArea, setMinArea] = useState(12);
  const [useWatershed, setUseWatershed] = useState(true);
  const [equalize, setEqualize] = useState(true);

  const [running, setRunning] = useState(false);
  const [rows, setRows] = useState<Record<string, RowProgress>>({});
  const [results, setResults] = useState<BatchResult[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const cancelRef = useRef(false);

  const expList = useMemo(() => {
    return experiments.map((e) => ({
      exp: e,
      tileCount: tiles[e.id]?.length ?? 0,
      hasPanorama: !!panoramas[e.id],
      detectionCount: detections[e.id]?.length ?? 0,
      canStitch: (tiles[e.id]?.length ?? 0) >= 2,
    }));
  }, [experiments, tiles, panoramas, detections]);

  const totalSelected = selectedIds.size;
  const atLeastOne = totalSelected > 0 && stages.size > 0;

  const toggleExp = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleStage = (s: Stage) => {
    setStages((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === expList.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(expList.map((e) => e.exp.id)));
  };

  const allSelected = expList.length > 0 && selectedIds.size === expList.length;
  const partialSelected = selectedIds.size > 0 && selectedIds.size < expList.length;

  const handleUpdate = useCallback((p: BatchProgress) => {
    setRows((prev) => ({ ...prev, [p.expId]: { ...p } }));
  }, []);

  const run = async () => {
    if (!atLeastOne || running) return;
    cancelRef.current = false;
    setRunning(true);
    setResults([]);
    setRows({});
    // Seed row states
    const seedRows: Record<string, RowProgress> = {};
    for (const id of Array.from(selectedIds)) {
      seedRows[id] = {
        expId: id,
        stage: "pending",
        stageProgress: 0,
        message: "排队中",
      };
    }
    setRows(seedRows);

    const tasks = Array.from(selectedIds).map((expId) => ({
      expId,
      stages: Array.from(stages),
    }));

    // Apply filter defaults to each selected experiment's filter (just like Count page defaults)
    for (const id of selectedIds) {
      void setFilter;
    }

    const opts: BatchStageOptions = {
      polarity,
      sensitivity,
      minArea,
      watershed: useWatershed,
      equalize,
    };

    const results = await runBatch(tasks, opts, handleUpdate, () => cancelRef.current);
    setResults(results);
    // Mark done status
    setRows((prev) => {
      const next = { ...prev };
      for (const r of results) {
        next[r.expId] = {
          ...(next[r.expId] ?? { expId: r.expId, stage: "error", stageProgress: 0, message: "" }),
          stage: r.success ? "done" : "error",
          done: r.success,
          stageProgress: r.success ? 1 : 0,
          message: r.success ? "完成" : r.error ?? "失败",
          error: r.error,
        };
      }
      return next;
    });
    setRunning(false);
    void updateExperimentStage;
  };

  const cancel = () => {
    cancelRef.current = true;
  };

  return (
    <>
      <PageHeader
        title="批处理"
        subtitle="多选实验组，依次运行拼接 / 计数 / 测量流程"
        icon={<ListChecks size={16} />}
        crumbs={[{ label: "实验工作台", to: "/" }, { label: "批处理" }]}
        actions={
          <>
            {running ? (
              <button className="btn" onClick={cancel}>
                <Square size={14} />
                停止
              </button>
            ) : (
              <button className="btn btn-primary" onClick={run} disabled={!atLeastOne}>
                <Play size={14} />
                批量处理 {totalSelected > 0 ? `(${totalSelected})` : ""}
              </button>
            )}
          </>
        }
      />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-6 py-6">
          <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-3">
            <ConfigPanel
              title="处理阶段"
              icon={<Play size={13} />}
              body={
                <div className="flex flex-wrap items-center gap-2">
                  {(Object.keys(STAGE_META) as Stage[]).map((k) => {
                    const meta = STAGE_META[k];
                    const on = stages.has(k);
                    return (
                      <button
                        key={k}
                        className={cn(
                          "flex items-center gap-1.5 rounded-[3px] border px-2.5 py-1.5 text-xs transition",
                          on
                            ? "border-fluor/50 bg-fluor/10 text-fluor-glow"
                            : "border-ink-600/70 bg-ink-800/40 text-ink-200 hover:border-ink-500"
                        )}
                        onClick={() => toggleStage(k)}
                      >
                        {meta.icon}
                        {meta.label}
                      </button>
                    );
                  })}
                </div>
              }
              hint="建议按顺序启用；只有在有视野图像的前提下才能拼接，只有在有全景图的前提下才能计数。"
            />
            <ConfigPanel
              title="自动检测"
              icon={<Target size={13} />}
              body={
                <div className="flex flex-col gap-3">
                  <Segmented
                    options={[
                      { value: "bright" as Polarity, label: "亮目标" },
                      { value: "dark" as Polarity, label: "暗目标" },
                    ]}
                    value={polarity}
                    onChange={setPolarity}
                  />
                  <div>
                    <div className="mono mb-1 text-2xs text-ink-300">灵敏度 · {sensitivity.toFixed(2)}</div>
                    <Slider value={sensitivity} min={0.1} max={0.95} step={0.05} onChange={setSensitivity} />
                  </div>
                  <div>
                    <div className="mono mb-1 text-2xs text-ink-300">最小面积 · {minArea} px</div>
                    <Slider value={minArea} min={3} max={120} step={1} onChange={setMinArea} />
                  </div>
                  <Toggle
                    checked={useWatershed}
                    onChange={setUseWatershed}
                    label="分水岭分割"
                    hint="分离粘连目标"
                  />
                </div>
              }
            />
            <ConfigPanel
              title="图像增强"
              icon={<Lightbulb size={13} />}
              body={
                <Toggle
                  checked={equalize}
                  onChange={setEqualize}
                  label="亮度均衡"
                  hint="跨视野统一曝光"
                />
              }
              hint="批量拼接时若不同视野亮度差异大，建议开启；否则可能引入伪影。"
            />
          </div>

          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ListChecks size={14} className="text-fluor" />
              <span className="field-label">选择实验组</span>
              <span className="mono text-2xs text-ink-400">
                已选 {selectedIds.size}/{expList.length}
              </span>
            </div>
            <button
              className="text-2xs text-ink-300 hover:text-fluor-glow"
              onClick={toggleAll}
            >
              {allSelected ? "取消全选" : partialSelected ? "全选" : "全选"}
            </button>
          </div>

          <div className="panel-raised overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 z-10 bg-ink-850/95 backdrop-blur">
                <tr className="mono text-2xs uppercase tracking-wider text-ink-300">
                  <th className="w-8 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = partialSelected;
                      }}
                      onChange={toggleAll}
                      className="accent-fluor"
                    />
                  </th>
                  <th className="px-3 py-2 text-left">实验</th>
                  <th className="mono px-3 py-2 text-right">视野</th>
                  <th className="mono px-3 py-2 text-right">全景图</th>
                  <th className="mono px-3 py-2 text-right">检测数</th>
                  <th className="px-3 py-2 text-center">状态</th>
                  <th className="w-10 px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {expList.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-10 text-center text-ink-400">
                      暂无实验，请先回到工作台创建或导入项目包
                    </td>
                  </tr>
                )}
                {expList.map((row) => (
                  <ExpRow
                    key={row.exp.id}
                    row={row}
                    selected={selectedIds.has(row.exp.id)}
                    onToggle={() => toggleExp(row.exp.id)}
                    progress={rows[row.exp.id]}
                    result={results.find((r) => r.expId === row.exp.id)}
                    expanded={expanded.has(row.exp.id)}
                    onToggleExpand={() =>
                      setExpanded((prev) => {
                        const next = new Set(prev);
                        if (next.has(row.exp.id)) next.delete(row.exp.id);
                        else next.add(row.exp.id);
                        return next;
                      })
                    }
                    onOpenStitch={() => navigate(`/stitch/${row.exp.id}`)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

function ConfigPanel({
  title,
  icon,
  body,
  hint,
}: {
  title: string;
  icon: React.ReactNode;
  body: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="panel flex flex-col gap-2 p-4">
      <div className="flex items-center gap-1.5">
        <span className="text-ink-400">{icon}</span>
        <span className="field-label">{title}</span>
      </div>
      <div>{body}</div>
      {hint && <div className="mono text-2xs text-ink-500">{hint}</div>}
    </div>
  );
}

function ExpRow({
  row,
  selected,
  onToggle,
  progress,
  result,
  expanded,
  onToggleExpand,
  onOpenStitch,
}: {
  row: {
    exp: Experiment;
    tileCount: number;
    hasPanorama: boolean;
    detectionCount: number;
    canStitch: boolean;
  };
  selected: boolean;
  onToggle: () => void;
  progress?: RowProgress;
  result?: BatchResult;
  expanded: boolean;
  onToggleExpand: () => void;
  onOpenStitch: () => void;
}) {
  const busy = !!progress && progress.stage !== "pending" && progress.stage !== "done" && progress.stage !== "error";
  const error = progress?.error || result?.error;
  const success = progress?.stage === "done";

  return (
    <>
      <tr
        className={cn(
          "border-t border-ink-700/40 transition hover:bg-fluor/5",
          selected && "!bg-fluor/10",
          error && "!bg-red/5"
        )}
      >
        <td className="px-3 py-2">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            className="accent-fluor"
          />
        </td>
        <td className="px-3 py-2">
          <div className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: row.exp.color, boxShadow: `0 0 6px ${row.exp.color}` }}
            />
            <span className="text-ink-50 font-medium">{row.exp.name}</span>
            {!row.canStitch && (
              <span className="mono rounded bg-amber/10 px-1 py-0.5 text-2xs text-amber">
                <AlertTriangle size={10} className="mr-0.5 inline" />
                视野不足
              </span>
            )}
          </div>
        </td>
        <td className="mono px-3 py-2 text-right tabular text-ink-200">{row.tileCount}</td>
        <td className="mono px-3 py-2 text-right tabular text-ink-200">
          {row.hasPanorama ? <CheckCircle2 size={13} className="ml-auto text-fluor" /> : "—"}
        </td>
        <td className="mono px-3 py-2 text-right tabular text-ink-200">{row.detectionCount || "—"}</td>
        <td className="px-3 py-2 text-center">
          {!progress && <span className="mono text-2xs text-ink-400">待处理</span>}
          {progress && progress.stage === "pending" && (
            <span className="mono text-2xs text-ink-400">排队中</span>
          )}
          {busy && (
            <span className="mono inline-flex items-center gap-1 text-2xs text-fluor-glow">
              <Loader2 size={11} className="animate-spin" />
              {STAGE_META[progress.stage as Stage]?.label ?? progress.stage}
              <span className="text-ink-400">{Math.round(progress.stageProgress * 100)}%</span>
            </span>
          )}
          {success && (
            <span className="mono inline-flex items-center gap-1 text-2xs text-fluor">
              <CheckCircle2 size={11} />
              完成
            </span>
          )}
          {progress?.stage === "error" && (
            <span className="mono inline-flex items-center gap-1 text-2xs text-red">
              <AlertTriangle size={11} />
              失败
            </span>
          )}
        </td>
        <td className="px-3 py-2 text-right">
          <div className="inline-flex items-center gap-1">
            {(progress?.stage === "stitch" || progress?.stage === "count" || progress?.stage === "measure") && (
              <div className="h-1 w-16 overflow-hidden rounded-full bg-ink-700/60">
                <div
                  className="h-full bg-fluor"
                  style={{ width: `${Math.max(2, Math.round((progress.stageProgress ?? 0) * 100))}%` }}
                />
              </div>
            )}
            <button
              className={cn(
                "icon-btn h-6 w-6",
                !error && !result && "opacity-0 group-hover:opacity-100"
              )}
              onClick={onToggleExpand}
              title={error ? "查看错误" : "查看详情"}
            >
              {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="border-t border-ink-800/50 bg-ink-900/50">
          <td colSpan={7} className="px-6 py-3">
            <div className="flex flex-col gap-2">
              {progress && (
                <div className="flex items-start gap-2">
                  <span className="mono text-2xs uppercase tracking-wider text-ink-400">最新消息</span>
                  <span className="text-xs text-ink-100">{progress.message}</span>
                </div>
              )}
              {error && (
                <div className="flex items-start gap-2">
                  <span className="mono text-2xs uppercase tracking-wider text-red">错误信息</span>
                  <span className="mono whitespace-pre-wrap break-words text-2xs text-red">{error}</span>
                </div>
              )}
              {result && !error && result.stagesDone.length > 0 && (
                <div className="flex items-start gap-2">
                  <span className="mono text-2xs uppercase tracking-wider text-ink-400">完成阶段</span>
                  <div className="flex flex-wrap gap-1.5">
                    {result.stagesDone.map((s) => (
                      <span
                        key={s}
                        className="mono inline-flex items-center gap-1 rounded bg-fluor/10 px-1.5 py-0.5 text-2xs text-fluor-glow"
                      >
                        {STAGE_META[s].icon}
                        {STAGE_META[s].label}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2">
                <button className="btn h-7 px-2 text-2xs" onClick={onOpenStitch}>
                  打开实验
                  <ArrowRight size={12} />
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
