import { Link, useLocation } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Tablet,
  Users,
  Users2,
  GraduationCap,
  BookOpen,
  FolderOpen,
  UserCheck,
  ClipboardList,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Sun,
  Moon,
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "../hooks/use-auth";
import { useTheme } from "../hooks/use-theme";

const navItems = [
  { title: "Dashboard", to: "/", icon: LayoutDashboard },
  { title: "Devices", to: "/devices", icon: Tablet },
  { title: "Students", to: "/students", icon: Users },
  { title: "Teachers", to: "/teachers", icon: UserCheck },
  { title: "Programs", to: "/programs", icon: GraduationCap },
  { title: "Classes", to: "/classes", icon: BookOpen },
  { title: "Groups", to: "/groups", icon: Users2 },
  { title: "Materials", to: "/materials", icon: FolderOpen },
  { title: "Reports", to: "/reports", icon: ClipboardList },
  { title: "Settings", to: "/settings", icon: Settings },
];

interface AdminSidebarProps {
  onNavigate?: () => void;
}

export function AdminSidebar({ onNavigate }: AdminSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const { logout, user } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();

  return (
    <aside
      className={`flex flex-col bg-sidebar border-r border-sidebar-border h-full transition-all duration-200 ${collapsed ? "w-16" : "w-60"}`}
    >
      <div className="flex items-center gap-2 px-4 h-14 border-b border-sidebar-border">
        {!collapsed && (
          <span className="text-lg font-bold text-sidebar-primary tracking-tight">OLAG LMS</span>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="ml-auto p-1.5 rounded-md hover:bg-sidebar-accent text-sidebar-foreground hidden lg:block"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      <nav className="flex-1 py-3 px-2 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location.pathname === item.to;
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
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
          onClick={toggleTheme}
          className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent transition-colors w-full"
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? (
            <Sun className="h-4 w-4 shrink-0" />
          ) : (
            <Moon className="h-4 w-4 shrink-0" />
          )}
          {!collapsed && <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>}
        </button>
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
