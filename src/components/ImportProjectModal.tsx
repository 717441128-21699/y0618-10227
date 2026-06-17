import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, X, FileType, CheckCircle2, AlertTriangle, ArrowRight } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { deserializeBundle, projectsOf, totalBytesOf, type ProjectBundle } from "@/lib/projectPackage";
import { useStore } from "@/store/useStore";
import { formatSize } from "@/lib/blobStore";
import { cn } from "@/lib/utils";

type Mode = "idle" | "parsing" | "ready" | "error" | "importing" | "done";

export function ImportProjectModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const importProject = useStore((s) => s.importProject);

  const [mode, setMode] = useState<Mode>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [bundle, setBundle] = useState<ProjectBundle | null>(null);
  const [mergeMode, setMergeMode] = useState<"merge" | "replace">("merge");
  const [dragOver, setDragOver] = useState(false);
  const [importedIds, setImportedIds] = useState<string[]>([]);

  const reset = () => {
    setMode("idle");
    setErrorMsg(null);
    setBundle(null);
    setMergeMode("merge");
    setDragOver(false);
    setImportedIds([]);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const acceptFile = async (file: File) => {
    setMode("parsing");
    setErrorMsg(null);
    try {
      const b = await deserializeBundle(file);
      setBundle(b);
      setMode("ready");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setMode("error");
    }
  };

  const onFile = (f: FileList | null) => {
    if (!f || f.length === 0) return;
    void acceptFile(f[0]);
  };

  const preview = useMemo(() => {
    if (!bundle) return null;
    const totalBytes = totalBytesOf(bundle);
    return {
      count: bundle.data.experiments.length,
      totalBytes,
      bytesLabel: formatSize(totalBytes),
      projects: projectsOf(bundle),
    };
  }, [bundle]);

  const doImport = async () => {
    if (!bundle) return;
    setMode("importing");
    try {
      const newExps = await importProject(bundle.data, mergeMode);
      setImportedIds(newExps.map((e) => e.id));
      setMode("done");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setMode("error");
    }
  };

  const openFirst = () => {
    const id = importedIds[0];
    if (!id) {
      handleClose();
      navigate("/");
      return;
    }
    handleClose();
    navigate(`/stitch/${id}`);
  };

  const body = () => {
    if (mode === "idle" || mode === "parsing") {
      return (
        <div
          className={cn(
            "relative flex h-60 flex-col items-center justify-center rounded-[4px] border-2 border-dashed text-center transition",
            dragOver ? "border-fluor/70 bg-fluor/5" : "border-ink-600/60 bg-ink-900/30"
          )}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files?.length) onFile(e.dataTransfer.files);
          }}
        >
          {mode === "parsing" ? (
            <>
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-ink-600 border-t-fluor" />
              <div className="mono mt-3 text-xs text-ink-300">正在解析项目包…</div>
            </>
          ) : (
            <>
              <Upload size={28} className="text-ink-400" />
              <div className="mt-3 text-sm font-medium text-ink-100">拖入项目包或点击选择</div>
              <div className="mono mt-1 text-2xs text-ink-400">支持 .micproj 格式（由本平台导出）</div>
              <label className="btn btn-primary mt-5 cursor-pointer">
                <FileType size={14} />
                选择文件
                <input
                  type="file"
                  className="hidden"
                  accept=".micproj,application/json"
                  onChange={(e) => onFile(e.target.files)}
                />
              </label>
            </>
          )}
        </div>
      );
    }

    if (mode === "error") {
      return (
        <div className="rounded-[4px] border border-red/40 bg-red/5 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="mt-0.5 text-red" />
            <div>
              <div className="text-sm font-medium text-red">导入失败</div>
              <div className="mono mt-1 text-xs text-ink-300 whitespace-pre-wrap break-words">
                {errorMsg ?? "未知错误"}
              </div>
              <button
                className="btn mt-4"
                onClick={() => {
                  setErrorMsg(null);
                  setMode("idle");
                }}
              >
                重新选择
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (mode === "done") {
      return (
        <div className="rounded-[4px] border border-fluor/40 bg-fluor/5 p-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 size={20} className="mt-0.5 text-fluor" />
            <div className="flex-1">
              <div className="text-sm font-medium text-fluor-glow">导入成功</div>
              <div className="mono mt-1 text-xs text-ink-300">
                共导入 {importedIds.length} 个实验，已写入 IndexedDB。
              </div>
              <div className="mt-4 flex gap-2">
                <button className="btn btn-primary" onClick={openFirst}>
                  <ArrowRight size={14} />
                  进入首个实验
                </button>
                <button className="btn" onClick={handleClose}>
                  返回工作台
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (!bundle || !preview) return null;

    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-[4px] border border-ink-600/60 bg-ink-900/30 p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-ink-100">{preview.count} 个实验可导入</div>
              <div className="mono mt-1 text-2xs text-ink-400">
                打包大小 {preview.bytesLabel} · 生成于{" "}
                {new Date(bundle.manifest.exportedAt).toLocaleString("zh-CN")}
              </div>
            </div>
            <button
              className="btn btn-ghost"
              onClick={() => {
                setBundle(null);
                setMode("idle");
              }}
            >
              <X size={14} />
              换一个
            </button>
          </div>
        </div>

        <div>
          <label className="field-label">导入模式</label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              className={cn(
                "rounded-[4px] border p-3 text-left transition",
                mergeMode === "merge"
                  ? "border-fluor/50 bg-fluor/5 text-ink-50"
                  : "border-ink-600/60 bg-ink-900/20 text-ink-300 hover:border-ink-500"
              )}
              onClick={() => setMergeMode("merge")}
            >
              <div className="text-xs font-semibold">追加合并</div>
              <div className="mono mt-1 text-2xs text-ink-400">实验 ID 重新分配，避免覆盖</div>
            </button>
            <button
              className={cn(
                "rounded-[4px] border p-3 text-left transition",
                mergeMode === "replace"
                  ? "border-amber/50 bg-amber/5 text-ink-50"
                  : "border-ink-600/60 bg-ink-900/20 text-ink-300 hover:border-ink-500"
              )}
              onClick={() => setMergeMode("replace")}
            >
              <div className="text-xs font-semibold">替换全部</div>
              <div className="mono mt-1 text-2xs text-ink-400">清空本地后再导入</div>
            </button>
          </div>
        </div>

        <div>
          <label className="field-label">预览</label>
          <div className="mt-2 max-h-56 overflow-y-auto rounded-[4px] border border-ink-700/60">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-ink-900/90 backdrop-blur">
                <tr className="text-ink-300">
                  <th className="px-3 py-2 text-left font-medium">实验</th>
                  <th className="mono px-3 py-2 text-right font-medium">视野</th>
                  <th className="mono px-3 py-2 text-right font-medium">全景图</th>
                  <th className="mono px-3 py-2 text-right font-medium">检测</th>
                  <th className="mono px-3 py-2 text-right font-medium">大小</th>
                </tr>
              </thead>
              <tbody>
                {preview.projects.map(({ experiment: e, stats }) => (
                  <tr key={e.id} className="border-t border-ink-800/60">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ background: e.color, boxShadow: `0 0 6px ${e.color}` }}
                        />
                        <span className="text-ink-100 truncate">{e.name}</span>
                      </div>
                    </td>
                    <td className="mono px-3 py-2 text-right text-ink-200">{stats?.tiles ?? 0}</td>
                    <td className="mono px-3 py-2 text-right">
                      {stats?.hasPanorama ? (
                        <CheckCircle2 size={13} className="ml-auto text-fluor" />
                      ) : (
                        <span className="text-ink-500">—</span>
                      )}
                    </td>
                    <td className="mono px-3 py-2 text-right text-ink-200">{stats?.detections ?? 0}</td>
                    <td className="mono px-3 py-2 text-right text-ink-300">
                      {stats?.bytes ? formatSize(stats.bytes) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="导入项目包"
      subtitle="从 .micproj 备份文件恢复完整实验（视野、全景、检测、形态过滤）"
      size="lg"
      footer={
        mode === "ready" ? (
          <>
            <button className="btn btn-ghost" onClick={handleClose}>
              取消
            </button>
            <button className="btn btn-primary" onClick={doImport} disabled={mode !== "ready"}>
              <Upload size={14} />
              {mergeMode === "replace" ? "替换后导入" : "开始导入"}
            </button>
          </>
        ) : undefined
      }
    >
      {body()}
    </Modal>
  );
}
