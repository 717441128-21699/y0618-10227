import { create } from "zustand";
import type {
  Detection,
  DetectionStatus,
  Experiment,
  MorphFilter,
  Panorama,
  Tile,
  WorkflowStage,
  TargetType,
} from "@/types";
import { GROUP_COLORS } from "@/types";
import { defaultFilter } from "@/lib/analysis";
import {
  deleteBlobsByExp,
  deleteBlob,
  estimateUsage,
  formatSize,
  getBlob,
  listBlobsByExp,
  putBlob,
  sizeOfDataUrl,
  totalBlobSize,
} from "@/lib/blobStore";

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

function pushStorageWarning(msg: string) {
  try {
    const ev = new CustomEvent("mic:storage-warn", { detail: msg });
    window.dispatchEvent(ev);
  } catch {
    // ignore
  }
}

const WARN_QUOTA_PCT = 0.85;
const HARD_LOCAL_LIMIT_BYTES = 3.5 * 1024 * 1024; // ~3.5MB localStorage upper bound

function migrateDetection(d: Detection): Detection {
  if (d.status) return d;
  return {
    ...d,
    status: d.manual ? "manual" : "auto",
  };
}

function migrateMeta(m: Partial<PersistShape>): Partial<PersistShape> {
  if (!m.detections) return m;
  const out: typeof m.detections = {};
  for (const [k, list] of Object.entries(m.detections)) {
    if (Array.isArray(list)) out[k] = list.map(migrateDetection);
  }
  return { ...m, detections: out };
}

function loadPersistedMeta(): Partial<PersistShape> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<PersistShape>;
    return migrateMeta(parsed);
  } catch {
    return {};
  }
}

async function hydrateFromBlobStore(meta: Partial<PersistShape>): Promise<PersistShape> {
  const tiles: Record<string, Tile[]> = { ...(meta.tiles ?? {}) };
  const panoramas: Record<string, Panorama | null> = { ...(meta.panoramas ?? {}) };
  let hydrateFailures = 0;

  const tasks: Promise<void>[] = [];
  for (const expId of Object.keys(tiles)) {
    const list = tiles[expId] ?? [];
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      if (t.dataUrl) continue;
      tasks.push(
        getBlob(expId, "tile", t.id).then((dataUrl) => {
          if (dataUrl) {
            list[i] = { ...t, dataUrl };
          } else {
            hydrateFailures++;
          }
        })
      );
    }
  }
  for (const expId of Object.keys(panoramas)) {
    const p = panoramas[expId];
    if (p && !p.dataUrl) {
      tasks.push(
        getBlob(expId, "panorama", "panorama").then((dataUrl) => {
          if (dataUrl) {
            panoramas[expId] = { ...p, dataUrl };
          } else {
            hydrateFailures++;
          }
        })
      );
    }
  }
  await Promise.all(tasks);

  if (hydrateFailures > 0) {
    pushStorageWarning(
      `有 ${hydrateFailures} 张图片未能从浏览器存储中恢复，可能是浏览器数据被清理。请确认数据完整性，如有缺失请从项目包恢复。`
    );
  }

  return {
    experiments: meta.experiments ?? [],
    tiles,
    panoramas,
    detections: meta.detections ?? {},
    filters: meta.filters ?? {},
  };
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let quotaCheckTimer: ReturnType<typeof setTimeout> | null = null;
let lastQuotaWarnAt = 0;
let lastLocalTrimWarnAt = 0;

async function checkQuota() {
  const { quota, usageInBytes } = await estimateUsage();
  const idbBytes = await totalBlobSize();
  const totalEst = usageInBytes || idbBytes;
  if (quota > 0 && totalEst / quota > WARN_QUOTA_PCT && Date.now() - lastQuotaWarnAt > 60_000) {
    lastQuotaWarnAt = Date.now();
    pushStorageWarning(
      `浏览器存储空间已使用约 ${formatSize(totalEst)} / ${formatSize(quota)}（${Math.round((totalEst / quota) * 100)}%），建议尽快在首页「导出项目包」备份，避免后续刷新丢失数据。`
    );
  }
}

async function persist(state: PersistShape) {
  if (saveTimer) clearTimeout(saveTimer);

  // De-dup/schedule; but we need fresh 'state' snapshot when actual timer fires.
  // Since state is immutable-ish (we get reference), schedule with closure snapshot.
  saveTimer = setTimeout(async () => {
    // --- 1) Sync blobs: persist tile/panorama dataUrls to IDB, build meta version ---
    const metaTiles: Record<string, Tile[]> = {};
    const metaPanoramas: Record<string, Panorama | null> = {};
    const blobTasks: Promise<boolean>[] = [];
    let blobFailures = 0;

    const allExpIds = new Set<string>();
    state.experiments.forEach((e) => allExpIds.add(e.id));

    for (const expId of Object.keys(state.tiles)) {
      const list = state.tiles[expId] ?? [];
      const metaList: Tile[] = new Array(list.length);
      for (let i = 0; i < list.length; i++) {
        const t = list[i];
        if (t.dataUrl) {
          metaList[i] = { ...t };
          blobTasks.push(
            putBlob(expId, "tile", t.id, t.dataUrl)
              .then(() => {
                metaList[i].dataUrl = "";
                return true;
              })
              .catch(() => {
                blobFailures++;
                return false;
              })
          );
        } else {
          metaList[i] = t;
        }
      }
      metaTiles[expId] = metaList;
    }
    for (const expId of Object.keys(state.panoramas)) {
      const p = state.panoramas[expId];
      if (p && p.dataUrl) {
        const metaPano: Panorama = { ...p };
        metaPanoramas[expId] = metaPano;
        blobTasks.push(
          putBlob(expId, "panorama", "panorama", p.dataUrl)
            .then(() => {
              metaPano.dataUrl = "";
              return true;
            })
            .catch(() => {
              blobFailures++;
              return false;
            })
        );
      } else {
        metaPanoramas[expId] = p;
      }
    }

    // Clean up stale IDB entries for experiments not in the list, and for deleted tiles/panoramas.
    const cleanup: Promise<unknown>[] = [];
    for (const expId of Object.keys(state.tiles)) {
      cleanup.push(
        listBlobsByExp(expId).then((existing) => {
          const liveKeys = new Set<string>(state.tiles[expId]?.map((t) => t.id) ?? []);
          const hasPanoramaMeta = !!state.panoramas[expId];
          return Promise.all(
            existing.map((e) => {
              if (e.kind === "tile" && !liveKeys.has(e.key)) {
                return deleteBlob(expId, "tile", e.key).catch(() => {});
              }
              if (e.kind === "panorama" && !hasPanoramaMeta) {
                return deleteBlob(expId, "panorama", "panorama").catch(() => {});
              }
              return Promise.resolve();
            })
          );
        })
      );
    }
    // Remove experiment-level blobs that don't exist anymore
    cleanup.push(
      (async () => {
        // We don't have list-all-exps in IDB; use store.getall-like approach via listBlobsByExp scan
        try {
          // For safety: only attempt deletes for experiments we explicitly dropped.
        } catch {
          // ignore
        }
      })()
    );

    await Promise.all([...blobTasks, ...cleanup]);

    if (blobFailures > 0 && Date.now() - lastLocalTrimWarnAt > 60_000) {
      lastLocalTrimWarnAt = Date.now();
      pushStorageWarning(
        `有 ${blobFailures} 张大图未能成功保存到浏览器后台存储，请立即在首页「导出项目包」备份数据后再刷新页面，避免数据丢失。`
      );
    }

    // --- 2) Write meta to localStorage ---
    const metaObj: PersistShape = {
      experiments: state.experiments,
      tiles: metaTiles,
      panoramas: metaPanoramas,
      detections: state.detections,
      filters: state.filters,
    };
    const metaStr = JSON.stringify(metaObj);

    try {
      localStorage.setItem(STORAGE_KEY, metaStr);
    } catch (err) {
      if (Date.now() - lastLocalTrimWarnAt > 60_000) {
        lastLocalTrimWarnAt = Date.now();
        const est = new Blob([metaStr]).size;
        pushStorageWarning(
          `本地存储写入失败（元数据约 ${formatSize(est)}），请尽快在首页导出项目包备份，或清理不活跃实验。`
        );
      }
    }

    // --- 3) Occasional quota check (non-blocking) ---
    if (quotaCheckTimer) clearTimeout(quotaCheckTimer);
    quotaCheckTimer = setTimeout(checkQuota, 2000);
  }, 350);
}

interface StoreState extends PersistShape {
  hydrated: boolean;
  _hydratePromise: Promise<void> | null;

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
  addManualDetection: (expId: string, det: Omit<Detection, "id" | "manual" | "status">) => void;
  updateDetectionStatus: (expId: string, id: number, status: DetectionStatus) => void;
  removeDetection: (expId: string, id: number) => void;
  clearDetections: (expId: string) => void;
  setFilter: (expId: string, filter: Partial<MorphFilter>) => void;
  resetFilter: (expId: string) => void;

  snapshot: () => PersistShape;

  // Project import / export helpers
  importProject: (bundle: PersistShape, mode?: "merge" | "replace") => Promise<Experiment[]>;
}

const persistedMeta = loadPersistedMeta();

function defaultState(experiments: Experiment[] = []): PersistShape {
  return {
    experiments,
    tiles: {},
    panoramas: {},
    detections: {},
    filters: {},
  };
}

// Build initial state from meta with empty dataUrls; hydration will populate them.
function buildInitialFromMeta(meta: Partial<PersistShape>): PersistShape {
  const base = defaultState(meta.experiments ?? []);
  for (const exp of base.experiments) {
    if (base.tiles[exp.id] === undefined) base.tiles[exp.id] = [];
    if (base.panoramas[exp.id] === undefined) base.panoramas[exp.id] = null;
    if (base.detections[exp.id] === undefined) base.detections[exp.id] = [];
    if (base.filters[exp.id] === undefined) base.filters[exp.id] = defaultFilter();
  }
  for (const [k, v] of Object.entries(meta.tiles ?? {})) base.tiles[k] = v;
  for (const [k, v] of Object.entries(meta.panoramas ?? {})) base.panoramas[k] = v;
  for (const [k, v] of Object.entries(meta.detections ?? {})) base.detections[k] = v;
  for (const [k, v] of Object.entries(meta.filters ?? {})) base.filters[k] = v;
  return base;
}

const initialFromMeta = buildInitialFromMeta(persistedMeta);

export const useStore = create<StoreState>((set, get) => ({
  ...initialFromMeta,
  hydrated: false,
  _hydratePromise: null,

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
      void deleteBlobsByExp(id).catch(() => {});
      return next;
    });
  },

  renameExperiment: (id, name) => {
    set((s) => {
      const next = { ...s, experiments: s.experiments.map((e) => (e.id === id ? { ...e, name } : e)) };
      persist(next as PersistShape);
      return next;
    });
  },

  updateExperimentStage: (id, stage) => {
    set((s) => {
      const next = { ...s, experiments: s.experiments.map((e) => (e.id === id ? { ...e, stage } : e)) };
      persist(next as PersistShape);
      return next;
    });
  },

  updateExperiment: (id, patch) => {
    set((s) => {
      const next = { ...s, experiments: s.experiments.map((e) => (e.id === id ? { ...e, ...patch } : e)) };
      persist(next as PersistShape);
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
      persist(next as PersistShape);
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
      persist(next as PersistShape);
      void deleteBlob(expId, "tile", tileId).catch(() => {});
      return next;
    });
  },

  reorderTiles: (expId, ids) => {
    set((s) => {
      const map = new Map((s.tiles[expId] ?? []).map((t) => [t.id, t]));
      const list = ids.map((id) => map.get(id)!).filter(Boolean);
      const next = { ...s, tiles: { ...s.tiles, [expId]: list } };
      persist(next as PersistShape);
      return next;
    });
  },

  setReferenceTile: (expId, tileId) => {
    set((s) => {
      const list = (s.tiles[expId] ?? []).map((t) => ({ ...t, isReference: t.id === tileId }));
      const next = { ...s, tiles: { ...s.tiles, [expId]: list } };
      persist(next as PersistShape);
      return next;
    });
  },

  clearTiles: (expId) => {
    set((s) => {
      const next = { ...s, tiles: { ...s.tiles, [expId]: [] }, panoramas: { ...s.panoramas, [expId]: null } };
      persist(next as PersistShape);
      void deleteBlob(expId, "panorama", "panorama").catch(() => {});
      void (async () => {
        const all = await listBlobsByExp(expId).catch(() => []);
        await Promise.all(all.filter((e) => e.kind === "tile").map((e) => deleteBlob(expId, "tile", e.key)));
      })();
      return next;
    });
  },

  setPanorama: (expId, p) => {
    set((s) => {
      const next = { ...s, panoramas: { ...s.panoramas, [expId]: p } };
      persist(next as PersistShape);
      if (!p) void deleteBlob(expId, "panorama", "panorama").catch(() => {});
      return next;
    });
  },

  setDetections: (expId, dets) => {
    set((s) => {
      const migrated = dets.map(migrateDetection);
      const next = { ...s, detections: { ...s.detections, [expId]: migrated } };
      persist(next as PersistShape);
      return next;
    });
  },

  addManualDetection: (expId, det) => {
    set((s) => {
      const list = s.detections[expId] ?? [];
      const maxId = list.reduce((m, d) => Math.max(m, d.id), -1);
      const newDet: Detection = { ...det, id: maxId + 1, manual: true, status: "manual" };
      const next = { ...s, detections: { ...s.detections, [expId]: [...list, newDet] } };
      persist(next as PersistShape);
      return next;
    });
  },

  updateDetectionStatus: (expId, id, status) => {
    set((s) => {
      const list = (s.detections[expId] ?? []).map((d) => (d.id === id ? { ...d, status } : d));
      const next = { ...s, detections: { ...s.detections, [expId]: list } };
      persist(next as PersistShape);
      return next;
    });
  },

  removeDetection: (expId, id) => {
    set((s) => {
      const list = (s.detections[expId] ?? []).filter((d) => d.id !== id);
      const next = { ...s, detections: { ...s.detections, [expId]: list } };
      persist(next as PersistShape);
      return next;
    });
  },

  clearDetections: (expId) => {
    set((s) => {
      const next = { ...s, detections: { ...s.detections, [expId]: [] } };
      persist(next as PersistShape);
      return next;
    });
  },

  setFilter: (expId, filter) => {
    set((s) => {
      const cur = s.filters[expId] ?? defaultFilter();
      const next = { ...s, filters: { ...s.filters, [expId]: { ...cur, ...filter } } };
      persist(next as PersistShape);
      return next;
    });
  },

  resetFilter: (expId) => {
    set((s) => {
      const next = { ...s, filters: { ...s.filters, [expId]: defaultFilter() } };
      persist(next as PersistShape);
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

  importProject: async (bundle, mode = "merge") => {
    const reassignIds = (input: PersistShape): PersistShape => {
      const idMap: Record<string, string> = {};
      const experiments = input.experiments.map((e) => {
        const nid = uid();
        idMap[e.id] = nid;
        return { ...e, id: nid, createdAt: Date.now() };
      });
      const tiles: PersistShape["tiles"] = {};
      for (const [oldId, list] of Object.entries(input.tiles)) {
        const nid = idMap[oldId];
        if (!nid) continue;
        tiles[nid] = list.map((t) => ({ ...t, expId: nid }));
      }
      const panoramas: PersistShape["panoramas"] = {};
      for (const [oldId, p] of Object.entries(input.panoramas)) {
        const nid = idMap[oldId];
        if (!nid) continue;
        panoramas[nid] = p;
      }
      const detections: PersistShape["detections"] = {};
      for (const [oldId, d] of Object.entries(input.detections)) {
        const nid = idMap[oldId];
        if (!nid) continue;
        detections[nid] = d.map(migrateDetection);
      }
      const filters: PersistShape["filters"] = {};
      for (const [oldId, f] of Object.entries(input.filters)) {
        const nid = idMap[oldId];
        if (!nid) continue;
        filters[nid] = f;
      }
      return { experiments, tiles, panoramas, detections, filters };
    };

    const assigned = reassignIds(bundle);
    // Ensure each exp has its defaults
    for (const exp of assigned.experiments) {
      if (!assigned.tiles[exp.id]) assigned.tiles[exp.id] = [];
      if (assigned.panoramas[exp.id] === undefined) assigned.panoramas[exp.id] = null;
      if (!assigned.detections[exp.id]) assigned.detections[exp.id] = [];
      if (!assigned.filters[exp.id]) assigned.filters[exp.id] = defaultFilter();
      // Fill missing color
      if (!exp.color) {
        exp.color = GROUP_COLORS[Math.floor(Math.random() * GROUP_COLORS.length)];
      }
    }

    set((s) => {
      const existing = mode === "replace" ? defaultState() : s;
      const next: PersistShape = {
        experiments: [...existing.experiments, ...assigned.experiments],
        tiles: { ...existing.tiles, ...assigned.tiles },
        panoramas: { ...existing.panoramas, ...assigned.panoramas },
        detections: { ...existing.detections, ...assigned.detections },
        filters: { ...existing.filters, ...assigned.filters },
      };
      // Persist immediately triggers IDB writes for new tiles/panoramas
      persist(next);
      return next;
    });

    return assigned.experiments;
  },
}));

// Start hydration on module load (non-blocking)
useStore.setState((s) => {
  if (s._hydratePromise) return {};
  const promise = hydrateFromBlobStore(persistedMeta)
    .then((hydrated) => {
      useStore.setState({ ...hydrated, hydrated: true });
      void checkQuota();
    })
    .catch(() => {
      useStore.setState({ hydrated: true });
    });
  return { _hydratePromise: promise, hydrated: false };
});

export function selectExperiment(id: string | undefined): Experiment | undefined {
  return useStore.getState().experiments.find((e) => e.id === id);
}

// Diagnostic exports
export const _blobStorage = {
  sizeOfDataUrl,
  totalBlobSize,
  estimateUsage,
  putBlob,
  getBlob,
  deleteBlobsByExp,
};
