import { Link, useLocation } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Tablet,
  Users,
  GraduationCap,
  BookOpen,
  FolderOpen,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "../hooks/use-auth";

const navItems = [
  { title: "Dashboard", to: "/", icon: LayoutDashboard },
  { title: "Devices", to: "/devices", icon: Tablet },
  { title: "Students", to: "/students", icon: Users },
  { title: "Programs", to: "/programs", icon: GraduationCap },
  { title: "Classes", to: "/classes", icon: BookOpen },
  { title: "Materials", to: "/materials", icon: FolderOpen },
  { title: "Settings", to: "/settings", icon: Settings },
];

export function AdminSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const { logout, user } = useAuth();

  return (
    <aside
      className={`flex flex-col bg-sidebar border-r border-sidebar-border transition-all duration-200 ${collapsed ? "w-16" : "w-60"}`}
    >
      <div className="flex items-center gap-2 px-4 h-14 border-b border-sidebar-border">
        {!collapsed && (
          <span className="text-lg font-bold text-sidebar-primary tracking-tight">
            OLAG LMS
          </span>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="ml-auto p-1.5 rounded-md hover:bg-sidebar-accent text-sidebar-foreground"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      <nav className="flex-1 py-3 px-2 space-y-1">
        {navItems.map((item) => {
          const isActive = location.pathname === item.to;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? "bg-sidebar-accent text-sidebar-primary"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{item.title}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-sidebar-border space-y-2">
        {!collapsed && user && (
          <p className="text-xs text-muted-foreground truncate">{user.email}</p>
        )}
        <button
          onClick={() => logout()}
          className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent hover:text-destructive transition-colors w-full"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </aside>
  );
}
