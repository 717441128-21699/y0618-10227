import { downloadBlob } from "@/lib/export";
import type { PersistShape } from "@/store/useStore";
import type { Experiment } from "@/types";
import { formatSize, sizeOfDataUrl } from "@/lib/blobStore";
import { sanitizeName } from "@/lib/export";

export const PROJECT_VERSION = 1;
export const PROJECT_MAGIC = "MICPROJ";

export interface ProjectManifest {
  magic: typeof PROJECT_MAGIC;
  version: number;
  exportedAt: number;
  generator: string;
  experiments: {
    id: string;
    name: string;
    tiles: number;
    hasPanorama: boolean;
    detections: number;
    scale: number;
    bytes: number;
  }[];
}

export interface ProjectBundle {
  manifest: ProjectManifest;
  data: PersistShape;
}

function buildManifest(data: PersistShape, bytes: number): ProjectManifest {
  return {
    magic: PROJECT_MAGIC,
    version: PROJECT_VERSION,
    exportedAt: Date.now(),
    generator: "MicroStitch/microstitch-v1",
    experiments: data.experiments.map((e) => {
      const tiles = data.tiles[e.id] ?? [];
      let b = 0;
      for (const t of tiles) b += sizeOfDataUrl(t.dataUrl);
      const pano = data.panoramas[e.id] ?? null;
      if (pano) b += sizeOfDataUrl(pano.dataUrl);
      return {
        id: e.id,
        name: e.name,
        tiles: tiles.length,
        hasPanorama: !!pano,
        detections: (data.detections[e.id] ?? []).length,
        scale: e.scale,
        bytes: b,
      };
    }),
  };
  void bytes;
}

export function buildBundle(data: PersistShape): ProjectBundle {
  const manifest = buildManifest(data, 0);
  return { manifest, data };
}

export function validateBundle(json: unknown): ProjectBundle {
  if (!json || typeof json !== "object") throw new Error("项目包格式无效：不是 JSON 对象");
  const obj = json as Partial<ProjectBundle>;
  if (!obj.manifest || !obj.data) throw new Error("项目包格式无效：缺少 manifest 或 data");
  if (obj.manifest.magic !== PROJECT_MAGIC) throw new Error("项目包格式无效：magic 不匹配");
  if (typeof obj.manifest.version !== "number" || obj.manifest.version > PROJECT_VERSION) {
    throw new Error(`项目包版本 v${obj.manifest.version} 超过当前版本 v${PROJECT_VERSION}，请升级 MicroStitch`);
  }
  if (!Array.isArray(obj.data.experiments)) throw new Error("项目包 data.experiments 缺失");
  return obj as ProjectBundle;
}

export function totalBytesOf(bundle: ProjectBundle): number {
  let n = 0;
  for (const e of bundle.data.experiments) {
    for (const t of bundle.data.tiles[e.id] ?? []) n += sizeOfDataUrl(t.dataUrl);
    const p = bundle.data.panoramas[e.id];
    if (p) n += sizeOfDataUrl(p.dataUrl);
  }
  return n;
}

export function projectsOf(bundle: ProjectBundle) {
  return bundle.data.experiments.map((e) => ({
    id: e.id,
    experiment: e,
    stats: bundle.manifest.experiments.find((m) => m.id === e.id),
  }));
}

function encodeUtf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder("utf-8").decode(bytes);
}

// Simple binary container format for better compression than plain JSON:
// [4 bytes "MIC\0"] [4 bytes version u32 LE] [8 bytes manifestLen u64 LE] [manifest JSON bytes] [remainder reserved]
// For simplicity we still gzip-like encode as base64 with .micproj extension (JSON, but prefixed).
// Keep JSON for simplicity and portability.

export function serializeBundle(bundle: ProjectBundle): Blob {
  const json = JSON.stringify(bundle);
  return new Blob([`${PROJECT_MAGIC}\n${PROJECT_VERSION}\n`, json], {
    type: "application/x-microstitch-project+json",
  });
}

export async function deserializeBundle(blob: Blob): Promise<ProjectBundle> {
  const text = await blob.text();
  const nl1 = text.indexOf("\n");
  const nl2 = nl1 >= 0 ? text.indexOf("\n", nl1 + 1) : -1;
  if (nl1 < 0 || nl2 < 0) throw new Error("无法读取项目包头");
  const magic = text.slice(0, nl1);
  const verStr = text.slice(nl1 + 1, nl2);
  if (magic !== PROJECT_MAGIC) throw new Error("项目包头 magic 不匹配，不是有效的 MicroStitch 项目包");
  const ver = Number(verStr);
  if (!Number.isFinite(ver) || ver > PROJECT_VERSION) {
    throw new Error(`项目包版本 v${ver} 超过当前版本 v${PROJECT_VERSION}`);
  }
  const jsonText = text.slice(nl2 + 1);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    throw new Error("项目包 JSON 解析失败：" + (e instanceof Error ? e.message : String(e)));
  }
  return validateBundle(parsed);
  void encodeUtf8;
  void decodeUtf8;
}

export function exportProjectBundle(bundle: ProjectBundle, fileNameHint?: string) {
  const blob = serializeBundle(bundle);
  const name = fileNameHint
    ? sanitizeName(fileNameHint)
    : bundle.data.experiments.length === 1
      ? sanitizeName(bundle.data.experiments[0].name)
      : `microstitch_project_${new Date().toISOString().slice(0, 10)}`;
  downloadBlob(blob, `${name}.micproj`);
}

export interface ProjectCardInfo {
  exp: Experiment;
  tileCount: number;
  hasPanorama: boolean;
  detections: number;
  sizeBytes: number;
  sizeLabel: string;
}

export function summarizeProject(data: PersistShape): ProjectCardInfo[] {
  return data.experiments.map((e) => {
    const tiles = data.tiles[e.id] ?? [];
    let bytes = 0;
    for (const t of tiles) bytes += sizeOfDataUrl(t.dataUrl);
    const p = data.panoramas[e.id];
    if (p) bytes += sizeOfDataUrl(p.dataUrl);
    return {
      exp: e,
      tileCount: tiles.length,
      hasPanorama: !!p,
      detections: (data.detections[e.id] ?? []).length,
      sizeBytes: bytes,
      sizeLabel: formatSize(bytes),
    };
  });
}
