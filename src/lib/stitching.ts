import {
  type Gray,
  clamp,
  gaussianBlur,
  buildLaplacianPyramid,
  reconstructFromLaplacian,
  downsample,
  upsample,
} from "./image";
import type { SeamRect } from "@/types";

export interface Corner {
  x: number;
  y: number;
  r: number;
}

function sobelGradients(g: Gray): { ix: Float32Array; iy: Float32Array } {
  const { data, w, h } = g;
  const ix = new Float32Array(w * h);
  const iy = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const xm = x > 0 ? x - 1 : 0;
      const xp = x < w - 1 ? x + 1 : w - 1;
      const ym = y > 0 ? y - 1 : 0;
      const yp = y < h - 1 ? y + 1 : h - 1;
      const tl = data[ym * w + xm];
      const tc = data[ym * w + x];
      const tr = data[ym * w + xp];
      const ml = data[y * w + xm];
      const mr = data[y * w + xp];
      const bl = data[yp * w + xm];
      const bc = data[yp * w + x];
      const br = data[yp * w + xp];
      const gx = tr + 2 * mr + br - (tl + 2 * ml + bl);
      const gy = bl + 2 * bc + br - (tl + 2 * tc + tr);
      ix[i] = gx;
      iy[i] = gy;
    }
  }
  return { ix, iy };
}

export function harrisCorners(g: Gray, maxCorners = 220, k = 0.04): Corner[] {
  const { w, h } = g;
  const blur = gaussianBlur(g, 1.0);
  const { ix, iy } = sobelGradients(blur);
  const n = w * h;
  const ix2 = new Float32Array(n);
  const iy2 = new Float32Array(n);
  const ixy = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    ix2[i] = ix[i] * ix[i];
    iy2[i] = iy[i] * iy[i];
    ixy[i] = ix[i] * iy[i];
  }
  const structA = gaussianBlur({ data: ix2, w, h }, 1.5);
  const structB = gaussianBlur({ data: iy2, w, h }, 1.5);
  const structC = gaussianBlur({ data: ixy, w, h }, 1.5);
  const response = new Float32Array(n);
  let maxR = 0;
  for (let i = 0; i < n; i++) {
    const a = structA.data[i];
    const b = structB.data[i];
    const c = structC.data[i];
    const det = a * b - c * c;
    const trace = a + b;
    const r = det - k * trace * trace;
    response[i] = r;
    if (r > maxR) maxR = r;
  }
  const thresh = Math.max(1e-6, maxR * 0.01);
  const winsz = 7;
  const half = winsz >> 1;
  const candidates: Corner[] = [];
  for (let y = half; y < h - half; y++) {
    for (let x = half; x < w - half; x++) {
      const i = y * w + x;
      const r = response[i];
      if (r < thresh) continue;
      let isMax = true;
      for (let dy = -half; dy <= half && isMax; dy++) {
        for (let dx = -half; dx <= half; dx++) {
          if (dx === 0 && dy === 0) continue;
          if (response[(y + dy) * w + (x + dx)] > r) {
            isMax = false;
            break;
          }
        }
      }
      if (isMax) candidates.push({ x, y, r });
    }
  }
  candidates.sort((a, b) => b.r - a.r);
  const picked: Corner[] = [];
  const minDist = 8;
  for (const c of candidates) {
    let ok = true;
    for (const p of picked) {
      const dx = p.x - c.x;
      const dy = p.y - c.y;
      if (dx * dx + dy * dy < minDist * minDist) {
        ok = false;
        break;
      }
    }
    if (ok) {
      picked.push(c);
      if (picked.length >= maxCorners) break;
    }
  }
  return picked;
}

interface Patch {
  v: Float32Array;
  n: number;
}

function extractNormalizedPatch(g: Gray, cx: number, cy: number, r: number): Patch | null {
  const size = r * 2 + 1;
  const v = new Float32Array(size * size);
  let sum = 0;
  let cnt = 0;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= g.w || y >= g.h) {
        v[(dy + r) * size + (dx + r)] = NaN;
      } else {
        const val = g.data[y * g.w + x];
        v[(dy + r) * size + (dx + r)] = val;
        sum += val;
        cnt++;
      }
    }
  }
  if (cnt < size * size * 0.6) return null;
  const mean = sum / cnt;
  let nrm = 0;
  for (let i = 0; i < v.length; i++) {
    if (isNaN(v[i])) v[i] = 0;
    else {
      v[i] -= mean;
      nrm += v[i] * v[i];
    }
  }
  nrm = Math.sqrt(nrm) + 1e-9;
  for (let i = 0; i < v.length; i++) v[i] /= nrm;
  return { v, n: nrm };
}

function ncc(a: Patch, b: Patch): number {
  const av = a.v;
  const bv = b.v;
  let s = 0;
  for (let i = 0; i < av.length; i++) s += av[i] * bv[i];
  return s;
}

export interface PairMatch {
  dx: number;
  dy: number;
  score: number;
  pairs: number;
}

export function matchPair(ref: Gray, cand: Gray, searchRadius: number): PairMatch | null {
  const refCorners = harrisCorners(ref, 160);
  const candCorners = harrisCorners(cand, 160);
  if (refCorners.length < 6 || candCorners.length < 6) return null;
  const pr = 4;
  const refPatches = new Map<number, Patch | null>();
  refCorners.forEach((c, idx) => refPatches.set(idx, extractNormalizedPatch(ref, c.x, c.y, pr)));
  const candSubset = candCorners.length > 48 ? sampleEvenly(candCorners, 48) : candCorners;
  const votes = new Map<string, { score: number; count: number }>();
  for (const cc of candSubset) {
    const cp = extractNormalizedPatch(cand, cc.x, cc.y, pr);
    if (!cp) continue;
    let localBest = -1;
    let localMatch: { rx: number; ry: number } | null = null;
    for (let ri = 0; ri < refCorners.length; ri++) {
      const rc = refCorners[ri];
      const ddx = rc.x - cc.x;
      const ddy = rc.y - cc.y;
      if (Math.abs(ddx) > searchRadius || Math.abs(ddy) > searchRadius) continue;
      const rp = refPatches.get(ri);
      if (!rp) continue;
      const s = ncc(cp, rp);
      if (s > localBest) {
        localBest = s;
        localMatch = { rx: rc.x, ry: rc.y };
      }
    }
    if (localBest > 0.6 && localMatch) {
      const dx = localMatch.rx - cc.x;
      const dy = localMatch.ry - cc.y;
      const bx = Math.round(dx / 2) * 2;
      const by = Math.round(dy / 2) * 2;
      const key = `${bx},${by}`;
      const e = votes.get(key) ?? { score: 0, count: 0 };
      e.score += localBest;
      e.count += 1;
      votes.set(key, e);
    }
  }
  let bestVote: { key: string; score: number; count: number } | null = null;
  for (const [key, e] of votes) {
    if (!bestVote || e.score > bestVote.score) bestVote = { key, score: e.score, count: e.count };
  }
  if (!bestVote || bestVote.count < 3) return null;
  const [bx, by] = bestVote.key.split(",").map(Number);
  const tol = 4;
  let sx = 0;
  let sy = 0;
  let scnt = 0;
  for (const cc of candSubset) {
    const cp = extractNormalizedPatch(cand, cc.x, cc.y, pr);
    if (!cp) continue;
    let localBest = -1;
    let localMatch: { rx: number; ry: number } | null = null;
    for (let ri = 0; ri < refCorners.length; ri++) {
      const rc = refCorners[ri];
      const ddx = rc.x - cc.x - bx;
      const ddy = rc.y - cc.y - by;
      if (Math.abs(ddx) > tol || Math.abs(ddy) > tol) continue;
      const rp = refPatches.get(ri);
      if (!rp) continue;
      const s = ncc(cp, rp);
      if (s > localBest) {
        localBest = s;
        localMatch = { rx: rc.x, ry: rc.y };
      }
    }
    if (localBest > 0.55 && localMatch) {
      sx += localMatch.rx - cc.x;
      sy += localMatch.ry - cc.y;
      scnt++;
    }
  }
  const dx = scnt > 0 ? sx / scnt : bx;
  const dy = scnt > 0 ? sy / scnt : by;
  return { dx, dy, score: bestVote.score / bestVote.count, pairs: bestVote.count };
}

function sampleEvenly<T>(arr: T[], n: number): T[] {
  const out: T[] = [];
  const step = arr.length / n;
  for (let i = 0; i < n; i++) out.push(arr[Math.floor(i * step)]);
  return out;
}

export interface PlacedTile {
  idx: number;
  offsetX: number;
  offsetY: number;
  parent: number;
  matchScore: number;
}

export interface RegistrationResult {
  offsets: { x: number; y: number }[];
  placed: PlacedTile[];
  matched: boolean[];
}

export function registerTiles(
  tiles: Gray[],
  refIndex: number,
  onProgress?: (done: number, total: number) => void
): RegistrationResult {
  const n = tiles.length;
  const offsets: { x: number; y: number }[] = new Array(n).fill(null).map(() => ({ x: 0, y: 0 }));
  const placed: PlacedTile[] = [{ idx: refIndex, offsetX: 0, offsetY: 0, parent: -1, matchScore: 1 }];
  const placedSet = new Set<number>([refIndex]);
  const matched = new Array(n).fill(false);
  matched[refIndex] = true;
  const searchRadius = Math.max(tiles[refIndex].w, tiles[refIndex].h);
  let attempts = 0;
  while (placed.length < n && attempts < n * n + 4) {
    attempts++;
    let best: { cand: number; parent: number; dx: number; dy: number; score: number } | null = null;
    for (const p of placed) {
      for (let c = 0; c < n; c++) {
        if (placedSet.has(c)) continue;
        const m = matchPair(tiles[p.idx], tiles[c], searchRadius);
        if (m && (!best || m.score > best.score)) {
          best = { cand: c, parent: p.idx, dx: m.dx, dy: m.dy, score: m.score };
        }
      }
      if (onProgress) onProgress(placed.length, n);
    }
    if (!best) break;
    const parent = placed.find((p) => p.idx === best!.parent)!;
    const newOffset = {
      x: parent.offsetX + best.dx,
      y: parent.offsetY + best.dy,
    };
    offsets[best.cand] = newOffset;
    placed.push({
      idx: best.cand,
      offsetX: newOffset.x,
      offsetY: newOffset.y,
      parent: best.parent,
      matchScore: best.score,
    });
    placedSet.add(best.cand);
    matched[best.cand] = true;
  }
  return { offsets, placed, matched };
}

function overlapStats(
  a: Gray,
  b: Gray,
  offA: { x: number; y: number },
  offB: { x: number; y: number }
): { mA: number; sA: number; mB: number; sB: number; n: number } {
  const ax0 = offA.x;
  const ay0 = offA.y;
  const ax1 = offA.x + a.w;
  const ay1 = offA.y + a.h;
  const bx0 = offB.x;
  const by0 = offB.y;
  const bx1 = offB.x + b.w;
  const by1 = offB.y + b.h;
  const x0 = Math.max(ax0, bx0);
  const y0 = Math.max(ay0, by0);
  const x1 = Math.min(ax1, bx1);
  const y1 = Math.min(ay1, by1);
  if (x1 <= x0 || y1 <= y0) return { mA: 0, sA: 0, mB: 0, sB: 0, n: 0 };
  let sa = 0;
  let sb = 0;
  let n = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      sa += a.data[(y - ay0) * a.w + (x - ax0)];
      sb += b.data[(y - by0) * b.w + (x - bx0)];
      n++;
    }
  }
  if (n === 0) return { mA: 0, sA: 0, mB: 0, sB: 0, n: 0 };
  const mA = sa / n;
  const mB = sb / n;
  let va = 0;
  let vb = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const da = a.data[(y - ay0) * a.w + (x - ax0)] - mA;
      const db = b.data[(y - by0) * b.w + (x - bx0)] - mB;
      va += da * da;
      vb += db * db;
    }
  }
  return { mA, sA: Math.sqrt(va / n), mB, sB: Math.sqrt(vb / n), n };
}

export function equalizeBrightness(
  tiles: Gray[],
  placed: PlacedTile[]
): Gray[] {
  const out = tiles.map((t) => ({ data: t.data.slice(), w: t.w, h: t.h }));
  const byIdx = new Map<number, PlacedTile>();
  placed.forEach((p) => byIdx.set(p.idx, p));
  for (const p of placed) {
    if (p.parent < 0) continue;
    const child = out[p.idx];
    const parent = out[p.parent];
    const parentOffset = byIdx.get(p.parent)!;
    const stats = overlapStats(parent, child, { x: parentOffset.offsetX, y: parentOffset.offsetY }, { x: p.offsetX, y: p.offsetY });
    if (stats.n < 30 || stats.sB < 1e-3) continue;
    const gain = clamp(stats.sA / stats.sB, 0.5, 2);
    const bias = stats.mA - gain * stats.mB;
    for (let i = 0; i < child.data.length; i++) {
      child.data[i] = clamp(gain * child.data[i] + bias, 0, 255);
    }
  }
  return out;
}

function featherWeight(w: number, h: number, feather: number): Float32Array {
  const data = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const dy = Math.min(y, h - 1 - y);
    for (let x = 0; x < w; x++) {
      const dx = Math.min(x, w - 1 - x);
      const d = Math.min(dx, dy);
      data[y * w + x] = clamp(d / feather, 0, 1);
    }
  }
  return data;
}

function buildGaussianPyramid(g: Gray, levels: number): Gray[] {
  const pyr: Gray[] = [g];
  let cur = g;
  for (let l = 1; l < levels; l++) {
    if (cur.w < 8 || cur.h < 8) break;
    cur = downsample(cur);
    pyr.push(cur);
  }
  return pyr;
}

export function multiBandBlend(
  layers: Gray[],
  weights: Float32Array[],
  pw: number,
  ph: number,
  levels: number
): Gray {
  const maxLevels = Math.min(levels, Math.floor(Math.log2(Math.max(pw, ph))) - 1);
  const L = Math.max(1, maxLevels);
  const layerPyrs = layers.map((l) => buildLaplacianPyramid(l, L));
  const weightPyrs = weights.map((w) => buildGaussianPyramid({ data: w, w: pw, h: ph }, L));
  const blended: Gray[] = [];
  for (let l = 0; l < L; l++) {
    const lw = layerPyrs[0][l].w;
    const lh = layerPyrs[0][l].h;
    const num = new Float32Array(lw * lh);
    const den = new Float32Array(lw * lh);
    for (let i = 0; i < layers.length; i++) {
      const lap = layerPyrs[i][l];
      const wgt = weightPyrs[i][l]?.data;
      if (!wgt) continue;
      for (let p = 0; p < lap.data.length; p++) {
        num[p] += lap.data[p] * wgt[p];
        den[p] += wgt[p];
      }
    }
    const out = new Float32Array(lw * lh);
    for (let p = 0; p < out.length; p++) {
      out[p] = den[p] > 1e-6 ? num[p] / den[p] : 0;
    }
    blended.push({ data: out, w: lw, h: lh });
  }
  return reconstructFromLaplacian(blended);
}

export interface StitchResult {
  panorama: Gray;
  offsets: { x: number; y: number }[];
  seams: SeamRect[];
  matched: boolean[];
}

export function stitch(
  tiles: Gray[],
  refIndex: number,
  options: { equalize: boolean; onProgress?: (p: number, label: string) => void } = { equalize: true }
): StitchResult {
  const { equalize, onProgress } = options;
  onProgress?.(0.05, "提取特征点");
  const reg = registerTiles(tiles, refIndex, (d, t) => onProgress?.(0.05 + 0.5 * (d / t), "特征匹配"));
  let workTiles = tiles;
  if (equalize) {
    onProgress?.(0.6, "亮度均衡");
    workTiles = equalizeBrightness(tiles, reg.placed);
  }
  let minX = 0;
  let minY = 0;
  let maxX = 0;
  let maxY = 0;
  reg.placed.forEach((p) => {
    minX = Math.min(minX, p.offsetX);
    minY = Math.min(minY, p.offsetY);
    maxX = Math.max(maxX, p.offsetX + tiles[p.idx].w);
    maxY = Math.max(maxY, p.offsetY + tiles[p.idx].h);
  });
  const pw = maxX - minX;
  const ph = maxY - minY;
  const shiftX = -minX;
  const shiftY = -minY;
  const layers: Gray[] = [];
  const weights: Float32Array[] = [];
  const feather = Math.min(24, Math.floor(Math.min(tiles[0].w, tiles[0].h) / 6));
  for (const p of reg.placed) {
    const t = workTiles[p.idx];
    const layer = new Float32Array(pw * ph);
    const ox = p.offsetX + shiftX;
    const oy = p.offsetY + shiftY;
    for (let y = 0; y < t.h; y++) {
      for (let x = 0; x < t.w; x++) {
        layer[(y + oy) * pw + (x + ox)] = t.data[y * t.w + x];
      }
    }
    layers.push({ data: layer, w: pw, h: ph });
    const wFull = new Float32Array(pw * ph);
    const fw = featherWeight(t.w, t.h, feather);
    for (let y = 0; y < t.h; y++) {
      for (let x = 0; x < t.w; x++) {
        wFull[(y + oy) * pw + (x + ox)] = fw[y * t.w + x];
      }
    }
    weights.push(wFull);
  }
  onProgress?.(0.75, "多频带融合");
  const panorama = multiBandBlend(layers, weights, pw, ph, 5);
  onProgress?.(0.95, "生成全景");
  const seams: SeamRect[] = [];
  for (let i = 0; i < reg.placed.length; i++) {
    for (let j = i + 1; j < reg.placed.length; j++) {
      const a = reg.placed[i];
      const b = reg.placed[j];
      const ax0 = a.offsetX + shiftX;
      const ay0 = a.offsetY + shiftY;
      const ax1 = ax0 + tiles[a.idx].w;
      const ay1 = ay0 + tiles[a.idx].h;
      const bx0 = b.offsetX + shiftX;
      const by0 = b.offsetY + shiftY;
      const bx1 = bx0 + tiles[b.idx].w;
      const by1 = by0 + tiles[b.idx].h;
      const x0 = Math.max(ax0, bx0);
      const y0 = Math.max(ay0, by0);
      const x1 = Math.min(ax1, bx1);
      const y1 = Math.min(ay1, by1);
      if (x1 - x0 > 8 && y1 - y0 > 8) {
        seams.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
      }
    }
  }
  onProgress?.(1, "完成");
  return { panorama, offsets: reg.offsets, seams, matched: reg.matched };
}
