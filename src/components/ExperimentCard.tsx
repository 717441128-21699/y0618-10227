import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Upload,
  Trash2,
  Pencil,
  ArrowRight,
  Circle,
  Boxes,
  FlaskConical,
  Check,
} from "lucide-react";
import { useStore } from "@/store/useStore";
import { readImageFilesToTiles } from "@/lib/image";
import type { Experiment, TargetType } from "@/types";
import { cn } from "@/lib/utils";

const TYPE_ICON: Record<TargetType, React.ReactNode> = {
  cell: <Circle size={12} />,
  particle: <Boxes size={12} />,
  colony: <FlaskConical size={12} />,
};
const TYPE_LABEL: Record<TargetType, string> = {
  cell: "细胞",
  particle: "颗粒",
  colony: "菌落",
};

interface Props {
  exp: Experiment;
  tileCount: number;
  detectionCount: number;
  hasPanorama: boolean;
  index: number;
}

export function ExperimentCard({ exp, tileCount, detectionCount, hasPanorama, index }: Props) {
  const navigate = useNavigate();
  const addTiles = useStore((s) => s.addTiles);
  const deleteExperiment = useStore((s) => s.deleteExperiment);
  const renameExperiment = useStore((s) => s.renameExperiment);
  const fileRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(exp.name);
  const [dragOver, setDragOver] = useState(false);

  const stages = [
    { done: tileCount > 0 },
    { done: hasPanorama },
    { done: detectionCount > 0 },
    { done: detectionCount > 0 },
  ];

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const tiles = await readImageFilesToTiles(Array.from(files));
    addTiles(
      exp.id,
      tiles.map((t) => ({ name: t.name, dataUrl: t.dataUrl, width: t.width, height: t.height }))
    );
    navigate(`/stitch/${exp.id}`);
  };

  const commitRename = () => {
    if (name.trim()) renameExperiment(exp.id, name.trim());
    setEditing(false);
  };

  const enter = () => navigate(`/stitch/${exp.id}`);

  return (
    <div
      className={cn(
        "group relative flex animate-fade-up flex-col overflow-hidden rounded-lg border bg-ink-800/70 transition",
        dragOver ? "border-fluor shadow-glow" : "border-ink-600/70 hover:border-ink-500"
      )}
      style={{ animationDelay: `${index * 40}ms` }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        handleFiles(e.dataTransfer.files);
      }}
    >
      <div className="h-1 w-full" style={{ background: exp.color, boxShadow: `0 0 12px ${exp.color}80` }} />
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            {editing ? (
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename();
                  if (e.key === "Escape") {
                    setName(exp.name);
                    setEditing(false);
                  }
                }}
                className="w-full rounded-[3px] border border-fluor/50 bg-ink-900 px-2 py-1 text-sm font-semibold text-ink-50 outline-none"
              />
            ) : (
              <button
                onClick={enter}
                className="block truncate text-left text-sm font-semibold text-ink-50 hover:text-fluor-glow"
              >
                {exp.name}
              </button>
            )}
            <div className="mono mt-1 flex items-center gap-2 text-2xs text-ink-400">
              <span className="flex items-center gap-1 rounded bg-ink-700/50 px-1.5 py-0.5 text-ink-200">
                {TYPE_ICON[exp.type]}
                {TYPE_LABEL[exp.type]}
              </span>
              <span>{exp.scale} µm/px</span>
              <span>·</span>
              <span>{new Date(exp.createdAt).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" })}</span>
            </div>
          </div>
          <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
            <button className="icon-btn h-7 w-7" title="重命名" onClick={() => setEditing(true)}>
              <Pencil size={12} />
            </button>
            <button
              className="icon-btn h-7 w-7 hover:!border-coral/50 hover:!text-coral-glow"
              title="删除"
              onClick={() => {
                if (confirm(`确定删除实验「${exp.name}」？`)) deleteExperiment(exp.id);
              }}
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Stat label="视野" value={tileCount} />
          <Stat label="全景" value={hasPanorama ? "✓" : "—"} active={hasPanorama} />
          <Stat label="计数" value={detectionCount} active={detectionCount > 0} />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {stages.map((s, i) => (
              <div
                key={i}
                className={cn(
                  "h-1.5 w-6 rounded-full transition",
                  s.done ? "bg-fluor" : "bg-ink-600",
                  s.done && "shadow-[0_0_6px_#2dd4bf80]"
                )}
              />
            ))}
            <span className="mono ml-1 text-2xs text-ink-400">流程</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              className="btn h-7 px-2 text-2xs"
              onClick={() => fileRef.current?.click()}
              title="导入图片"
            >
              <Upload size={12} />
              导入
            </button>
            <button className="btn btn-primary h-7 px-2.5 text-2xs" onClick={enter}>
              进入
              <ArrowRight size={12} />
            </button>
          </div>
        </div>
      </div>
      {dragOver && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-fluor/10 backdrop-blur-sm">
          <div className="mono flex items-center gap-2 text-xs text-fluor-glow">
            <Check size={14} />
            释放以导入图片
          </div>
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}

function Stat({ label, value, active }: { label: string; value: number | string; active?: boolean }) {
  return (
    <div className="rounded-[3px] border border-ink-700/60 bg-ink-900/40 px-2 py-1.5">
      <div className="mono text-2xs uppercase tracking-wider text-ink-400">{label}</div>
      <div
        className={cn(
          "mono text-sm font-semibold tabular",
          active ? "text-fluor-glow" : "text-ink-100"
        )}
      >
        {value}
      </div>
    </div>
  );
}
