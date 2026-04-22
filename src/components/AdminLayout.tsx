import { AdminSidebar } from "./AdminSidebar";
import { TeacherSidebar } from "./TeacherSidebar";
import { useAuth } from "../hooks/use-auth";
import { Menu } from "lucide-react";
import { useState } from "react";

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const { role } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen w-full">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar — hidden on mobile, slide-in when toggled */}
      <div className={`fixed inset-y-0 left-0 z-50 lg:static lg:z-auto transition-transform duration-200 ${mobileOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}>
        {role === "teacher" ? <TeacherSidebar /> : <AdminSidebar onNavigate={() => setMobileOpen(false)} />}
      </div>

      <main className="flex-1 overflow-auto min-w-0">
        {/* Mobile top bar */}
        <div className="sticky top-0 z-30 flex items-center gap-3 px-4 py-3 bg-background/80 backdrop-blur border-b border-border lg:hidden">
          <button onClick={() => setMobileOpen(true)} className="p-1.5 rounded-md hover:bg-muted">
            <Menu className="h-5 w-5" />
          </button>
          <span className="text-sm font-bold tracking-tight">OLAG LMS</span>
        </div>
        <div className="p-4 sm:p-6">{children}</div>
      </main>
    </div>
  );
}
