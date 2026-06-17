import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

interface GlobalDialogState {
  openCreateExperiment: boolean;
  openImportProject: boolean;
  setOpenCreateExperiment: (v: boolean) => void;
  setOpenImportProject: (v: boolean) => void;
  lastWarning: string | null;
  pushWarning: (msg: string) => void;
  clearWarning: () => void;
}

const Ctx = createContext<GlobalDialogState | null>(null);

export function GlobalDialogProvider({ children }: { children: ReactNode }) {
  const [openCreateExperiment, setOpenCreateExperiment] = useState(false);
  const [openImportProject, setOpenImportProject] = useState(false);
  const [lastWarning, setLastWarning] = useState<string | null>(null);
  const [warnKey, setWarnKey] = useState(0);

  const pushWarning = useCallback((msg: string) => {
    setLastWarning(msg);
    setWarnKey((k) => k + 1);
    setTimeout(() => setLastWarning(null), 8000);
  }, []);

  const clearWarning = useCallback(() => setLastWarning(null), []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (typeof detail === "string" && detail) pushWarning(detail);
    };
    window.addEventListener("mic:storage-warn", handler as EventListener);
    return () => window.removeEventListener("mic:storage-warn", handler as EventListener);
  }, [pushWarning]);

  const value = useMemo<GlobalDialogState>(
    () => ({
      openCreateExperiment,
      openImportProject,
      setOpenCreateExperiment,
      setOpenImportProject,
      lastWarning,
      pushWarning,
      clearWarning,
    }),
    [openCreateExperiment, openImportProject, lastWarning, pushWarning, clearWarning]
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      {lastWarning && (
        <div
          key={warnKey}
          className="pointer-events-none fixed right-6 top-6 z-[100] animate-fade-up max-w-md rounded-[4px] border border-amber/40 bg-ink-850/95 px-4 py-3 shadow-[0_10px_40px_rgba(0,0,0,0.6)] backdrop-blur"
        >
          <div className="mono text-[11px] uppercase tracking-wider text-amber">存储提示</div>
          <div className="mt-1 text-xs leading-relaxed text-ink-100 whitespace-pre-wrap">{lastWarning}</div>
        </div>
      )}
    </Ctx.Provider>
  );
}

export function useGlobalDialog(): GlobalDialogState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useGlobalDialog must be used inside GlobalDialogProvider");
  return v;
}
