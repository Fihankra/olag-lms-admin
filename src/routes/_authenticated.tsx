import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useAuth } from "../hooks/use-auth";
import { AdminLayout } from "../components/AdminLayout";
import { useEffect, useRef } from "react";
import { Clock } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { isAuthenticated, isLoading, user, role, roleLoading, approved, logout } = useAuth();
  const navigate = useNavigate();
  // Once we have successfully rendered the layout, never show the loading
  // spinner again — any transient auth state (token refresh, etc.) would
  // unmount children and lose all in-progress work (open dialogs, form state).
  const hasRendered = useRef(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      hasRendered.current = false;
      navigate({ to: "/login" });
    }
  }, [isLoading, isAuthenticated, navigate]);

  useEffect(() => {
    if (!isLoading && isAuthenticated && !user?.user_metadata?.password_changed) {
      navigate({ to: "/change-password" });
    }
  }, [isLoading, isAuthenticated, user, navigate]);

  // Only show the loading screen on the very first load.
  if (!hasRendered.current && (isLoading || roleLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated || !user?.user_metadata?.password_changed) {
    return null;
  }

  // Teacher pending approval
  if (role === "teacher" && approved === false) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-amber-500/10">
            <Clock className="h-7 w-7 text-amber-500" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">Pending Approval</h1>
          <p className="text-sm text-muted-foreground mb-6">
            Your account is waiting for admin approval. You'll be able to access the system once
            approved.
          </p>
          <button
            onClick={() => logout()}
            className="px-4 py-2 rounded-md bg-secondary text-secondary-foreground text-sm font-medium hover:bg-secondary/80 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  hasRendered.current = true;
  return (
    <AdminLayout>
      <Outlet />
    </AdminLayout>
  );
}
