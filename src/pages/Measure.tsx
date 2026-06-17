import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Ruler,
  ArrowLeft,
  ArrowRight,
  Download,
  Table2,
  BarChart3,
  Sigma,
  FileSpreadsheet,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Toggle } from "@/components/ui/Toggle";
import { useStore } from "@/store/useStore";
import { computeStats } from "@/lib/image";
import {
  defaultFilter,
  filterDetections,
  summaryStats,
  buildHistogram,
  aspectRatioOf,
  fmt,
} from "@/lib/analysis";
import type { Stats } from "@/types";
import { downloadCsv, sanitizeName } from "@/lib/export";
import { cn } from "@/lib/utils";

type SortKey = "id" | "area" | "perimeter" | "majorAxis" | "minorAxis" | "circularity" | "angle";

export default function Measure() {
  const { expId = "" } = useParams();
  const navigate = useNavigate();
  const exp = useStore((s) => s.experiments.find((e) => e.id === expId));
  const detections = useStore((s) => s.detections[expId] ?? []);
  const filter = useStore((s) => s.filters[expId] ?? defaultFilter());
  const updateExperimentStage = useStore((s) => s.updateExperimentStage);

  const [usePhysical, setUsePhysical] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("area");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);

  const scale = exp?.scale ?? 1;
  const filtered = useMemo(() => filterDetections(detections, filter), [detections, filter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      return (av - bv) * sortDir;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const areaStats = summaryStats(filtered, "area");
  const perimStats = summaryStats(filtered, "perimeter");
  const circStats = summaryStats(filtered, "circularity");
  const arValues = useMemo(() => filtered.map((d) => aspectRatioOf(d)), [filtered]);
  const arStats = computeStats(arValues) as Stats;
  const arHist = buildHistogram(arValues, 20);
  const areaHist = buildHistogram(filtered.map((d) => d.area), 20);
  const circHist = buildHistogram(filtered.map((d) => d.circularity), 20);

  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(k);
      setSortDir(-1);
    }
  };

  const exportCSV = () => {
    const rows = [
      ["实验组", exp?.name ?? ""],
      ["标尺(µm/px)", scale, "单位", usePhysical ? "物理" : "像素"],
      [],
      ["#", `面积(${uA})`, `周长(${uL})`, `长轴(${uL})`, `短轴(${uL})`, "长短轴比", "圆度", "角度(°)", "来源"],
      ...sorted.map((d, i) => [
        i + 1,
        A(d.area).toFixed(uA === "px²" ? 0 : 2),
        L(d.perimeter).toFixed(uL === "px" ? 1 : 2),
        L(d.majorAxis).toFixed(uL === "px" ? 2 : 3),
        L(d.minorAxis).toFixed(uL === "px" ? 2 : 3),
        aspectRatioOf(d).toFixed(2),
        d.circularity.toFixed(3),
        ((d.angle * 180) / Math.PI).toFixed(1),
        d.manual ? "手动" : "自动",
      ]),
    ];
    downloadCsv(rows, `${sanitizeName(exp?.name ?? "experiment")}_measurements.csv`);
  };

  const L = (px: number) => (usePhysical ? px * scale : px);
  const A = (px2: number) => (usePhysical ? px2 * scale * scale : px2);
  const uL = usePhysical ? "µm" : "px";
  const uA = usePhysical ? "µm²" : "px²";

  if (!exp) {
    return (
      <>
        <PageHeader title="测量与统计" icon={<Ruler size={16} />} />
        <div className="flex flex-1 items-center justify-center text-sm text-ink-300">实验不存在</div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={exp.name}
        subtitle="测量与统计"
        icon={<Ruler size={16} />}
        crumbs={[{ label: "实验工作台", to: "/" }, { label: "测量" }]}
        actions={
          <>
            <button className="btn" onClick={() => navigate(`/count/${expId}`)}>
              <ArrowLeft size={14} />
              计数
            </button>
            <button className="btn" onClick={exportCSV} disabled={filtered.length === 0}>
              <FileSpreadsheet size={14} />
              导出 CSV
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                updateExperimentStage(expId, "compare");
                navigate(`/compare`);
              }}
            >
              前往对比
              <ArrowRight size={14} />
            </button>
          </>
        }
      />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-6 py-6">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center text-sm text-ink-300">
              <Ruler size={28} className="mb-3 text-ink-500" />
              暂无可测量的目标，请先在计数模块完成检测
              <button className="btn mt-4" onClick={() => navigate(`/count/${expId}`)}>
                前往计数
              </button>
            </div>
          ) : (
            <>
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sigma size={16} className="text-fluor" />
                  <span className="text-sm font-semibold text-ink-50">形态统计</span>
                  <span className="mono rounded bg-ink-700/50 px-1.5 py-0.5 text-2xs text-ink-200">
                    {filtered.length} 个目标
                  </span>
                </div>
                <div className="w-56">
                  <Toggle
                    checked={usePhysical}
                    onChange={setUsePhysical}
                    label="物理单位"
                    hint={`标尺 ${scale} µm/px → ${usePhysical ? "µm / µm²" : "px / px²"}`}
                    accent="amber"
                  />
                </div>
              </div>

              <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
                <SummaryCard label="计数" value={fmt(filtered.length, 0)} unit="个" accent />
                <SummaryCard label="均值面积" value={fmt(A(areaStats.mean))} unit={uA} />
                <SummaryCard label="均值周长" value={fmt(L(perimStats.mean))} unit={uL} />
                <SummaryCard label="中位圆度" value={fmt(circStats.median, 2)} />
                <SummaryCard label="均值长轴" value={fmt(L(summaryStats(filtered, "majorAxis").mean))} unit={uL} />
              </div>

              <div className="mb-3 flex items-center gap-2">
                <BarChart3 size={14} className="text-fluor" />
                <span className="field-label">参数分布</span>
              </div>
              <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
                <HistogramCard
                  title="面积分布"
                  unit={uA}
                  hist={areaHist}
                  mean={A(areaStats.mean)}
                  median={A(areaStats.median)}
                  std={A(areaStats.std)}
                  color="#2dd4bf"
                  transform={A}
                />
                <HistogramCard
                  title="圆度分布"
                  unit=""
                  hist={circHist}
                  mean={circStats.mean}
                  median={circStats.median}
                  std={circStats.std}
                  color="#fbbf24"
                  transform={(v) => v}
                />
                <HistogramCard
                  title="长短轴比分布"
                  unit=""
                  hist={arHist}
                  mean={arStats.mean}
                  median={arStats.median}
                  std={arStats.std}
                  color="#a78bfa"
                  transform={(v) => v}
                />
              </div>

              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Table2 size={14} className="text-fluor" />
                  <span className="field-label">测量明细</span>
                </div>
                <span className="mono text-2xs text-ink-400">点击表头排序</span>
              </div>
              <div className="panel-raised overflow-hidden">
                <div className="max-h-[460px] overflow-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 z-10 bg-ink-850/95 backdrop-blur">
                      <tr className="mono text-2xs uppercase tracking-wider text-ink-300">
                        <Th label="#" k="id" sortKey={sortKey} dir={sortDir} onSort={toggleSort} />
                        <Th label={`面积 (${uA})`} k="area" sortKey={sortKey} dir={sortDir} onSort={toggleSort} right />
                        <Th label={`周长 (${uL})`} k="perimeter" sortKey={sortKey} dir={sortDir} onSort={toggleSort} right />
                        <Th label={`长轴 (${uL})`} k="majorAxis" sortKey={sortKey} dir={sortDir} onSort={toggleSort} right />
                        <Th label={`短轴 (${uL})`} k="minorAxis" sortKey={sortKey} dir={sortDir} onSort={toggleSort} right />
                        <th className="px-3 py-2 text-right">长短轴比</th>
                        <Th label="圆度" k="circularity" sortKey={sortKey} dir={sortDir} onSort={toggleSort} right />
                        <Th label="角度°" k="angle" sortKey={sortKey} dir={sortDir} onSort={toggleSort} right />
                        <th className="px-3 py-2 text-right">来源</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((d, i) => (
                        <tr
                          key={d.id}
                          className={cn(
                            "border-t border-ink-700/40 transition hover:bg-fluor/5",
                            i % 2 === 1 && "bg-ink-900/20"
                          )}
                        >
                          <td className="mono px-3 py-1.5 text-ink-400">{i + 1}</td>
                          <td className="mono px-3 py-1.5 text-right tabular text-ink-100">{fmt(A(d.area), 0)}</td>
                          <td className="mono px-3 py-1.5 text-right tabular text-ink-100">{fmt(L(d.perimeter))}</td>
                          <td className="mono px-3 py-1.5 text-right tabular text-ink-100">{fmt(L(d.majorAxis))}</td>
                          <td className="mono px-3 py-1.5 text-right tabular text-ink-100">{fmt(L(d.minorAxis))}</td>
                          <td className="mono px-3 py-1.5 text-right tabular text-ink-200">{fmt(aspectRatioOf(d), 2)}</td>
                          <td className="mono px-3 py-1.5 text-right tabular text-fluor-glow">{fmt(d.circularity, 3)}</td>
                          <td className="mono px-3 py-1.5 text-right tabular text-ink-300">{fmt((d.angle * 180) / Math.PI)}</td>
                          <td className="px-3 py-1.5 text-right">
                            <span
                              className={cn(
                                "mono rounded px-1.5 py-0.5 text-2xs",
                                d.manual
                                  ? "bg-amber/15 text-amber-glow"
                                  : "bg-fluor/10 text-fluor-glow"
                              )}
                            >
                              {d.manual ? "手动" : "自动"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2 rounded-[4px] border border-ink-700/60 bg-ink-900/30 px-4 py-3">
                <Download size={14} className="text-ink-300" />
                <span className="text-2xs text-ink-300">
                  导出 CSV 包含全部 {filtered.length} 个目标的形态参数；带标注图像可在「对比与导出」页面生成。
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function SummaryCard({
  label,
  value,
  unit,
  accent,
}: {
  label: string;
  value: string;
  unit?: string;
  accent?: boolean;
}) {
  return (
    <div className="panel px-4 py-3">
      <div className="mono text-2xs uppercase tracking-wider text-ink-400">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className={cn("mono text-xl font-semibold tabular", accent ? "text-fluor-glow" : "text-ink-50")}>
          {value}
        </span>
        {unit && <span className="mono text-2xs text-ink-400">{unit}</span>}
      </div>
    </div>
  );
}

interface HistogramData {
  edges: number[];
  counts: number[];
  min: number;
  max: number;
}

function HistogramCard({
  title,
  unit,
  hist,
  mean,
  median,
  std,
  color,
  transform,
}: {
  title: string;
  unit: string;
  hist: HistogramData;
  mean: number;
  median: number;
  std: number;
  color: string;
  transform: (v: number) => number;
}) {
  const maxCount = Math.max(1, ...hist.counts);
  const meanPct = hist.max > hist.min ? ((mean - hist.min) / (hist.max - hist.min)) * 100 : 50;
  return (
    <div className="panel p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold text-ink-100">{title}</span>
        <span className="mono text-2xs text-ink-400">{unit}</span>
      </div>
      <div className="relative flex h-28 items-end gap-[2px]">
        {hist.counts.map((c, i) => (
          <div
            key={i}
            className="flex-1 rounded-t-[1px] transition-all"
            style={{
              height: `${(c / maxCount) * 100}%`,
              minHeight: c > 0 ? "2px" : "0",
              background: `linear-gradient(to top, ${color}40, ${color})`,
            }}
            title={`${fmt(transform(hist.edges[i]))}–${fmt(transform(hist.edges[i + 1]))}: ${c}`}
          />
        ))}
        <div
          className="absolute top-0 bottom-0 w-px"
          style={{ left: `${Math.max(0, Math.min(100, meanPct))}%`, background: "#f87171", boxShadow: "0 0 6px #f87171" }}
          title="均值"
        />
      </div>
      <div className="mono mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-2xs text-ink-300">
        <Stat label="均值" value={fmt(transform(mean))} />
        <Stat label="中位" value={fmt(transform(median))} />
        <Stat label="标准差" value={fmt(transform(std))} />
        <Stat label="范围" value={`${fmt(transform(hist.min))}–${fmt(transform(hist.max))}`} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-ink-400">{label}</span>
      <span className="tabular text-ink-100">{value}</span>
    </div>
  );
}

function Th({
  label,
  k,
  sortKey,
  dir,
  onSort,
  right,
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  dir: 1 | -1;
  onSort: (k: SortKey) => void;
  right?: boolean;
}) {
  const active = sortKey === k;
  return (
    <th className={cn("px-3 py-2", right && "text-right")}>
      <button
        onClick={() => onSort(k)}
        className={cn(
          "inline-flex items-center gap-0.5 transition hover:text-fluor-glow",
          active ? "text-fluor-glow" : "",
          right && "flex-row-reverse"
        )}
      >
        {label}
        {active && <span className="text-2xs">{dir === 1 ? "▲" : "▼"}</span>}
      </button>
    </th>
  );
}
