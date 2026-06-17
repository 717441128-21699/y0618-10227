import { useMemo, useState } from "react";
import {
  GitCompareArrows,
  Download,
  Image as ImageIcon,
  BarChart3,
  Table2,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  Printer,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Segmented } from "@/components/ui/Segmented";
import { useStore } from "@/store/useStore";
import { loadImageEl } from "@/lib/image";
import { defaultFilter, filterDetections, summaryStats, aspectRatioOf, fmt } from "@/lib/analysis";
import type { Experiment, Panorama, Detection, MorphFilter } from "@/types";
import { downloadCsv, downloadBlob, sanitizeName } from "@/lib/export";
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
  filter: MorphFilter;
}

export default function Compare() {
  const experiments = useStore((s) => s.experiments);
  const panoramas = useStore((s) => s.panoramas);
  const detections = useStore((s) => s.detections);
  const filters = useStore((s) => s.filters);

  const groups = useMemo<GroupData[]>(() => {
    return experiments
      .map((exp) => {
        const filter = filters[exp.id] ?? defaultFilter();
        const dets = detections[exp.id] ?? [];
        return {
          exp,
          panorama: panoramas[exp.id] ?? null,
          detections: dets,
          filtered: filterDetections(dets, filter),
          filter,
        };
      })
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
    downloadCsv(rows, "group_comparison.csv");
  };

  const exportReports = () => Promise.all(visible.map((g) => g.panorama ? exportAnnotatedPng({ exp: g.exp, panorama: g.panorama, detections: g.detections, filter: g.filter }) : Promise.resolve()));

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openReport = async () => {
    await renderReportHtml(visible);
  };

  const printReport = async () => {
    const win = await renderReportHtml(visible, { inWindow: true });
    setTimeout(() => win.focus(), 300);
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
            <button className="btn" onClick={exportReports} disabled={visible.length === 0}>
              <ImageIcon size={14} />
              全部 PNG
            </button>
            <button className="btn" onClick={openReport} disabled={visible.length === 0}>
              <FileText size={14} />
              实验报告
            </button>
            <button className="btn btn-primary" onClick={printReport} disabled={visible.length === 0}>
              <Printer size={14} />
              打印 / PDF
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
      await exportAnnotatedPng({ exp, panorama, detections, filter });
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

interface AnnotatedInput {
  exp: Experiment;
  panorama: Panorama;
  detections: Detection[];
  filter: MorphFilter;
}

async function renderAnnotatedCanvas(input: AnnotatedInput): Promise<HTMLCanvasElement> {
  const { exp, panorama, detections, filter } = input;
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
    ctx.lineWidth = lw * 1.1;
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
  return canvas;
}

async function exportAnnotatedPng(input: AnnotatedInput): Promise<void> {
  const canvas = await renderAnnotatedCanvas(input);
  await new Promise<void>((resolve) => {
    canvas.toBlob((blob) => {
      if (blob) downloadBlob(blob, `${sanitizeName(input.exp.name)}_annotated.png`);
      resolve();
    }, "image/png");
  });
}

function buildGroupSummary(groups: GroupData[]): { rows: unknown[][]; table: string } {
  const headers = [
    "实验组", "类型", "标尺(µm/px)", "计数", "总面积(px²)",
    "均值面积", "中位面积", "面积标准差",
    "均值周长", "均值圆度", "中位圆度",
    "均值长短轴比",
  ];
  const rows: unknown[][] = [headers];
  for (const g of groups) {
    const a = summaryStats(g.filtered, "area");
    const p = summaryStats(g.filtered, "perimeter");
    const c = summaryStats(g.filtered, "circularity");
    const ars = g.filtered.map((d) => aspectRatioOf(d));
    const ar = ars.length ? ars.reduce((s, v) => s + v, 0) / ars.length : 0;
    rows.push([
      g.exp.name,
      g.exp.type,
      g.exp.scale,
      g.filtered.length,
      g.filtered.reduce((s, d) => s + d.area, 0),
      a.mean,
      a.median,
      a.std,
      p.mean,
      c.mean,
      c.median,
      ar,
    ]);
  }
  const table =
    `<table class="ms-table"><thead><tr>${rows[0].map(h => `<th>${String(h)}</th>`).join("")}</tr></thead><tbody>` +
    rows.slice(1).map(r => `<tr>${r.map(c => `<td>${String(c)}</td>`).join("")}</tr>`).join("") +
    "</tbody></table>";
  return { rows, table };
}

function drawHistograms(groups: GroupData[]): Promise<string> {
  const metrics = [
    { key: "area", title: "面积", color: "#2dd4bf", valuesOf: (d: Detection) => d.area },
    { key: "circularity", title: "圆度", color: "#fbbf24", valuesOf: (d: Detection) => d.circularity },
    {
      key: "aspect",
      title: "长短轴比",
      color: "#a78bfa",
      valuesOf: (d: Detection) => aspectRatioOf(d),
    },
  ];
  let html = '<div class="ms-grid-3">';
  for (const m of metrics) {
    const bins = 22;
    const valueSets: { group: GroupData; values: number[]; min: number; max: number }[] = groups.map(g => {
      const vals = g.filtered.map(m.valuesOf);
      return { group: g, values: vals, min: Math.min(...vals, Infinity), max: Math.max(...vals, -Infinity) };
    });
    let globMin = Infinity;
    let globMax = -Infinity;
    for (const v of valueSets) {
      if (v.min < globMin) globMin = v.min;
      if (v.max > globMax) globMax = v.max;
    }
    if (!Number.isFinite(globMin) || globMax - globMin < 1e-9) {
      html += `<div class="ms-card"><h3>${m.title}</h3><div class="ms-empty">无数据</div></div>`;
      continue;
    }
    const width = Math.max(globMin - 0.1, 0);
    globMax = globMax + (globMax - globMin) * 0.05;
    globMin = globMin === 0 ? globMin : width;
    void width;
    const barData = valueSets.map(vs => {
      const counts = new Array(bins).fill(0);
      const step = (globMax - globMin) / bins;
      for (const v of vs.values) {
        let idx = Math.floor((v - globMin) / step);
        if (idx >= bins) idx = bins - 1;
        if (idx < 0) idx = 0;
        counts[idx]++;
      }
      return { group: vs.group, counts, max: Math.max(...counts, 1) };
    });
    const maxCount = Math.max(...barData.map(b => b.max), 1);
    html += `<div class="ms-card"><h3>${m.title}</h3>`;
    html += `<svg viewBox="0 0 500 240" width="100%" preserveAspectRatio="none" style="height:220px">`;
    for (let i = 0; i <= 4; i++) {
      const y = 20 + (200 * i) / 4;
      html += `<line x1="40" x2="480" y1="${y}" y2="${y}" stroke="#26303d" />`;
      html += `<text x="8" y="${y + 3}" fill="#64748b" font-size="9" font-family="monospace">${fmt(maxCount * (1 - i / 4), 0)}</text>`;
    }
    const totalW = 440;
    const perBar = totalW / bins;
    const perGroup = perBar / Math.max(1, groups.length);
    barData.forEach((bd, gi) => {
      bd.counts.forEach((count, bi) => {
        const h = 200 * (count / maxCount);
        const x = 40 + bi * perBar + gi * perGroup + 1;
        const y = 20 + 200 - h;
        html += `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${(perGroup - 2).toFixed(2)}" height="${h.toFixed(2)}" fill="${bd.group.exp.color}" opacity="0.85"/>`;
      });
    });
    html += `<text x="30" y="230" fill="#64748b" font-size="9" font-family="monospace">${fmt(globMin, m.title === "圆度" ? 2 : 1)}</text>`;
    html += `<text x="460" y="230" fill="#64748b" font-size="9" text-anchor="end" font-family="monospace">${fmt(globMax, m.title === "圆度" ? 2 : 1)}</text>`;
    html += "</svg>";
    html += `<div class="ms-legend">${groups.map(g => `<span><i style="background:${g.exp.color}"></i>${g.exp.name}</span>`).join("")}</div>`;
    html += "</div>";
  }
  html += "</div>";
  return Promise.resolve(html);
}

async function renderChartPng(groups: GroupData[]): Promise<string | null> {
  if (groups.length === 0) return null;
  const metrics = [
    { key: "count", label: "计数", valueOf: (g: GroupData) => g.filtered.length },
    { key: "meanArea", label: "均值面积", valueOf: (g: GroupData) => summaryStats(g.filtered, "area").mean },
    { key: "meanCircularity", label: "均值圆度", valueOf: (g: GroupData) => summaryStats(g.filtered, "circularity").mean },
    { key: "meanPerimeter", label: "均值周长", valueOf: (g: GroupData) => summaryStats(g.filtered, "perimeter").mean },
  ];
  const cardW = 260;
  const cardH = 260;
  const gap = 24;
  const cols = Math.min(2, metrics.length);
  const rows = Math.ceil(metrics.length / cols);
  const totalW = cols * cardW + (cols + 1) * gap;
  const totalH = rows * cardH + (rows + 1) * gap + 40;
  const canvas = document.createElement("canvas");
  canvas.width = totalW;
  canvas.height = totalH;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#0f131a";
  ctx.fillRect(0, 0, totalW, totalH);
  ctx.fillStyle = "#e2e8f0";
  ctx.font = "700 16px sans-serif";
  ctx.fillText("组间对比", gap, 24);
  for (let mi = 0; mi < metrics.length; mi++) {
    const metric = metrics[mi];
    const cx = (mi % cols) * (cardW + gap) + gap;
    const cy = Math.floor(mi / cols) * (cardH + gap) + gap + 10;
    ctx.fillStyle = "#141a24";
    roundRect(ctx, cx, cy, cardW, cardH, 6);
    ctx.fill();
    ctx.strokeStyle = "#242e3d";
    ctx.lineWidth = 1;
    roundRect(ctx, cx, cy, cardW, cardH, 6);
    ctx.stroke();
    ctx.fillStyle = "#94a3b8";
    ctx.font = "600 12px sans-serif";
    ctx.fillText(metric.label, cx + 14, cy + 22);
    const values = groups.map(g => ({ g, v: metric.valueOf(g) }));
    const max = Math.max(...values.map(x => x.v), 1);
    const barW = (cardW - 2 * 14 - (groups.length - 1) * 6) / groups.length;
    values.forEach((x, i) => {
      const bx = cx + 14 + i * (barW + 6);
      const h = ((cardH - 80) * x.v) / max;
      const by = cy + cardH - 34 - h;
      ctx.fillStyle = x.g.exp.color;
      roundRect(ctx, bx, by, barW, h, 3);
      ctx.fill();
      ctx.fillStyle = "#e2e8f0";
      ctx.font = "700 10px monospace";
      ctx.textAlign = "center";
      ctx.fillText(fmt(x.v, x.v < 10 ? 1 : 0), bx + barW / 2, by - 4);
      ctx.fillStyle = "#64748b";
      ctx.font = "600 10px sans-serif";
      const name = x.g.exp.name.length > 6 ? x.g.exp.name.slice(0, 5) + "…" : x.g.exp.name;
      ctx.fillText(name, bx + barW / 2, cy + cardH - 18);
      ctx.textAlign = "start";
    });
  }
  return canvas.toDataURL("image/png");
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

async function renderReportHtml(groups: GroupData[], opts: { inWindow?: boolean } = {}): Promise<Window> {
  const today = new Date().toLocaleString("zh-CN");
  const { rows, table } = buildGroupSummary(groups);
  const histograms = await drawHistograms(groups);
  const chartPng = await renderChartPng(groups);

  const panoramaImages: { name: string; color: string; png: string | null; summary: string }[] = [];
  for (const g of groups) {
    let png: string | null = null;
    if (g.panorama) {
      const canvas = await renderAnnotatedCanvas({ exp: g.exp, panorama: g.panorama, detections: g.detections, filter: g.filter });
      png = canvas.toDataURL("image/png", 0.9);
    }
    const a = summaryStats(g.filtered, "area");
    const c = summaryStats(g.filtered, "circularity");
    panoramaImages.push({
      name: g.exp.name,
      color: g.exp.color,
      png,
      summary:
        `计数 ${g.filtered.length} · 均值面积 ${fmt(a.mean)} px² · 中位圆度 ${fmt(c.median, 2)} · 标尺 ${g.exp.scale} µm/px`,
    });
  }

  const css = `
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body { font-family: "IBM Plex Sans", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif; color: #1e2430; background: #ffffff; max-width: 960px; margin: 0 auto; padding: 48px 40px 64px; }
    h1 { font-size: 26px; margin: 0 0 4px; color: #0f172a; letter-spacing: 0.01em; }
    .meta { color: #64748b; font-size: 12px; font-family: "IBM Plex Mono", ui-monospace, monospace; margin-bottom: 32px; }
    .ms-section { margin-top: 40px; }
    .ms-section h2 { font-size: 16px; margin: 0 0 16px; color: #0f172a; padding-bottom: 8px; border-bottom: 1px solid #e2e8f0; }
    .ms-metric-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
    .ms-metric { border: 1px solid #e2e8f0; border-radius: 6px; padding: 14px; background: #f8fafc; }
    .ms-metric .k { font-family: "IBM Plex Mono", monospace; font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; }
    .ms-metric .v { font-size: 20px; font-weight: 700; color: #0f172a; margin-top: 4px; font-variant-numeric: tabular-nums; }
    .ms-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .ms-table th, .ms-table td { border: 1px solid #e2e8f0; padding: 8px 10px; text-align: right; font-variant-numeric: tabular-nums; }
    .ms-table th:first-child, .ms-table td:first-child, .ms-table th:nth-child(2), .ms-table td:nth-child(2) { text-align: left; }
    .ms-table th { background: #f1f5f9; color: #0f172a; font-weight: 600; font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase; }
    .ms-table tbody tr:nth-child(2n) { background: #fafbfc; }
    .ms-grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
    .ms-card { border: 1px solid #e2e8f0; border-radius: 6px; padding: 14px; background: #ffffff; }
    .ms-card h3 { margin: 0 0 10px; font-size: 13px; color: #0f172a; }
    .ms-empty { color: #94a3b8; font-size: 12px; padding: 20px 0; text-align: center; }
    .ms-legend { margin-top: 8px; display: flex; gap: 10px; flex-wrap: wrap; }
    .ms-legend span { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; color: #475569; }
    .ms-legend i { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
    .ms-panos { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 18px; }
    .ms-pano { border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; background: #fafbfc; }
    .ms-pano-head { padding: 10px 14px; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid #e2e8f0; background: #ffffff; }
    .ms-pano-swatch { width: 10px; height: 10px; border-radius: 9999px; }
    .ms-pano-name { font-size: 13px; font-weight: 600; color: #0f172a; }
    .ms-pano-caption { font-family: "IBM Plex Mono", monospace; font-size: 11px; color: #64748b; padding: 10px 14px; }
    .ms-pano img { width: 100%; display: block; background: #000; }
    .ms-figure { border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px; background: #ffffff; }
    .ms-figure img { width: 100%; display: block; }
    .ms-foot { margin-top: 64px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #94a3b8; font-family: "IBM Plex Mono", monospace; font-size: 11px; }
    .ms-summary { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; background: #f1f5f9; border-radius: 8px; padding: 16px 18px; }
    .ms-summary div { font-family: "IBM Plex Mono", monospace; font-size: 12px; color: #475569; }
    .ms-summary div strong { color: #0f172a; font-size: 18px; font-weight: 700; display: block; font-family: inherit; margin-top: 2px; }
    @media print {
      body { max-width: 100%; padding: 24px 28px; }
      .ms-section, .ms-card, .ms-pano, .ms-metric, .ms-figure { break-inside: avoid; page-break-inside: avoid; }
      @page { size: A4; margin: 12mm 10mm; }
    }
  `;

  const totalCells = groups.reduce((s, g) => s + g.filtered.length, 0);
  const totalTiles = groups.reduce((s, g) => s + (useStore.getState().tiles[g.exp.id]?.length ?? 0), 0);

  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>MicroStitch 实验报告</title>
<style>${css}</style>
</head>
<body>
<h1>显微图像分析实验报告</h1>
<div class="meta">生成时间：${today} · MicroStitch Platform</div>

<section class="ms-section">
  <h2>实验概览</h2>
  <div class="ms-summary">
    <div>实验组<strong>${groups.length}</strong></div>
    <div>视野总数<strong>${totalTiles}</strong></div>
    <div>累计检测<strong>${totalCells}</strong></div>
    <div>全景图<strong>${groups.filter(g => g.panorama).length}</strong></div>
  </div>
</section>

<section class="ms-section">
  <h2>组间对比统计</h2>
  ${chartPng ? `<figure class="ms-figure" style="margin-bottom:18px"><img src="${chartPng}" alt="组间对比" /></figure>` : ""}
  ${table}
</section>

<section class="ms-section">
  <h2>形态参数分布</h2>
  ${histograms}
</section>

<section class="ms-section">
  <h2>带标注全景图</h2>
  ${panoramaImages.length === 0
    ? `<div class="ms-empty">无全景图数据</div>`
    : `<div class="ms-panos">${panoramaImages.map(p => `<figure class="ms-pano">
      <div class="ms-pano-head">
        <span class="ms-pano-swatch" style="background:${p.color}"></span>
        <span class="ms-pano-name">${escapeHtml(p.name)}</span>
      </div>
      ${p.png ? `<img src="${p.png}" alt="全景图" />` : `<div class="ms-empty">无全景图</div>`}
      <figcaption class="ms-pano-caption">${escapeHtml(p.summary)}</figcaption>
    </figure>`).join("")}</div>`}
</section>

<section class="ms-section">
  <h2>导出条目明细</h2>
  <div class="ms-metric-grid">
    <div class="ms-metric"><div class="k">CSV 汇总</div><div class="v">${groups.length} 行</div></div>
    <div class="ms-metric"><div class="k">CSV 明细</div><div class="v">各组测量.csv</div></div>
    <div class="ms-metric"><div class="k">PNG 标注</div><div class="v">${panoramaImages.filter(p => p.png).length}</div></div>
    <div class="ms-metric"><div class="k">项目包</div><div class="v">.micproj</div></div>
  </div>
  <p style="margin-top:12px;color:#475569;font-size:12px;">
    此报告在「对比与导出」页生成；原始明细表格 CSV、项目包备份可在平台内继续导出，用于论文补充材料。
  </p>
</section>

<div class="ms-foot">Generated by MicroStitch · 基于 Harris + NCC 特征配准 · 分水岭分割 · 多频带融合</div>
</body></html>`;

  void rows;

  if (opts.inWindow) {
    const win = window.open("", "_blank", "width=1100,height=840");
    if (win) {
      win.document.open();
      win.document.write(html);
      win.document.close();
    }
    return win!;
  }
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `microstitch_report_${Date.now()}.html`;
  a.target = "_blank";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 3000);
  return window.open(url, "_blank")!;
}

function escapeHtml(s: unknown): string {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
