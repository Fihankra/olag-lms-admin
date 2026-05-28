import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "../hooks/use-auth";
import { ShieldX } from "lucide-react";
import { useEffect } from "react";

export function AdminOnly({ children }: { children: React.ReactNode }) {
  const { role, roleLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!roleLoading && role !== "admin") {
      navigate({ to: "/" });
    }
  }, [role, roleLoading, navigate]);

  if (roleLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (role !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <ShieldX className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-lg font-semibold mb-2">Access Denied</h2>
        <p className="text-sm text-muted-foreground">
          This page is only accessible to administrators.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
