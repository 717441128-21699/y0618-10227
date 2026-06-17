import type { Panorama } from "@/types";
import type { Detection } from "@/types";
import type { Polarity } from "@/lib/segmentation";
import { dataUrlToGray, grayToCanvas } from "@/lib/image";
import { stitch } from "@/lib/stitching";
import { segment } from "@/lib/segmentation";
import { useStore } from "@/store/useStore";
import type { MorphFilter } from "@/types";
import { defaultFilter } from "@/lib/analysis";

export interface BatchStageOptions {
  polarity?: Polarity;
  sensitivity?: number;
  minArea?: number;
  watershed?: boolean;
  equalize?: boolean;
  filter?: MorphFilter;
}

export interface BatchProgress {
  expId: string;
  stage: "pending" | "stitch" | "count" | "measure" | "done" | "error";
  stageProgress: number;
  message: string;
  error?: string;
  panoramaDone?: boolean;
  countDone?: boolean;
}

export async function runStitchForExp(
  expId: string,
  opts: { equalize?: boolean } = {},
  onProgress?: (p: number, msg: string) => void
): Promise<Panorama> {
  const tiles = useStore.getState().tiles[expId] ?? [];
  if (tiles.length < 2) throw new Error(`至少需要 2 个视野（当前 ${tiles.length}）`);
  onProgress?.(0.05, `准备 ${tiles.length} 张视野`);
  const refIndex = Math.max(0, tiles.findIndex((t) => t.isReference));
  const grays = [];
  for (let i = 0; i < tiles.length; i++) {
    onProgress?.(0.05 + (i / tiles.length) * 0.1, `解码视野 ${i + 1}/${tiles.length}`);
    grays.push(await dataUrlToGray(tiles[i].dataUrl, 640));
    await new Promise((r) => setTimeout(r, 20));
  }
  const result = stitch(grays, refIndex < 0 ? 0 : refIndex, {
    equalize: opts.equalize ?? true,
    onProgress: (p, label) => onProgress?.(0.15 + p * 0.8, label),
  });
  onProgress?.(0.97, "生成全景图");
  const canvas = grayToCanvas(result.panorama);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
  const panorama: Panorama = {
    width: result.panorama.w,
    height: result.panorama.h,
    dataUrl,
    seams: result.seams,
  };
  useStore.getState().setPanorama(expId, panorama);
  useStore.getState().updateExperimentStage(expId, "count");
  onProgress?.(1, "拼接完成");
  return panorama;
}

export async function runCountForExp(
  expId: string,
  opts: BatchStageOptions = {},
  onProgress?: (p: number, msg: string) => void
): Promise<Detection[]> {
  const panorama = useStore.getState().panoramas[expId];
  const priorDetections = useStore.getState().detections[expId] ?? [];
  if (!panorama) throw new Error("无全景图，请先运行拼接");
  onProgress?.(0.1, "解码全景图");
  const maxDim = Math.max(panorama.width, panorama.height);
  const gray = await dataUrlToGray(panorama.dataUrl, maxDim);
  onProgress?.(0.3, "分割与分水岭");
  const { detections: auto } = segment(gray, {
    polarity: opts.polarity ?? "bright",
    sensitivity: opts.sensitivity ?? 0.6,
    minArea: opts.minArea ?? 12,
    watershed: opts.watershed ?? true,
  });
  onProgress?.(0.9, "合并标记");
  const preserved = priorDetections.filter((d) => d.manual || d.status === "pending");
  let nextId = auto.reduce((m, d) => Math.max(m, d.id), -1) + 1;
  const manualList: Detection[] = preserved.map((d) => ({ ...d, id: nextId++ }));
  const merged = [...auto, ...manualList];
  useStore.getState().setDetections(expId, merged);
  useStore.getState().setFilter(expId, opts.filter ?? defaultFilter());
  useStore.getState().updateExperimentStage(expId, "measure");
  onProgress?.(1, `检出 ${auto.length} 个目标`);
  return merged;
}

export interface BatchTaskSpec {
  expId: string;
  stages: Array<"stitch" | "count" | "measure">;
}

export interface BatchResult {
  expId: string;
  success: boolean;
  stagesDone: Array<"stitch" | "count" | "measure">;
  error?: string;
}

export async function runBatch(
  tasks: BatchTaskSpec[],
  opts: BatchStageOptions & { filter?: MorphFilter } = {},
  onUpdate: (progress: BatchProgress) => void,
  shouldCancel?: () => boolean
): Promise<BatchResult[]> {
  const results: BatchResult[] = [];
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    if (shouldCancel?.()) {
      results.push({ expId: task.expId, success: false, stagesDone: [], error: "已取消" });
      continue;
    }
    const stagesDone: Array<"stitch" | "count" | "measure"> = [];
    let error: string | undefined;
    try {
      for (const stage of task.stages) {
        if (shouldCancel?.()) {
          error = "已取消";
          break;
        }
        if (stage === "stitch") {
          onUpdate({
            expId: task.expId,
            stage: "stitch",
            stageProgress: 0,
            message: "开始拼接",
          });
          await runStitchForExp(
            task.expId,
            { equalize: opts.equalize },
            (p, msg) =>
              onUpdate({
                expId: task.expId,
                stage: "stitch",
                stageProgress: p,
                message: msg,
              })
          );
          stagesDone.push("stitch");
        } else if (stage === "count") {
          onUpdate({
            expId: task.expId,
            stage: "count",
            stageProgress: 0,
            message: "开始计数",
          });
          await runCountForExp(
            task.expId,
            opts,
            (p, msg) =>
              onUpdate({
                expId: task.expId,
                stage: "count",
                stageProgress: p,
                message: msg,
              })
          );
          stagesDone.push("count");
        } else if (stage === "measure") {
          // measure is just statistics display; but we still update the stage
          onUpdate({
            expId: task.expId,
            stage: "measure",
            stageProgress: 1,
            message: "统计完成",
          });
          useStore.getState().updateExperimentStage(task.expId, "compare");
          stagesDone.push("measure");
        }
      }
      onUpdate({
        expId: task.expId,
        stage: "done",
        stageProgress: 1,
        message: error ? "部分完成" : "全部完成",
      });
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      onUpdate({
        expId: task.expId,
        stage: "error",
        stageProgress: 0,
        message: "失败",
        error,
      });
    }
    results.push({ expId: task.expId, success: !error, stagesDone, error });
    // yield next tick for UI
    await new Promise((r) => setTimeout(r, 30));
  }
  return results;
}

export interface DetectOptions {
  polarity?: Polarity;
  sensitivity?: number;
  minArea?: number;
  watershed?: boolean;
}
