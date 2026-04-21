import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useAuth } from "../hooks/use-auth";
import { AdminLayout } from "../components/AdminLayout";
import { useEffect } from "react";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate({ to: "/login" });
    }
  }, [isLoading, isAuthenticated, navigate]);

  useEffect(() => {
    if (!isLoading && isAuthenticated && !user?.user_metadata?.password_changed) {
      navigate({ to: "/change-password" });
    }
  }, [isLoading, isAuthenticated, user, navigate]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated || !user?.user_metadata?.password_changed) {
    return null;
  }

  return (
    <AdminLayout>
      <Outlet />
    </AdminLayout>
  );
}
