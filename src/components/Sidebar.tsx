import { useLocation, useNavigate } from "react-router-dom";
import {
  Microscope,
  GitCompareArrows,
  ScanLine,
  Target,
  Ruler,
  BarChart3,
  Plus,
  CircleCheck,
  CircleDot,
  Lock,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { useStore } from "@/store/useStore";
import { cn } from "@/lib/utils";
import type { WorkflowStage } from "@/types";
import type { TargetType } from "@/types";

const STAGES: { key: WorkflowStage; label: string; icon: React.ReactNode; route: (id: string) => string }[] = [
  { key: "stitch", label: "拼接", icon: <ScanLine size={15} />, route: (id) => `/stitch/${id}` },
  { key: "count", label: "计数", icon: <Target size={15} />, route: (id) => `/count/${id}` },
  { key: "measure", label: "测量", icon: <Ruler size={15} />, route: (id) => `/measure/${id}` },
];

const TYPE_LABEL: Record<TargetType, string> = {
  cell: "细胞",
  particle: "颗粒",
  colony: "菌落",
};

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const match = location.pathname.match(/^\/(stitch|count|measure)\/(.+)$/);
  const activeStage = match?.[1] as WorkflowStage | undefined;
  const expId = match?.[2];
  const experiments = useStore((s) => s.experiments);
  const panoramas = useStore((s) => s.panoramas);
  const detections = useStore((s) => s.detections);
  const tiles = useStore((s) => (expId ? s.tiles[expId] : undefined)) ?? [];

  const exp = expId ? experiments.find((e) => e.id === expId) : undefined;
  const hasPanorama = expId ? !!panoramas[expId] : false;
  const hasDetections = expId ? (detections[expId]?.length ?? 0) > 0 : false;

  const navItems = [
    { label: "实验工作台", icon: <Microscope size={16} />, path: "/", active: location.pathname === "/" },
    { label: "对比与导出", icon: <GitCompareArrows size={16} />, path: "/compare", active: location.pathname === "/compare" },
  ];

  const stageStatus = (key: WorkflowStage): "done" | "active" | "todo" => {
    if (activeStage === key) return "active";
    if (key === "stitch" && hasPanorama) return "done";
    if (key === "count" && hasDetections) return "done";
    if (key === "measure" && hasDetections) return "done";
    return "todo";
  };

  const stageEnabled = (key: WorkflowStage): boolean => {
    if (key === "stitch") return true;
    if (key === "count") return hasPanorama;
    if (key === "measure") return hasDetections;
    return true;
  };

  const totalCells = experiments.reduce(
    (sum, e) => sum + (detections[e.id]?.length ?? 0),
    0
  );

  return (
    <aside className="flex h-full w-[244px] shrink-0 flex-col border-r border-ink-700/60 bg-ink-850/60">
      <div className="flex items-center gap-2.5 px-4 py-4">
        <Logo size={30} />
        <div className="leading-tight">
          <div className="text-sm font-semibold tracking-tight text-ink-50">MicroStitch</div>
          <div className="mono text-2xs uppercase tracking-[0.18em] text-fluor/70">数字暗房</div>
        </div>
      </div>

      <div className="px-3">
        <button
          className="btn btn-primary w-full justify-start"
          onClick={() => navigate("/")}
        >
          <Plus size={14} />
          新建实验
        </button>
      </div>

      <nav className="mt-4 flex flex-col gap-0.5 px-2">
        {navItems.map((item) => (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className={cn(
              "flex items-center gap-2.5 rounded-[4px] px-2.5 py-2 text-sm transition",
              item.active
                ? "bg-fluor/10 text-fluor-glow shadow-[inset_0_0_0_1px_rgba(45,212,191,0.3)]"
                : "text-ink-200 hover:bg-ink-700/40 hover:text-ink-50"
            )}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      {exp && (
        <div className="mt-5 border-t border-ink-700/50 px-3 pt-4">
          <div className="field-label mb-2">当前实验</div>
          <div className="rounded-[4px] border border-ink-600/70 bg-ink-800/60 p-2.5">
            <div className="flex items-center gap-2">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: exp.color, boxShadow: `0 0 6px ${exp.color}` }}
              />
              <span className="truncate text-xs font-medium text-ink-50">{exp.name}</span>
            </div>
            <div className="mono mt-1.5 flex items-center gap-2 text-2xs text-ink-300">
              <span className="rounded bg-ink-700/60 px-1 py-0.5">{TYPE_LABEL[exp.type]}</span>
              <span>{exp.scale} µm/px</span>
            </div>
          </div>

          <div className="mt-3 flex flex-col">
            {STAGES.map((s, i) => {
              const status = stageStatus(s.key);
              const enabled = stageEnabled(s.key);
              return (
                <div key={s.key} className="relative flex items-stretch">
                  {i < STAGES.length - 1 && (
                    <div className="absolute left-[15px] top-7 h-full w-px bg-ink-600/60" />
                  )}
                  <button
                    disabled={!enabled}
                    onClick={() => navigate(s.route(exp.id))}
                    className={cn(
                      "group relative flex w-full items-center gap-2.5 rounded-[4px] px-1.5 py-1.5 text-left transition",
                      enabled ? "hover:bg-ink-700/30" : "cursor-not-allowed opacity-40"
                    )}
                  >
                    <span
                      className={cn(
                        "relative z-10 flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border",
                        status === "active"
                          ? "border-fluor bg-fluor/15 text-fluor-glow shadow-glow"
                          : status === "done"
                            ? "border-fluor/50 bg-fluor/10 text-fluor"
                            : "border-ink-600 bg-ink-800 text-ink-300"
                      )}
                    >
                      {status === "done" ? <CircleCheck size={15} /> : status === "todo" && !enabled ? <Lock size={13} /> : s.icon}
                    </span>
                    <div className="flex flex-1 flex-col leading-tight">
                      <span
                        className={cn(
                          "text-xs font-medium",
                          status === "active" ? "text-fluor-glow" : status === "done" ? "text-ink-100" : "text-ink-200"
                        )}
                      >
                        {s.label}
                      </span>
                      <span className="mono text-2xs text-ink-400">
                        {s.key === "stitch" ? `${tiles.length} 视野` : status === "done" ? "已完成" : status === "active" ? "进行中" : "待处理"}
                      </span>
                    </div>
                  </button>
                </div>
              );
            })}
            <div className="relative flex items-stretch">
              <button
                onClick={() => navigate("/compare")}
                className={cn(
                  "group relative flex w-full items-center gap-2.5 rounded-[4px] px-1.5 py-1.5 text-left transition hover:bg-ink-700/30",
                  location.pathname === "/compare" && "bg-fluor/10"
                )}
              >
                <span className="relative z-10 flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border border-ink-600 bg-ink-800 text-violet">
                  <BarChart3 size={15} />
                </span>
                <div className="flex flex-1 flex-col leading-tight">
                  <span className="text-xs font-medium text-ink-100">对比</span>
                  <span className="mono text-2xs text-ink-400">多组汇总</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-auto border-t border-ink-700/50 px-4 py-3">
        <div className="mono flex items-center justify-between text-2xs text-ink-400">
          <span className="flex items-center gap-1.5">
            <CircleDot size={11} className="text-fluor" />
            {experiments.length} 组实验
          </span>
          <span>{totalCells} 标记</span>
        </div>
      </div>
    </aside>
  );
}
