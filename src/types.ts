export type TargetType = "cell" | "particle" | "colony";

export type WorkflowStage = "stitch" | "count" | "measure" | "compare";

export type DetectionStatus = "auto" | "manual" | "pending";

export type AuditAction =
  | "auto-detect"
  | "manual-add"
  | "mark-pending"
  | "mark-manual"
  | "revert-auto"
  | "delete"
  | "import";

export interface AuditEvent {
  action: AuditAction;
  at: number;
  fromStatus?: DetectionStatus;
  note?: string;
}

export interface Experiment {
  id: string;
  name: string;
  type: TargetType;
  scale: number;
  color: string;
  createdAt: number;
  note?: string;
  stage: WorkflowStage;
}

export interface Tile {
  id: string;
  expId: string;
  name: string;
  dataUrl: string;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  isReference: boolean;
}

export interface SeamRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Panorama {
  width: number;
  height: number;
  dataUrl: string;
  seams: SeamRect[];
}

export interface Detection {
  id: number;
  cx: number;
  cy: number;
  area: number;
  perimeter: number;
  majorAxis: number;
  minorAxis: number;
  circularity: number;
  angle: number;
  manual: boolean;
  /**
   * @default auto 正常自动检测
   * @manual 人工新增/复核后的手动新增
   * @pending 复核时标记为待确认
   */
  status: DetectionStatus;
  /** 处理轨迹，时间升序 */
  history: AuditEvent[];
}

export interface MorphFilter {
  minArea: number;
  maxArea: number;
  minCircularity: number;
  maxCircularity: number;
  minAspectRatio: number;
  maxAspectRatio: number;
}

export interface Stats {
  count: number;
  mean: number;
  median: number;
  std: number;
  min: number;
  max: number;
  p25: number;
  p75: number;
}

export const GROUP_COLORS = [
  "#2dd4bf",
  "#fbbf24",
  "#a78bfa",
  "#f87171",
  "#60a5fa",
  "#34d399",
];
