import type { Detection, MorphFilter, Stats } from "@/types";
import { computeStats } from "./image";

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
