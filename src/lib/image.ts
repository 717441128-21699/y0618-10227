export interface Gray {
  data: Float32Array;
  w: number;
  h: number;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function makeGray(w: number, h: number, fill = 0): Gray {
  return { data: new Float32Array(w * h).fill(fill), w, h };
}

export function loadImageEl(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}

export function imageElToCanvas(img: HTMLImageElement, maxDim = 768): HTMLCanvasElement {
  let w = img.naturalWidth || img.width;
  let h = img.naturalHeight || img.height;
  const scale = Math.min(1, maxDim / Math.max(w, h));
  w = Math.round(w * scale);
  h = Math.round(h * scale);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0, w, h);
  return c;
}

export function dataUrlToGray(dataUrl: string, maxDim = 1024): Promise<Gray> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = imageElToCanvas(img, maxDim);
      resolve(canvasToGray(canvas));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

export interface UploadedTile {
  name: string;
  dataUrl: string;
  width: number;
  height: number;
}

export async function readImageFilesToTiles(files: File[], maxDim = 768): Promise<UploadedTile[]> {
  const out: UploadedTile[] = [];
  for (const file of files) {
    if (!file.type.startsWith("image/")) continue;
    const dataUrl = await fileToDataUrl(file);
    const img = await loadImageEl(dataUrl);
    const canvas = imageElToCanvas(img, maxDim);
    const name = file.name.replace(/\.[^.]+$/, "");
    out.push({
      name,
      dataUrl: canvas.toDataURL("image/jpeg", 0.92),
      width: canvas.width,
      height: canvas.height,
    });
  }
  return out;
}

export function canvasToGray(canvas: HTMLCanvasElement): Gray {
  const ctx = canvas.getContext("2d")!;
  const { width: w, height: h } = canvas;
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = grayFromRGBA(imgData.data, w, h);
  return { data, w, h };
}

export function grayFromRGBA(rgba: Uint8ClampedArray, w: number, h: number): Float32Array {
  const n = w * h;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const j = i * 4;
    out[i] = 0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2];
  }
  return out;
}

export function grayToCanvas(g: Gray, colormap?: "gray" | "heat"): HTMLCanvasElement {
  const { data, w, h } = g;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const id = ctx.createImageData(w, h);
  const d = id.data;
  for (let i = 0; i < data.length; i++) {
    let v = clamp(data[i], 0, 255);
    if (colormap === "heat") {
      const t = v / 255;
      d[i * 4] = clamp(255 * Math.min(1, t * 2), 0, 255);
      d[i * 4 + 1] = clamp(255 * Math.max(0, t * 2 - 0.5), 0, 255);
      d[i * 4 + 2] = clamp(255 * Math.max(0, 0.6 - t), 0, 255);
    } else {
      const vi = v | 0;
      d[i * 4] = vi;
      d[i * 4 + 1] = vi;
      d[i * 4 + 2] = vi;
    }
    d[i * 4 + 3] = 255;
  }
  ctx.putImageData(id, 0, 0);
  return c;
}

export function meanOf(g: Gray): number {
  let s = 0;
  const d = g.data;
  for (let i = 0; i < d.length; i++) s += d[i];
  return s / d.length;
}

export function downscaleGray(g: Gray, factor: number): Gray {
  if (factor <= 1) return { data: g.data.slice(), w: g.w, h: g.h };
  const w = Math.max(1, Math.round(g.w / factor));
  const h = Math.max(1, Math.round(g.h / factor));
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      let cnt = 0;
      const x0 = Math.floor(x * factor);
      const y0 = Math.floor(y * factor);
      const x1 = Math.min(g.w, Math.ceil((x + 1) * factor));
      const y1 = Math.min(g.h, Math.ceil((y + 1) * factor));
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          acc += g.data[yy * g.w + xx];
          cnt++;
        }
      }
      out[y * w + x] = acc / Math.max(1, cnt);
    }
  }
  return { data: out, w, h };
}

function gaussianKernel(sigma: number): Float32Array {
  const radius = Math.max(1, Math.ceil(sigma * 2.5));
  const size = radius * 2 + 1;
  const k = new Float32Array(size);
  let sum = 0;
  const s2 = 2 * sigma * sigma;
  for (let i = -radius; i <= radius; i++) {
    const v = Math.exp(-(i * i) / s2);
    k[i + radius] = v;
    sum += v;
  }
  for (let i = 0; i < size; i++) k[i] /= sum;
  return k;
}

export function gaussianBlur(g: Gray, sigma: number): Gray {
  if (sigma <= 0) return { data: g.data.slice(), w: g.w, h: g.h };
  const { data: src, w, h } = g;
  const k = gaussianKernel(sigma);
  const radius = (k.length - 1) >> 1;
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let r = -radius; r <= radius; r++) {
        let xx = x + r;
        if (xx < 0) xx = 0;
        else if (xx >= w) xx = w - 1;
        acc += src[row + xx] * k[r + radius];
      }
      tmp[row + x] = acc;
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let acc = 0;
      for (let r = -radius; r <= radius; r++) {
        let yy = y + r;
        if (yy < 0) yy = 0;
        else if (yy >= h) yy = h - 1;
        acc += tmp[yy * w + x] * k[r + radius];
      }
      out[y * w + x] = acc;
    }
  }
  return { data: out, w, h };
}

function at(g: Gray, x: number, y: number): number {
  if (x < 0) x = 0;
  else if (x >= g.w) x = g.w - 1;
  if (y < 0) y = 0;
  else if (y >= g.h) y = g.h - 1;
  return g.data[y * g.w + x];
}

export function downsample(g: Gray): Gray {
  const w = Math.max(1, g.w >> 1);
  const h = Math.max(1, g.h >> 1);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = x * 2;
      const sy = y * 2;
      out[y * w + x] =
        (at(g, sx, sy) + at(g, sx + 1, sy) + at(g, sx, sy + 1) + at(g, sx + 1, sy + 1)) * 0.25;
    }
  }
  return { data: out, w, h };
}

export function upsample(g: Gray, tw: number, th: number): Gray {
  const out = new Float32Array(tw * th);
  const xRatio = g.w / tw;
  const yRatio = g.h / th;
  for (let y = 0; y < th; y++) {
    const gy = (y + 0.5) * yRatio - 0.5;
    const y0 = Math.floor(gy);
    const fy = gy - y0;
    const y1 = y0 + 1;
    for (let x = 0; x < tw; x++) {
      const gx = (x + 0.5) * xRatio - 0.5;
      const x0 = Math.floor(gx);
      const fx = gx - x0;
      const x1 = x0 + 1;
      const v00 = at(g, x0, y0);
      const v01 = at(g, x0, y1);
      const v10 = at(g, x1, y0);
      const v11 = at(g, x1, y1);
      const a = v00 + (v10 - v00) * fx;
      const b = v01 + (v11 - v01) * fx;
      out[y * tw + x] = a + (b - a) * fy;
    }
  }
  return { data: out, w: tw, h: th };
}

export function buildLaplacianPyramid(g: Gray, levels: number): Gray[] {
  const gauss: Gray[] = [g];
  let cur = g;
  let cw = g.w;
  let ch = g.h;
  for (let l = 1; l < levels; l++) {
    if (cw < 8 || ch < 8) break;
    cur = downsample(cur);
    gauss.push(cur);
    cw = cur.w;
    ch = cur.h;
  }
  const lap: Gray[] = [];
  for (let l = 0; l < gauss.length - 1; l++) {
    const up = upsample(gauss[l + 1], gauss[l].w, gauss[l].h);
    const diff = new Float32Array(gauss[l].data.length);
    for (let i = 0; i < diff.length; i++) diff[i] = gauss[l].data[i] - up.data[i];
    lap.push({ data: diff, w: gauss[l].w, h: gauss[l].h });
  }
  lap.push(gauss[gauss.length - 1]);
  return lap;
}

export function reconstructFromLaplacian(lap: Gray[]): Gray {
  let cur = lap[lap.length - 1];
  for (let l = lap.length - 2; l >= 0; l--) {
    const up = upsample(cur, lap[l].w, lap[l].h);
    const out = new Float32Array(lap[l].data.length);
    for (let i = 0; i < out.length; i++) out[i] = lap[l].data[i] + up.data[i];
    cur = { data: out, w: lap[l].w, h: lap[l].h };
  }
  return cur;
}

export function histogram(g: Gray): Float32Array {
  const hist = new Float32Array(256);
  for (let i = 0; i < g.data.length; i++) {
    hist[clamp(g.data[i], 0, 255) | 0]++;
  }
  return hist;
}

export function otsuThreshold(g: Gray): number {
  const hist = histogram(g);
  const total = g.data.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let maxVar = 0;
  let threshold = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > maxVar) {
      maxVar = between;
      threshold = t;
    }
  }
  return threshold;
}

export function computeStats(values: number[]): StatsLike {
  const n = values.length;
  if (n === 0) {
    return { count: 0, mean: 0, median: 0, std: 0, min: 0, max: 0, p25: 0, p75: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  const variance = sorted.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);
  const pct = (p: number) => sorted[Math.min(n - 1, Math.floor(p * n))];
  return {
    count: n,
    mean,
    median: pct(0.5),
    std,
    min: sorted[0],
    max: sorted[n - 1],
    p25: pct(0.25),
    p75: pct(0.75),
  };
}

export interface StatsLike {
  count: number;
  mean: number;
  median: number;
  std: number;
  min: number;
  max: number;
  p25: number;
  p75: number;
}
