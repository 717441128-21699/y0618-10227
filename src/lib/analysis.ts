import type { Detection, MorphFilter, Stats, AuditEvent, AuditAction, DetectionStatus } from "@/types";
import { computeStats } from "./image";

export const AUDIT_LABEL: Record<AuditAction, string> = {
  "auto-detect": "自动检出",
  "manual-add": "人工添加",
  "mark-pending": "标为待确认",
  "mark-manual": "复核通过/转人工",
  "revert-auto": "退回自动",
  "delete": "删除",
  "import": "项目包导入",
};

export function auditEvent(action: AuditAction, fromStatus?: DetectionStatus, note?: string): AuditEvent {
  return { action, at: Date.now(), fromStatus, note };
}

export function ensureHistory(d: Detection): Detection {
  if (Array.isArray(d.history)) return d;
  const inferred: AuditAction = d.manual ? "manual-add" : "auto-detect";
  return { ...d, history: [auditEvent(inferred)] };
}

export function appendAudit(d: Detection, action: AuditAction, note?: string): Detection {
  const base = ensureHistory(d);
  return {
    ...base,
    history: [...base.history, auditEvent(action, base.status, note)],
  };
}

export function defaultFilter(): MorphFilter {
  return {
    minArea: 15,
    maxArea: 4000,
    minCircularity: 0,
    maxCircularity: 1,
    minAspectRatio: 1,
    maxAspectRatio: 5,
  };
}

export function aspectRatioOf(d: Detection): number {
  return d.minorAxis > 0 ? d.majorAxis / d.minorAxis : 1;
}

export function passesFilter(d: Detection, f: MorphFilter): boolean {
  if (d.status === "manual" || d.status === "pending") return true;
  const ar = aspectRatioOf(d);
  return (
    d.area >= f.minArea &&
    d.area <= f.maxArea &&
    d.circularity >= f.minCircularity &&
    d.circularity <= f.maxCircularity &&
    ar >= f.minAspectRatio &&
    ar <= f.maxAspectRatio
  );
}

export function filterDetections(detections: Detection[], f: MorphFilter): Detection[] {
  return detections.filter((d) => passesFilter(d, f));
}

export function summaryStats(detections: Detection[], key: keyof Detection): Stats {
  const values = detections.map((d) => Number(d[key])).filter((v) => Number.isFinite(v));
  const s = computeStats(values);
  return s as Stats;
}

export interface Histogram {
  edges: number[];
  counts: number[];
  min: number;
  max: number;
}

export function buildHistogram(values: number[], bins = 24): Histogram {
  if (values.length === 0) {
    return { edges: [], counts: [], min: 0, max: 0 };
  }
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (min === max) {
    max = min + 1;
  }
  const width = (max - min) / bins;
  const counts = new Array(bins).fill(0);
  const edges: number[] = [];
  for (let i = 0; i <= bins; i++) edges.push(min + i * width);
  for (const v of values) {
    let idx = Math.floor((v - min) / width);
    if (idx >= bins) idx = bins - 1;
    if (idx < 0) idx = 0;
    counts[idx]++;
  }
  return { edges, counts, min, max };
}

export function fmt(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1000) return n.toFixed(0);
  return n.toFixed(digits);
}
