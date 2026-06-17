import { Outlet } from "react-router-dom";
import { Sidebar } from "@/components/Sidebar";

export function AppShell() {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-ink-900 text-ink-50">
      <Sidebar />
      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
