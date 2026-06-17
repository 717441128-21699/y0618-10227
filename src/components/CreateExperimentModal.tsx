import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Beaker, FlaskConical, Circle, Boxes, Upload, Sparkles } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Segmented } from "@/components/ui/Segmented";
import { Slider } from "@/components/ui/Slider";
import { useStore } from "@/store/useStore";
import { generateSampleTiles, PRESET_CONDITIONS } from "@/lib/sampleData";
import type { TargetType } from "@/types";
import { cn } from "@/lib/utils";

const TYPE_OPTIONS = [
  { value: "cell" as TargetType, label: "细胞", icon: <Circle size={13} /> },
  { value: "particle" as TargetType, label: "颗粒", icon: <Boxes size={13} /> },
  { value: "colony" as TargetType, label: "菌落", icon: <FlaskConical size={13} /> },
];

export function CreateExperimentModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const createExperiment = useStore((s) => s.createExperiment);
  const addTiles = useStore((s) => s.addTiles);
  const [tab, setTab] = useState<"blank" | "sample">("blank");
  const [name, setName] = useState("");
  const [type, setType] = useState<TargetType>("cell");
  const [scale, setScale] = useState(0.5);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setName("");
    setType("cell");
    setScale(0.5);
    setTab("blank");
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const createBlank = () => {
    const exp = createExperiment({
      name: name.trim() || `实验 ${new Date().toLocaleDateString("zh-CN")}`,
      type,
      scale,
    });
    handleClose();
    navigate(`/stitch/${exp.id}`);
  };

  const createSample = async (presetId: string) => {
    const preset = PRESET_CONDITIONS.find((p) => p.id === presetId);
    if (!preset) return;
    setBusy(true);
    await new Promise((r) => setTimeout(r, 30));
    const exp = createExperiment({
      name: name.trim() || preset.name,
      type: preset.type,
      scale,
    });
    const sample = generateSampleTiles({
      cellDensity: preset.density,
      clusterFactor: preset.clusterFactor,
      seed: preset.seed,
    });
    addTiles(
      exp.id,
      sample.tiles.map((t, i) => ({
        name: `视野 ${i + 1}`,
        dataUrl: t.dataUrl,
        width: t.width,
        height: t.height,
      }))
    );
    setBusy(false);
    handleClose();
    navigate(`/stitch/${exp.id}`);
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="新建实验"
      subtitle="创建实验组并导入同一样本的多视野显微图像"
      footer={
        tab === "blank" ? (
          <>
            <button className="btn btn-ghost" onClick={handleClose}>
              取消
            </button>
            <button className="btn btn-primary" onClick={createBlank}>
              <Upload size={14} />
              创建并上传
            </button>
          </>
        ) : undefined
      }
    >
      <div className="mb-4">
        <Segmented
          options={[
            { value: "blank", label: "空白实验", icon: <Beaker size={13} /> },
            { value: "sample", label: "示例样本", icon: <Sparkles size={13} /> },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <label className="field-label">实验名称</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={tab === "sample" ? "留空则使用预设名称" : "例如：HeLa 荧光染色 样本A"}
            className="mt-1.5 w-full rounded-[3px] border border-ink-600/80 bg-ink-900/60 px-3 py-2 text-sm text-ink-50 outline-none transition placeholder:text-ink-400 focus:border-fluor/60 focus:shadow-glow"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="field-label">目标类型</label>
            <div className="mt-1.5">
              <Segmented options={TYPE_OPTIONS} value={type} onChange={setType} />
            </div>
          </div>
          <div>
            <label className="field-label">标尺 · {scale.toFixed(2)} µm/px</label>
            <div className="mt-2.5">
              <Slider
                value={scale}
                min={0.1}
                max={2}
                step={0.05}
                onChange={setScale}
                format={(v) => v.toFixed(2)}
              />
            </div>
          </div>
        </div>

        {tab === "sample" && (
          <div>
            <label className="field-label">选择示例条件</label>
            <p className="mt-1 text-2xs text-ink-400">
              系统将自动生成含细胞聚集与亮度差异的多视野拼图，用于演示完整流程
            </p>
            <div className="mt-2 grid grid-cols-1 gap-2">
              {PRESET_CONDITIONS.map((p) => (
                <button
                  key={p.id}
                  disabled={busy}
                  onClick={() => createSample(p.id)}
                  className={cn(
                    "group flex items-center justify-between rounded-[4px] border border-ink-600/70 bg-ink-900/40 px-3 py-2.5 text-left transition hover:border-fluor/50 hover:bg-fluor/5 disabled:opacity-50"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-[3px] border border-fluor/30 bg-fluor/10 text-fluor">
                      {p.type === "colony" ? <FlaskConical size={14} /> : p.type === "particle" ? <Boxes size={14} /> : <Circle size={14} />}
                    </span>
                    <div>
                      <div className="text-xs font-medium text-ink-50">{p.name}</div>
                      <div className="mono text-2xs text-ink-400">
                        密度 ×{p.density.toFixed(1)} · 聚集 {(p.clusterFactor * 100) | 0}%
                      </div>
                    </div>
                  </div>
                  <Sparkles size={14} className="text-fluor opacity-0 transition group-hover:opacity-100" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
