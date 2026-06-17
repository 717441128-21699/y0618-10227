import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import Home from "@/pages/Home";
import Stitch from "@/pages/Stitch";
import Count from "@/pages/Count";
import Measure from "@/pages/Measure";
import Compare from "@/pages/Compare";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Home />} />
          <Route path="/stitch/:expId" element={<Stitch />} />
          <Route path="/count/:expId" element={<Count />} />
          <Route path="/measure/:expId" element={<Measure />} />
          <Route path="/compare" element={<Compare />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Router>
  );
}
