import { AdminSidebar } from "./AdminSidebar";
import { TeacherSidebar } from "./TeacherSidebar";
import { useAuth } from "../hooks/use-auth";

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const { role } = useAuth();

  return (
    <div className="flex min-h-screen w-full">
      {role === "teacher" ? <TeacherSidebar /> : <AdminSidebar />}
      <main className="flex-1 overflow-auto">
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
