import { type Gray, clamp, gaussianBlur } from "./image";
import type { Detection } from "@/types";
import { auditEvent } from "@/lib/analysis";

export type Polarity = "bright" | "dark";

export interface SegmentOptions {
  polarity: Polarity;
  sensitivity: number;
  minArea: number;
  watershed: boolean;
  maxDetectDim?: number;
}

const INF = 1e20;

function adaptiveThreshold(g: Gray, blockSize: number, C: number, polarity: Polarity): Uint8Array {
  const { data, w, h } = g;
  const n = w * h;
  const integral = new Float64Array(n);
  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    for (let x = 0; x < w; x++) {
      rowSum += data[y * w + x];
      integral[y * w + x] = (y > 0 ? integral[(y - 1) * w + x] : 0) + rowSum;
    }
  }
  const r = blockSize >> 1;
  const mask = new Uint8Array(n);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h - 1, y + r);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w - 1, x + r);
      const area = (x1 - x0 + 1) * (y1 - y0 + 1);
      const sumA = integral[y1 * w + x1];
      const sumB = x0 > 0 ? integral[y1 * w + x0 - 1] : 0;
      const sumC = y0 > 0 ? integral[(y0 - 1) * w + x1] : 0;
      const sumD = x0 > 0 && y0 > 0 ? integral[(y0 - 1) * w + x0 - 1] : 0;
      const localMean = (sumA - sumB - sumC + sumD) / area;
      const diff = data[y * w + x] - localMean;
      const fg = polarity === "bright" ? diff > C : -diff > C;
      mask[y * w + x] = fg ? 1 : 0;
    }
  }
  return mask;
}

function erode(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  if (r <= 0) return mask.slice();
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 1;
      for (let dy = -r; dy <= r && v; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) {
          v = 0;
          break;
        }
        for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) {
            v = 0;
            break;
          }
          if (!mask[yy * w + xx]) {
            v = 0;
            break;
          }
        }
      }
      out[y * w + x] = v;
    }
  }
  return out;
}

function dilate(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  if (r <= 0) return mask.slice();
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let dy = -r; dy <= r && !v; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          if (mask[yy * w + xx]) {
            v = 1;
            break;
          }
        }
      }
      out[y * w + x] = v;
    }
  }
  return out;
}

function morphOpen(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  return dilate(erode(mask, w, h, r), w, h, r);
}

function morphClose(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  return erode(dilate(mask, w, h, r), w, h, r);
}

function fillHoles(mask: Uint8Array, w: number, h: number): Uint8Array {
  const n = w * h;
  const visited = new Uint8Array(n);
  const stack: number[] = [];
  for (let x = 0; x < w; x++) {
    if (!mask[x]) {
      visited[x] = 1;
      stack.push(x);
    }
    const b = (h - 1) * w + x;
    if (!mask[b]) {
      visited[b] = 1;
      stack.push(b);
    }
  }
  for (let y = 0; y < h; y++) {
    if (!mask[y * w]) {
      visited[y * w] = 1;
      stack.push(y * w);
    }
    if (!mask[y * w + w - 1]) {
      visited[y * w + w - 1] = 1;
      stack.push(y * w + w - 1);
    }
  }
  while (stack.length) {
    const p = stack.pop()!;
    const px = p % w;
    const py = (p / w) | 0;
    const nb = [
      px > 0 ? p - 1 : -1,
      px < w - 1 ? p + 1 : -1,
      py > 0 ? p - w : -1,
      py < h - 1 ? p + w : -1,
    ];
    for (const q of nb) {
      if (q >= 0 && !visited[q] && !mask[q]) {
        visited[q] = 1;
        stack.push(q);
      }
    }
  }
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = visited[i] ? mask[i] : 1;
  return out;
}

function dt1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array): void {
  let k = 0;
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const dist = q - v[k];
    d[q] = dist * dist + f[v[k]];
  }
}

export function distanceTransform(mask: Uint8Array, w: number, h: number): Float32Array {
  const n = w * h;
  const f = new Float64Array(n);
  const tmp = new Float64Array(n);
  for (let i = 0; i < n; i++) f[i] = mask[i] ? INF : 0;
  const v = new Int32Array(Math.max(w, h));
  const z = new Float64Array(Math.max(w, h) + 1);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = mask[y * w + x] ? INF : 0;
    dt1d(f, h, tmp, v, z);
    for (let y = 0; y < h; y++) f[y * w + x] = tmp[y];
  }
  for (let y = 0; y < h; y++) {
    const off = y * w;
    for (let x = 0; x < w; x++) f[x] = f[off + x];
    dt1d(f, w, tmp, v, z);
    for (let x = 0; x < w; x++) f[off + x] = Math.sqrt(tmp[x]);
  }
  return new Float32Array(f);
}

export interface LabelResult {
  labels: Int32Array;
  count: number;
  sizes: number[];
}

function connectedComponents(mask: Uint8Array, w: number, h: number): LabelResult {
  const n = w * h;
  const labels = new Int32Array(n).fill(0);
  const parent: number[] = [0];
  function find(a: number): number {
    let root = a;
    while (parent[root] !== root) root = parent[root];
    while (parent[a] !== root) {
      const next = parent[a];
      parent[a] = root;
      a = next;
    }
    return root;
  }
  function union(a: number, b: number) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  }
  let next = 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!mask[i]) continue;
      let cur = 0;
      if (x > 0 && labels[i - 1]) cur = labels[i - 1];
      if (y > 0) {
        if (labels[i - w]) {
          const up = labels[i - w];
          cur = cur ? (find(cur) === find(up) ? cur : (union(cur, up), Math.min(find(cur), cur))) : up;
        }
        if (x > 0 && labels[i - w - 1]) {
          const ul = labels[i - w - 1];
          cur = cur ? (union(cur, ul), Math.min(find(cur), cur)) : ul;
        }
        if (x < w - 1 && labels[i - w + 1]) {
          const ur = labels[i - w + 1];
          cur = cur ? (union(cur, ur), Math.min(find(cur), cur)) : ur;
        }
      }
      if (!cur) {
        cur = next;
        parent[next] = next;
        next++;
      }
      labels[i] = cur;
    }
  }
  const remap = new Int32Array(next);
  let count = 0;
  const sizes: number[] = [0];
  for (let i = 1; i < next; i++) {
    const r = find(i);
    if (remap[r] === 0) {
      count++;
      remap[r] = count;
      sizes.push(0);
    }
    remap[i] = remap[r];
  }
  for (let i = 0; i < n; i++) labels[i] = remap[labels[i]];
  for (let i = 0; i < n; i++) if (labels[i]) sizes[labels[i]]++;
  return { labels, count, sizes };
}

interface Seed {
  idx: number;
  d: number;
}

function findSeedsInComponent(
  dist: Float32Array,
  compPixels: number[],
  w: number,
  h: number,
  minDist: number,
  minValue: number
): Seed[] {
  const pixelSet = new Set(compPixels);
  const local: Seed[] = [];
  const nb = minDist * 2 + 1;
  for (const p of compPixels) {
    const d = dist[p];
    if (d < minValue) continue;
    const px = p % w;
    const py = (p / w) | 0;
    let isMax = true;
    for (let dy = -nb; dy <= nb && isMax; dy++) {
      const yy = py + dy;
      if (yy < 0 || yy >= h) continue;
      for (let dx = -nb; dx <= nb; dx++) {
        if (dx === 0 && dy === 0) continue;
        const xx = px + dx;
        if (xx < 0 || xx >= w) continue;
        const q = yy * w + xx;
        if (!pixelSet.has(q)) continue;
        if (dist[q] > d) {
          isMax = false;
          break;
        }
        if (dist[q] === d && q < p) {
          isMax = false;
          break;
        }
      }
    }
    if (isMax) local.push({ idx: p, d });
  }
  local.sort((a, b) => b.d - a.d);
  const seeds: Seed[] = [];
  for (const s of local) {
    const sx = s.idx % w;
    const sy = (s.idx / w) | 0;
    let ok = true;
    for (const e of seeds) {
      const ex = e.idx % w;
      const ey = (e.idx / w) | 0;
      const dd = Math.hypot(sx - ex, sy - ey);
      if (dd < minDist) {
        ok = false;
        break;
      }
    }
    if (ok) seeds.push(s);
  }
  return seeds;
}

class MaxHeap {
  data: { negD: number; idx: number; label: number }[] = [];
  push(item: { negD: number; idx: number; label: number }) {
    const d = this.data;
    d.push(item);
    let i = d.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (d[p].negD > d[i].negD) {
        [d[p], d[i]] = [d[i], d[p]];
        i = p;
      } else break;
    }
  }
  pop(): { negD: number; idx: number; label: number } | undefined {
    const d = this.data;
    if (d.length === 0) return undefined;
    const top = d[0];
    const last = d.pop()!;
    if (d.length > 0) {
      d[0] = last;
      let i = 0;
      const n = d.length;
      while (true) {
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        let smallest = i;
        if (l < n && d[l].negD < d[smallest].negD) smallest = l;
        if (r < n && d[r].negD < d[smallest].negD) smallest = r;
        if (smallest === i) break;
        [d[smallest], d[i]] = [d[i], d[smallest]];
        i = smallest;
      }
    }
    return top;
  }
  get size() {
    return this.data.length;
  }
}

function watershedComponent(
  dist: Float32Array,
  compPixels: number[],
  pixelSet: Set<number>,
  seeds: Seed[],
  w: number,
  h: number
): Map<number, number> {
  const labelMap = new Map<number, number>();
  if (seeds.length === 0) return labelMap;
  if (seeds.length === 1) {
    for (const p of compPixels) labelMap.set(p, seeds[0].idx);
    return labelMap;
  }
  const claimed = new Set<number>();
  const heap = new MaxHeap();
  seeds.forEach((s, i) => {
    labelMap.set(s.idx, i + 1);
    claimed.add(s.idx);
    heap.push({ negD: -s.d, idx: s.idx, label: i + 1 });
  });
  const offsets = [-1, 1, -w, w];
  while (heap.size > 0) {
    const top = heap.pop()!;
    const px = top.idx % w;
    for (const off of offsets) {
      if (off === -1 && px === 0) continue;
      if (off === 1 && px === w - 1) continue;
      const q = top.idx + off;
      if (q < 0 || q >= w * h) continue;
      if (!pixelSet.has(q) || claimed.has(q)) continue;
      labelMap.set(q, top.label);
      claimed.add(q);
      heap.push({ negD: -dist[q], idx: q, label: top.label });
    }
  }
  return labelMap;
}

export function segment(g: Gray, options: SegmentOptions): {
  detections: Detection[];
  labels: Int32Array;
  labelCount: number;
} {
  const { polarity, sensitivity, minArea, watershed: useWS } = options;
  const { w, h } = g;
  const blurred = gaussianBlur(g, 0.8);
  const adaptC = clamp((1 - sensitivity) * 18 + 4, 3, 30);
  const adaptBlock = Math.max(15, Math.round(Math.min(w, h) / 16) | 1);
  let mask = adaptiveThreshold(blurred, adaptBlock, adaptC, polarity);
  mask = morphOpen(mask, w, h, 1);
  mask = morphClose(mask, w, h, 1);
  mask = fillHoles(mask, w, h);
  const cc = connectedComponents(mask, w, h);
  const labels = new Int32Array(w * h);
  let labelCount = 0;
  if (useWS) {
    const dist = distanceTransform(mask, w, h);
    const compByPixel = new Map<number, number[]>();
    for (let i = 0; i < w * h; i++) {
      if (cc.labels[i]) {
        let arr = compByPixel.get(cc.labels[i]);
        if (!arr) {
          arr = [];
          compByPixel.set(cc.labels[i], arr);
        }
        arr.push(i);
      }
    }
    for (const [compId, pixels] of compByPixel) {
      if (pixels.length < minArea) continue;
      const pixelSet = new Set(pixels);
      let maxD = 0;
      for (const p of pixels) if (dist[p] > maxD) maxD = dist[p];
      const seedDist = clamp(maxD * 0.55, 3, 14);
      const seeds = findSeedsInComponent(dist, pixels, w, h, seedDist, Math.max(2.5, maxD * 0.4));
      const lm = watershedComponent(dist, pixels, pixelSet, seeds, w, h);
      for (const [p, l] of lm) {
        labels[p] = labelCount + l;
      }
      labelCount += seeds.length || 1;
    }
  } else {
    labels.set(cc.labels);
    labelCount = cc.count;
  }
  const detections = computeProperties(labels, labelCount, w, h, minArea);
  return { detections, labels, labelCount };
}

export function computeProperties(
  labels: Int32Array,
  labelCount: number,
  w: number,
  h: number,
  minArea: number
): Detection[] {
  const n = w * h;
  const stats = new Map<number, {
    area: number;
    sx: number;
    sy: number;
    sxx: number;
    syy: number;
    sxy: number;
    perim: number;
  }>();
  for (let i = 1; i <= labelCount; i++) {
    stats.set(i, { area: 0, sx: 0, sy: 0, sxx: 0, syy: 0, sxy: 0, perim: 0 });
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const lab = labels[i];
      if (!lab) continue;
      const s = stats.get(lab)!;
      s.area++;
      s.sx += x;
      s.sy += y;
      s.sxx += x * x;
      s.syy += y * y;
      s.sxy += x * y;
      const left = x > 0 ? labels[i - 1] : -1;
      const right = x < w - 1 ? labels[i + 1] : -1;
      const up = y > 0 ? labels[i - w] : -1;
      const down = y < h - 1 ? labels[i + w] : -1;
      if (left !== lab || right !== lab || up !== lab || down !== lab) {
        s.perim++;
      }
    }
  }
  const out: Detection[] = [];
  let id = 0;
  for (const [, s] of stats) {
    if (s.area < minArea) continue;
    const cx = s.sx / s.area;
    const cy = s.sy / s.area;
    const mxx = s.sxx / s.area - cx * cx;
    const myy = s.syy / s.area - cy * cy;
    const mxy = s.sxy / s.area - cx * cy;
    const common = Math.sqrt((mxx - myy) * (mxx - myy) + 4 * mxy * mxy);
    const lam1 = (mxx + myy + common) / 2;
    const lam2 = (mxx + myy - common) / 2;
    const majorAxis = 2 * Math.sqrt(Math.max(0, lam1));
    const minorAxis = 2 * Math.sqrt(Math.max(0, lam2));
    const angle = 0.5 * Math.atan2(2 * mxy, mxx - myy);
    const perimeter = s.perim;
    const circularity = perimeter > 0 ? clamp((4 * Math.PI * s.area) / (perimeter * perimeter), 0, 1) : 0;
    out.push({
      id: id++,
      cx,
      cy,
      area: s.area,
      perimeter,
      majorAxis,
      minorAxis,
      circularity,
      angle,
      manual: false,
      status: "auto",
      history: [auditEvent("auto-detect")],
    });
  }
  return out;
}
