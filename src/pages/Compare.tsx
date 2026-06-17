import { useMemo, useState } from "react";
import {
  GitCompareArrows,
  Download,
  Image as ImageIcon,
  BarChart3,
  Table2,
  CheckCircle2,
  FileSpreadsheet,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Segmented } from "@/components/ui/Segmented";
import { useStore } from "@/store/useStore";
import { loadImageEl } from "@/lib/image";
import { defaultFilter, filterDetections, summaryStats, aspectRatioOf, fmt } from "@/lib/analysis";
import type { Experiment, Panorama, Detection, MorphFilter } from "@/types";
import { cn } from "@/lib/utils";

type Metric = "count" | "meanArea" | "meanCircularity" | "meanPerimeter";

const METRIC_OPTIONS = [
  { value: "count" as Metric, label: "计数" },
  { value: "meanArea" as Metric, label: "均值面积" },
  { value: "meanCircularity" as Metric, label: "均值圆度" },
  { value: "meanPerimeter" as Metric, label: "均值周长" },
];
const METRIC_LABEL: Record<Metric, string> = {
  count: "目标计数",
  meanArea: "均值面积 (px²)",
  meanCircularity: "均值圆度",
  meanPerimeter: "均值周长 (px)",
};

interface GroupData {
  exp: Experiment;
  panorama: Panorama | null;
  detections: Detection[];
  filtered: Detection[];
}

export default function Compare() {
  const experiments = useStore((s) => s.experiments);
  const panoramas = useStore((s) => s.panoramas);
  const detections = useStore((s) => s.detections);
  const filters = useStore((s) => s.filters);

  const groups = useMemo<GroupData[]>(() => {
    return experiments
      .map((exp) => ({
        exp,
        panorama: panoramas[exp.id] ?? null,
        detections: detections[exp.id] ?? [],
        filtered: filterDetections(detections[exp.id] ?? [], filters[exp.id] ?? defaultFilter()),
      }))
      .filter((g) => g.detections.length > 0);
  }, [experiments, panoramas, detections, filters]);

  const [selected, setSelected] = useState<Set<string>>(() => new Set(groups.map((g) => g.exp.id)));
  const [metric, setMetric] = useState<Metric>("count");

  const visible = groups.filter((g) => selected.has(g.exp.id));

  const chart = useMemo(() => {
    const rows = visible.map((g) => {
      let value = 0;
      if (metric === "count") value = g.filtered.length;
      else if (metric === "meanArea") value = summaryStats(g.filtered, "area").mean;
      else if (metric === "meanCircularity") value = summaryStats(g.filtered, "circularity").mean;
      else value = summaryStats(g.filtered, "perimeter").mean;
      return { exp: g.exp, value };
    });
    const maxV = Math.max(1, ...rows.map((r) => r.value));
    return { rows, maxV };
  }, [visible, metric]);

  const exportSummary = () => {
    const rows = [
      ["实验组", "类型", "标尺(µm/px)", "计数", "总面积(px²)", "均值面积(px²)", "均值周长(px)", "均值圆度", "均值长轴(px)", "均值长短轴比"],
      ...visible.map((g) => {
        const a = summaryStats(g.filtered, "area");
        const p = summaryStats(g.filtered, "perimeter");
        const c = summaryStats(g.filtered, "circularity");
        const mj = summaryStats(g.filtered, "majorAxis");
        const ar = g.filtered.length ? g.filtered.reduce((s, d) => s + aspectRatioOf(d), 0) / g.filtered.length : 0;
        return [
          g.exp.name,
          g.exp.type,
          g.exp.scale,
          g.filtered.length,
          g.filtered.reduce((s, d) => s + d.area, 0),
          a.mean.toFixed(1),
          p.mean.toFixed(2),
          c.mean.toFixed(3),
          mj.mean.toFixed(2),
          ar.toFixed(2),
        ];
      }),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    downloadBlob(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }), "group_comparison.csv");
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (groups.length === 0) {
    return (
      <>
        <PageHeader title="对比与导出" subtitle="多组结果汇总" icon={<GitCompareArrows size={16} />} />
        <div className="flex flex-1 flex-col items-center justify-center text-sm text-ink-300">
          <BarChart3 size={28} className="mb-3 text-ink-500" />
          暂无可对比的实验组（需先完成计数）
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="对比与导出"
        subtitle="多组结果汇总 · 标注图像导出"
        icon={<GitCompareArrows size={16} />}
        crumbs={[{ label: "实验工作台", to: "/" }, { label: "对比" }]}
        actions={
          <>
            <button className="btn" onClick={exportSummary} disabled={visible.length === 0}>
              <FileSpreadsheet size={14} />
              汇总 CSV
            </button>
            <button className="btn btn-primary" onClick={exportSummary} disabled={visible.length === 0}>
              <Download size={14} />
              导出统计
            </button>
          </>
        }
      />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-6 py-6">
          <div className="mb-5">
            <div className="field-label mb-2">选择实验组</div>
            <div className="flex flex-wrap gap-2">
              {groups.map((g) => {
                const on = selected.has(g.exp.id);
                return (
                  <button
                    key={g.exp.id}
                    onClick={() => toggle(g.exp.id)}
                    className={cn(
                      "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition",
                      on
                        ? "border-fluor/50 bg-fluor/10 text-fluor-glow"
                        : "border-ink-600/70 bg-ink-800/50 text-ink-300 hover:border-ink-500"
                    )}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ background: g.exp.color }} />
                    {g.exp.name}
                    <span className="mono text-2xs text-ink-400">{g.filtered.length}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {visible.length > 0 && (
            <>
              <div className="panel-raised mb-5 p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BarChart3 size={15} className="text-fluor" />
                    <span className="text-sm font-semibold text-ink-50">组间对比</span>
                  </div>
                  <Segmented options={METRIC_OPTIONS} value={metric} onChange={setMetric} />
                </div>
                <BarChart rows={chart.rows} maxV={chart.maxV} metricLabel={METRIC_LABEL[metric]} />
              </div>

              <div className="mb-3 flex items-center gap-2">
                <Table2 size={14} className="text-fluor" />
                <span className="field-label">统计汇总表</span>
              </div>
              <div className="panel-raised mb-6 overflow-hidden">
                <div className="overflow-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-ink-850/95">
                      <tr className="mono text-2xs uppercase tracking-wider text-ink-300">
                        <th className="px-3 py-2">实验组</th>
                        <th className="px-3 py-2 text-right">计数</th>
                        <th className="px-3 py-2 text-right">总面积</th>
                        <th className="px-3 py-2 text-right">均值面积</th>
                        <th className="px-3 py-2 text-right">均值周长</th>
                        <th className="px-3 py-2 text-right">均值圆度</th>
                        <th className="px-3 py-2 text-right">均值长短轴比</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((g) => {
                        const a = summaryStats(g.filtered, "area");
                        const p = summaryStats(g.filtered, "perimeter");
                        const c = summaryStats(g.filtered, "circularity");
                        const ar = g.filtered.length
                          ? g.filtered.reduce((s, d) => s + aspectRatioOf(d), 0) / g.filtered.length
                          : 0;
                        return (
                          <tr key={g.exp.id} className="border-t border-ink-700/40 hover:bg-fluor/5">
                            <td className="px-3 py-2">
                              <span className="flex items-center gap-2">
                                <span className="h-2 w-2 rounded-full" style={{ background: g.exp.color }} />
                                <span className="font-medium text-ink-100">{g.exp.name}</span>
                              </span>
                            </td>
                            <td className="mono px-3 py-2 text-right tabular text-fluor-glow">{g.filtered.length}</td>
                            <td className="mono px-3 py-2 text-right tabular text-ink-100">{fmt(g.filtered.reduce((s, d) => s + d.area, 0), 0)}</td>
                            <td className="mono px-3 py-2 text-right tabular text-ink-100">{fmt(a.mean)}</td>
                            <td className="mono px-3 py-2 text-right tabular text-ink-100">{fmt(p.mean)}</td>
                            <td className="mono px-3 py-2 text-right tabular text-ink-100">{fmt(c.mean, 3)}</td>
                            <td className="mono px-3 py-2 text-right tabular text-ink-100">{fmt(ar, 2)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mb-3 flex items-center gap-2">
                <ImageIcon size={14} className="text-fluor" />
                <span className="field-label">标注图像导出</span>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {visible.map((g) => (
                  <AnnotatedExportCard
                    key={g.exp.id}
                    exp={g.exp}
                    panorama={g.panorama}
                    detections={g.detections}
                    filter={filters[g.exp.id] ?? defaultFilter()}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function BarChart({
  rows,
  maxV,
  metricLabel,
}: {
  rows: { exp: Experiment; value: number }[];
  maxV: number;
  metricLabel: string;
}) {
  const chartH = 220;
  const barW = 48;
  const gap = 24;
  const totalW = rows.length * (barW + gap);
  return (
    <div className="overflow-x-auto">
      <div className="relative" style={{ width: Math.max(totalW, 320), height: chartH + 40 }}>
        <svg width={Math.max(totalW, 320)} height={chartH + 40} className="overflow-visible">
          {[0, 0.25, 0.5, 0.75, 1].map((t) => (
            <g key={t}>
              <line
                x1={0}
                x2={Math.max(totalW, 320)}
                y1={chartH - t * chartH + 10}
                y2={chartH - t * chartH + 10}
                stroke="#1e242f"
                strokeWidth={1}
              />
              <text
                x={4}
                y={chartH - t * chartH + 7}
                className="mono"
                fill="#5b6472"
                fontSize={9}
              >
                {fmt(t * maxV, 0)}
              </text>
            </g>
          ))}
          {rows.map((r, i) => {
            const h = (r.value / maxV) * chartH;
            const x = i * (barW + gap) + gap;
            return (
              <g key={r.exp.id}>
                <rect
                  x={x}
                  y={chartH - h + 10}
                  width={barW}
                  height={Math.max(2, h)}
                  rx={3}
                  fill={r.exp.color}
                  opacity={0.85}
                />
                <text
                  x={x + barW / 2}
                  y={chartH - h + 4}
                  textAnchor="middle"
                  className="mono"
                  fill="#e2e8f0"
                  fontSize={10}
                  fontWeight={600}
                >
                  {fmt(r.value, r.value < 10 ? 1 : 0)}
                </text>
                <text
                  x={x + barW / 2}
                  y={chartH + 26}
                  textAnchor="middle"
                  fill="#94a3b8"
                  fontSize={10}
                >
                  {r.exp.name.length > 8 ? r.exp.name.slice(0, 7) + "…" : r.exp.name}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="mono mt-1 text-2xs text-ink-400">纵轴：{metricLabel}</div>
    </div>
  );
}

function AnnotatedExportCard({
  exp,
  panorama,
  detections,
  filter,
}: {
  exp: Experiment;
  panorama: Panorama | null;
  detections: Detection[];
  filter: MorphFilter;
}) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const exportPng = async () => {
    if (!panorama) return;
    setBusy(true);
    try {
      const img = await loadImageEl(panorama.dataUrl);
      const canvas = document.createElement("canvas");
      canvas.width = panorama.width;
      canvas.height = panorama.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const lw = Math.max(1, panorama.width / 500);
      ctx.lineWidth = lw;
      for (const d of detections) {
        const pass = d.manual || (filterDetections([d], filter).length > 0);
        if (!pass) continue;
        ctx.save();
        ctx.translate(d.cx, d.cy);
        ctx.rotate(d.angle);
        ctx.strokeStyle = d.manual ? "#fbbf24" : "#2dd4bf";
        ctx.beginPath();
        ctx.ellipse(0, 0, Math.max(1, d.majorAxis), Math.max(1, d.minorAxis), 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      const barPx = 100 / exp.scale;
      const by = panorama.height - 16;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = Math.max(2, lw * 2);
      ctx.beginPath();
      ctx.moveTo(16, by);
      ctx.lineTo(16 + barPx, by);
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.font = `${Math.max(10, panorama.width / 60)}px monospace`;
      ctx.fillText("100 µm", 16, by - 6);
      canvas.toBlob((blob) => {
        if (blob) downloadBlob(blob, `${exp.name}_annotated.png`);
      }, "image/png");
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel flex flex-col p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: exp.color }} />
        <span className="truncate text-xs font-medium text-ink-100">{exp.name}</span>
        <span className="mono ml-auto text-2xs text-ink-400">{detections.length} 标记</span>
      </div>
      {panorama ? (
        <div className="relative mb-3 overflow-hidden rounded-[3px] border border-ink-700/60 bg-ink-950">
          <img src={panorama.dataUrl} alt={exp.name} className="h-32 w-full object-cover" style={{ imageRendering: "pixelated" }} />
        </div>
      ) : (
        <div className="mb-3 flex h-32 items-center justify-center rounded-[3px] border border-ink-700/60 bg-ink-950 text-2xs text-ink-500">
          无全景图
        </div>
      )}
      <button className="btn w-full justify-center" onClick={exportPng} disabled={busy || !panorama}>
        {done ? (
          <>
            <CheckCircle2 size={13} className="text-fluor" />
            已导出
          </>
        ) : busy ? (
          "生成中…"
        ) : (
          <>
            <Download size={13} />
            导出标注 PNG
          </>
        )}
      </button>
    </div>
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
