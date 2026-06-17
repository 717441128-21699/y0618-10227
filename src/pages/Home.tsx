import { useState } from "react";
import { Microscope, Plus, Sparkles, ArrowRight, Upload, ScanLine, Target, Ruler } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { ExperimentCard } from "@/components/ExperimentCard";
import { CreateExperimentModal } from "@/components/CreateExperimentModal";
import { useStore } from "@/store/useStore";

export default function Home() {
  const experiments = useStore((s) => s.experiments);
  const tiles = useStore((s) => s.tiles);
  const panoramas = useStore((s) => s.panoramas);
  const detections = useStore((s) => s.detections);
  const [modalOpen, setModalOpen] = useState(false);

  const totalCells = experiments.reduce((sum, e) => sum + (detections[e.id]?.length ?? 0), 0);
  const totalTiles = experiments.reduce((sum, e) => sum + (tiles[e.id]?.length ?? 0), 0);
  const stitched = experiments.filter((e) => panoramas[e.id]).length;

  return (
    <>
      <PageHeader
        title="实验工作台"
        subtitle="显微图像拼接 · 细胞计数 · 形态分析"
        icon={<Microscope size={16} />}
        actions={
          <>
            <button className="btn" onClick={() => setModalOpen(true)}>
              <Sparkles size={14} />
              加载示例
            </button>
            <button className="btn btn-primary" onClick={() => setModalOpen(true)}>
              <Plus size={14} />
              新建实验
            </button>
          </>
        }
      />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-6 py-6">
          {experiments.length === 0 ? (
            <EmptyState onCreate={() => setModalOpen(true)} />
          ) : (
            <>
              <div className="mb-5 grid grid-cols-3 gap-3">
                <SummaryStat label="实验组" value={experiments.length} icon={<Microscope size={14} />} />
                <SummaryStat label="视野图像" value={totalTiles} icon={<ScanLine size={14} />} />
                <SummaryStat label="已计数" value={totalCells} icon={<Target size={14} />} accent />
              </div>

              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-300">实验组列表</h2>
                <span className="mono text-2xs text-ink-400">{stitched}/{experiments.length} 已拼接</span>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {experiments.map((exp, i) => (
                  <ExperimentCard
                    key={exp.id}
                    exp={exp}
                    index={i}
                    tileCount={tiles[exp.id]?.length ?? 0}
                    detectionCount={detections[exp.id]?.length ?? 0}
                    hasPanorama={!!panoramas[exp.id]}
                  />
                ))}
              </div>

              <WorkflowGuide />
            </>
          )}
        </div>
      </div>

      <CreateExperimentModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}

function SummaryStat({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="panel flex items-center gap-3 px-4 py-3">
      <span
        className={`flex h-9 w-9 items-center justify-center rounded-[4px] border ${
          accent ? "border-fluor/40 bg-fluor/10 text-fluor" : "border-ink-600/70 bg-ink-700/40 text-ink-200"
        }`}
      >
        {icon}
      </span>
      <div>
        <div className="mono text-2xs uppercase tracking-wider text-ink-400">{label}</div>
        <div className="mono text-xl font-semibold tabular text-ink-50">{value}</div>
      </div>
    </div>
  );
}

function WorkflowGuide() {
  const steps = [
    { icon: <ScanLine size={16} />, label: "图像拼接", desc: "特征点匹配 · 多频带融合 · 亮度均衡" },
    { icon: <Target size={16} />, label: "细胞计数", desc: "自动分割 · 形态过滤 · 人工修正" },
    { icon: <Ruler size={16} />, label: "测量统计", desc: "面积周长 · 长短轴 · 分布直方图" },
  ];
  return (
    <div className="mt-8">
      <div className="field-label mb-3">工作流</div>
      <div className="flex flex-col gap-3 sm:flex-row">
        {steps.map((s, i) => (
          <div key={i} className="panel flex flex-1 items-center gap-3 px-4 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-fluor/40 bg-fluor/10 text-fluor">
              {s.icon}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="mono text-2xs text-ink-400">0{i + 1}</span>
                <span className="text-xs font-semibold text-ink-50">{s.label}</span>
              </div>
              <div className="mt-0.5 text-2xs text-ink-300">{s.desc}</div>
            </div>
            {i < steps.length - 1 && <ArrowRight size={14} className="ml-auto hidden text-ink-500 sm:block" />}
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-up">
      <div className="relative mb-6">
        <div className="absolute inset-0 -z-10 animate-pulse-ring rounded-full bg-fluor/10" />
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-fluor/30 bg-fluor/5">
          <Microscope size={36} className="text-fluor" />
        </div>
      </div>
      <h2 className="text-lg font-semibold text-ink-50">开始你的第一个实验</h2>
      <p className="mt-2 max-w-md text-sm text-ink-300">
        上传同一样本在不同视野拍摄的多张显微图像，系统将自动拼接全景图并完成细胞计数与形态分析。
      </p>
      <div className="mt-6 flex items-center gap-3">
        <button className="btn btn-primary" onClick={onCreate}>
          <Plus size={14} />
          新建实验
        </button>
        <button className="btn" onClick={onCreate}>
          <Upload size={14} />
          导入图片
        </button>
      </div>
    </div>
  );
}
