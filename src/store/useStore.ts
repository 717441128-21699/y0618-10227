import { create } from "zustand";
import type {
  Detection,
  Experiment,
  MorphFilter,
  Panorama,
  Tile,
  WorkflowStage,
  TargetType,
} from "@/types";
import { GROUP_COLORS } from "@/types";
import { defaultFilter } from "@/lib/analysis";

const STORAGE_KEY = "mic_store_v1";

export interface PersistShape {
  experiments: Experiment[];
  tiles: Record<string, Tile[]>;
  panoramas: Record<string, Panorama | null>;
  detections: Record<string, Detection[]>;
  filters: Record<string, MorphFilter>;
}

function uid(): string {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}

function loadPersisted(): Partial<PersistShape> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<PersistShape>;
  } catch {
    return {};
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function persist(state: PersistShape) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      try {
        const trimmed: PersistShape = {
          ...state,
          panoramas: {},
          tiles: Object.fromEntries(
            Object.entries(state.tiles).map(([k, v]) => [
              k,
              v.map((t) => ({ ...t, dataUrl: "" })),
            ])
          ),
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
      } catch {
        // give up silently
      }
    }
  }, 250);
}

interface StoreState extends PersistShape {
  createExperiment: (partial: { name: string; type: TargetType; scale?: number; note?: string }) => Experiment;
  deleteExperiment: (id: string) => void;
  renameExperiment: (id: string, name: string) => void;
  updateExperimentStage: (id: string, stage: WorkflowStage) => void;
  updateExperiment: (id: string, patch: Partial<Experiment>) => void;

  addTiles: (expId: string, tiles: Omit<Tile, "id" | "expId" | "offsetX" | "offsetY" | "isReference">[]) => void;
  removeTile: (expId: string, tileId: string) => void;
  reorderTiles: (expId: string, ids: string[]) => void;
  setReferenceTile: (expId: string, tileId: string) => void;
  clearTiles: (expId: string) => void;

  setPanorama: (expId: string, p: Panorama | null) => void;
  setDetections: (expId: string, dets: Detection[]) => void;
  addManualDetection: (expId: string, det: Omit<Detection, "id" | "manual">) => void;
  removeDetection: (expId: string, id: number) => void;
  clearDetections: (expId: string) => void;
  setFilter: (expId: string, filter: Partial<MorphFilter>) => void;
  resetFilter: (expId: string) => void;

  snapshot: () => PersistShape;
}

const persisted = loadPersisted();

export const useStore = create<StoreState>((set, get) => ({
  experiments: persisted.experiments ?? [],
  tiles: persisted.tiles ?? {},
  panoramas: persisted.panoramas ?? {},
  detections: persisted.detections ?? {},
  filters: persisted.filters ?? {},

  createExperiment: (partial) => {
    const exp: Experiment = {
      id: uid(),
      name: partial.name,
      type: partial.type,
      scale: partial.scale ?? 0.5,
      color: GROUP_COLORS[get().experiments.length % GROUP_COLORS.length],
      createdAt: Date.now(),
      note: partial.note,
      stage: "stitch",
    };
    set((s) => {
      const next: PersistShape = {
        experiments: [...s.experiments, exp],
        tiles: { ...s.tiles, [exp.id]: [] },
        panoramas: { ...s.panoramas, [exp.id]: null },
        detections: { ...s.detections, [exp.id]: [] },
        filters: { ...s.filters, [exp.id]: defaultFilter() },
      };
      persist(next);
      return next;
    });
    return exp;
  },

  deleteExperiment: (id) => {
    set((s) => {
      const next: PersistShape = {
        experiments: s.experiments.filter((e) => e.id !== id),
        tiles: Object.fromEntries(Object.entries(s.tiles).filter(([k]) => k !== id)),
        panoramas: Object.fromEntries(Object.entries(s.panoramas).filter(([k]) => k !== id)),
        detections: Object.fromEntries(Object.entries(s.detections).filter(([k]) => k !== id)),
        filters: Object.fromEntries(Object.entries(s.filters).filter(([k]) => k !== id)),
      };
      persist(next);
      return next;
    });
  },

  renameExperiment: (id, name) => {
    set((s) => {
      const next = { ...s, experiments: s.experiments.map((e) => (e.id === id ? { ...e, name } : e)) };
      persist(next);
      return next;
    });
  },

  updateExperimentStage: (id, stage) => {
    set((s) => {
      const next = { ...s, experiments: s.experiments.map((e) => (e.id === id ? { ...e, stage } : e)) };
      persist(next);
      return next;
    });
  },

  updateExperiment: (id, patch) => {
    set((s) => {
      const next = { ...s, experiments: s.experiments.map((e) => (e.id === id ? { ...e, ...patch } : e)) };
      persist(next);
      return next;
    });
  },

  addTiles: (expId, tiles) => {
    set((s) => {
      const existing = s.tiles[expId] ?? [];
      const isFirst = existing.length === 0;
      const newTiles: Tile[] = tiles.map((t, i) => ({
        ...t,
        id: uid(),
        expId,
        offsetX: 0,
        offsetY: 0,
        isReference: isFirst && i === 0,
      }));
      const next = { ...s, tiles: { ...s.tiles, [expId]: [...existing, ...newTiles] } };
      persist(next);
      return next;
    });
  },

  removeTile: (expId, tileId) => {
    set((s) => {
      const list = (s.tiles[expId] ?? []).filter((t) => t.id !== tileId);
      if (list.length > 0 && !list.some((t) => t.isReference)) {
        list[0] = { ...list[0], isReference: true };
      }
      const next = { ...s, tiles: { ...s.tiles, [expId]: list } };
      persist(next);
      return next;
    });
  },

  reorderTiles: (expId, ids) => {
    set((s) => {
      const map = new Map((s.tiles[expId] ?? []).map((t) => [t.id, t]));
      const list = ids.map((id) => map.get(id)!).filter(Boolean);
      const next = { ...s, tiles: { ...s.tiles, [expId]: list } };
      persist(next);
      return next;
    });
  },

  setReferenceTile: (expId, tileId) => {
    set((s) => {
      const list = (s.tiles[expId] ?? []).map((t) => ({ ...t, isReference: t.id === tileId }));
      const next = { ...s, tiles: { ...s.tiles, [expId]: list } };
      persist(next);
      return next;
    });
  },

  clearTiles: (expId) => {
    set((s) => {
      const next = { ...s, tiles: { ...s.tiles, [expId]: [] }, panoramas: { ...s.panoramas, [expId]: null } };
      persist(next);
      return next;
    });
  },

  setPanorama: (expId, p) => {
    set((s) => {
      const next = { ...s, panoramas: { ...s.panoramas, [expId]: p } };
      persist(next);
      return next;
    });
  },

  setDetections: (expId, dets) => {
    set((s) => {
      const next = { ...s, detections: { ...s.detections, [expId]: dets } };
      persist(next);
      return next;
    });
  },

  addManualDetection: (expId, det) => {
    set((s) => {
      const list = s.detections[expId] ?? [];
      const maxId = list.reduce((m, d) => Math.max(m, d.id), -1);
      const newDet: Detection = { ...det, id: maxId + 1, manual: true };
      const next = { ...s, detections: { ...s.detections, [expId]: [...list, newDet] } };
      persist(next);
      return next;
    });
  },

  removeDetection: (expId, id) => {
    set((s) => {
      const list = (s.detections[expId] ?? []).filter((d) => d.id !== id);
      const next = { ...s, detections: { ...s.detections, [expId]: list } };
      persist(next);
      return next;
    });
  },

  clearDetections: (expId) => {
    set((s) => {
      const next = { ...s, detections: { ...s.detections, [expId]: [] } };
      persist(next);
      return next;
    });
  },

  setFilter: (expId, filter) => {
    set((s) => {
      const cur = s.filters[expId] ?? defaultFilter();
      const next = { ...s, filters: { ...s.filters, [expId]: { ...cur, ...filter } } };
      persist(next);
      return next;
    });
  },

  resetFilter: (expId) => {
    set((s) => {
      const next = { ...s, filters: { ...s.filters, [expId]: defaultFilter() } };
      persist(next);
      return next;
    });
  },

  snapshot: () => {
    const s = get();
    return {
      experiments: s.experiments,
      tiles: s.tiles,
      panoramas: s.panoramas,
      detections: s.detections,
      filters: s.filters,
    };
  },
}));

export function selectExperiment(id: string | undefined): Experiment | undefined {
  return useStore.getState().experiments.find((e) => e.id === id);
}
