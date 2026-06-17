import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import Home from "@/pages/Home";
import Stitch from "@/pages/Stitch";
import Count from "@/pages/Count";
import Measure from "@/pages/Measure";
import Compare from "@/pages/Compare";
import Batch from "@/pages/Batch";
import { GlobalDialogProvider, useGlobalDialog } from "@/lib/globalDialog";
import { CreateExperimentModal } from "@/components/CreateExperimentModal";
import { ImportProjectModal } from "@/components/ImportProjectModal";
import { HydrationOverlay } from "@/components/HydrationOverlay";

function AppContent() {
  const {
    openCreateExperiment,
    setOpenCreateExperiment,
    openImportProject,
    setOpenImportProject,
  } = useGlobalDialog();
  return (
    <>
      <HydrationOverlay />
      <AppShell />
      <CreateExperimentModal open={openCreateExperiment} onClose={() => setOpenCreateExperiment(false)} />
      <ImportProjectModal open={openImportProject} onClose={() => setOpenImportProject(false)} />
    </>
  );
}

export default function App() {
  return (
    <Router>
      <GlobalDialogProvider>
        <Routes>
          <Route element={<AppContent />}>
            <Route path="/" element={<Home />} />
            <Route path="/stitch/:expId" element={<Stitch />} />
            <Route path="/count/:expId" element={<Count />} />
            <Route path="/measure/:expId" element={<Measure />} />
            <Route path="/compare" element={<Compare />} />
            <Route path="/batch" element={<Batch />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </GlobalDialogProvider>
    </Router>
  );
}
