function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SampleCell {
  cx: number;
  cy: number;
  r: number;
  aspect: number;
  angle: number;
  intensity: number;
}

export interface GeneratedSample {
  tiles: { dataUrl: string; width: number; height: number }[];
  fieldWidth: number;
  fieldHeight: number;
  cellCount: number;
  stepX: number;
  stepY: number;
}

export interface SampleConfig {
  cols: number;
  rows: number;
  tile: number;
  step: number;
  cellDensity: number;
  brightnessJitter: number;
  seed: number;
  clusterFactor: number;
}

const DEFAULT_CONFIG: SampleConfig = {
  cols: 3,
  rows: 2,
  tile: 300,
  step: 220,
  cellDensity: 1,
  brightnessJitter: 0.18,
  seed: 1337,
  clusterFactor: 0.3,
};

function generateField(width: number, height: number, cfg: SampleConfig): { field: Float32Array; cells: SampleCell[] } {
  const rng = mulberry32(cfg.seed);
  const field = new Float32Array(width * height);
  for (let i = 0; i < field.length; i++) field[i] = 26 + rng() * 6;
  const baseCount = Math.round((width * height) / 9000 * cfg.cellDensity);
  const cells: SampleCell[] = [];
  for (let i = 0; i < baseCount; i++) {
    const cx = rng() * width;
    const cy = rng() * height;
    const r = 7 + rng() * 13;
    const aspect = rng() < 0.6 ? 1 + rng() * 0.25 : 1.25 + rng() * 0.7;
    const angle = rng() * Math.PI;
    const intensity = 120 + rng() * 90;
    cells.push({ cx, cy, r, aspect, angle, intensity });
    if (rng() < cfg.clusterFactor && i < baseCount - 1) {
      for (let k = 0; k < 2 + Math.floor(rng() * 2); k++) {
        const ang = rng() * Math.PI * 2;
        const dist = r * (1.4 + rng() * 0.6);
        cells.push({
          cx: cx + Math.cos(ang) * dist,
          cy: cy + Math.sin(ang) * dist,
          r: r * (0.8 + rng() * 0.4),
          aspect,
          angle: rng() * Math.PI,
          intensity: intensity * (0.85 + rng() * 0.3),
        });
        i++;
      }
    }
  }
  for (const c of cells) {
    const r = c.r;
    const sigmaA = r / 2.4;
    const sigmaB = (r / 2.4) / c.aspect;
    const cos = Math.cos(c.angle);
    const sin = Math.sin(c.angle);
    const bb = Math.ceil(r * c.aspect) + 1;
    const x0 = Math.max(0, Math.floor(c.cx - bb));
    const x1 = Math.min(width - 1, Math.ceil(c.cx + bb));
    const y0 = Math.max(0, Math.floor(c.cy - bb));
    const y1 = Math.min(height - 1, Math.ceil(c.cy + bb));
    const twoA = 2 * sigmaA * sigmaA;
    const twoB = 2 * sigmaB * sigmaB;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - c.cx;
        const dy = y - c.cy;
        const u = dx * cos + dy * sin;
        const v = -dx * sin + dy * cos;
        const g = Math.exp(-(u * u) / twoA - (v * v) / twoB);
        field[y * width + x] += c.intensity * g;
      }
    }
  }
  const cx = width / 2;
  const cy = height / 2;
  const maxR = Math.hypot(cx, cy);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const d = Math.hypot(x - cx, y - cy) / maxR;
      const vignette = 1 - d * d * 0.32;
      field[y * width + x] *= vignette;
    }
  }
  for (let i = 0; i < field.length; i++) {
    const n = (rng() - 0.5) * 6;
    field[i] = Math.max(0, Math.min(255, field[i] + n));
  }
  return { field, cells };
}

function fieldToTileCanvas(
  field: Float32Array,
  fw: number,
  fh: number,
  ox: number,
  oy: number,
  tw: number,
  th: number,
  gain: number,
  bias: number
): string {
  const canvas = document.createElement("canvas");
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(tw, th);
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const fx = ox + x;
      const fy = oy + y;
      let v = 0;
      if (fx >= 0 && fy >= 0 && fx < fw && fy < fh) {
        v = field[fy * fw + fx] * gain + bias;
      }
      v = Math.max(0, Math.min(255, v));
      const idx = (y * tw + x) * 4;
      img.data[idx] = v;
      img.data[idx + 1] = v;
      img.data[idx + 2] = v;
      img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL("image/jpeg", 0.92);
}

export function generateSampleTiles(config: Partial<SampleConfig> = {}): GeneratedSample {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const rng = mulberry32(cfg.seed + 7);
  const fieldWidth = cfg.step * (cfg.cols - 1) + cfg.tile;
  const fieldHeight = cfg.step * (cfg.rows - 1) + cfg.tile;
  const { field, cells } = generateField(fieldWidth, fieldHeight, cfg);
  const tiles: { dataUrl: string; width: number; height: number }[] = [];
  for (let row = 0; row < cfg.rows; row++) {
    for (let col = 0; col < cfg.cols; col++) {
      const ox = col * cfg.step;
      const oy = row * cfg.step;
      const gain = 1 + (rng() * 2 - 1) * cfg.brightnessJitter;
      const bias = (rng() * 2 - 1) * cfg.brightnessJitter * 22;
      const dataUrl = fieldToTileCanvas(field, fieldWidth, fieldHeight, ox, oy, cfg.tile, cfg.tile, gain, bias);
      tiles.push({ dataUrl, width: cfg.tile, height: cfg.tile });
    }
  }
  return { tiles, fieldWidth, fieldHeight, cellCount: cells.length, stepX: cfg.step, stepY: cfg.step };
}

export interface PresetCondition {
  id: string;
  name: string;
  type: "cell" | "particle" | "colony";
  density: number;
  clusterFactor: number;
  seed: number;
}

export const PRESET_CONDITIONS: PresetCondition[] = [
  { id: "control", name: "对照组 Control", type: "cell", density: 1.0, clusterFactor: 0.3, seed: 1337 },
  { id: "low", name: "低剂量 Low Dose", type: "cell", density: 1.6, clusterFactor: 0.4, seed: 4242 },
  { id: "high", name: "高剂量 High Dose", type: "cell", density: 2.4, clusterFactor: 0.55, seed: 9001 },
  { id: "colony", name: "菌落 Colony", type: "colony", density: 0.6, clusterFactor: 0.15, seed: 5566 },
  { id: "particle", name: "颗粒 Particle", type: "particle", density: 2.8, clusterFactor: 0.1, seed: 7788 },
];
