import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "../../components/PageHeader";
import { StatsCard } from "../../components/StatsCard";
import { Tablet, Users, Wifi, WifiOff } from "lucide-react";
import { supabase } from "../../integrations/supabase/client";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/_authenticated/")({
  component: DashboardPage,
  head: () => ({
    meta: [
      { title: "Dashboard — OLAG LMS" },
      { name: "description", content: "Overview of students, devices, and system activity" },
    ],
  }),
});

interface DashboardStats {
  totalStudents: number;
  totalDevices: number;
  assignedDevices: number;
  onlineDevices: number;
}

function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    totalStudents: 0,
    totalDevices: 0,
    assignedDevices: 0,
    onlineDevices: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      const [studentsRes, devicesRes] = await Promise.all([
        supabase.from("students").select("id", { count: "exact", head: true }),
        supabase.from("devices").select("*"),
      ]);

      const devices = devicesRes.data ?? [];
      setStats({
        totalStudents: studentsRes.count ?? 0,
        totalDevices: devices.length,
        assignedDevices: devices.filter((d) => d.assigned_student_id).length,
        onlineDevices: devices.filter((d) => d.network_status === "online").length,
      });
      setLoading(false);
    }

    fetchStats();

    const channel = supabase
      .channel("devices-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "devices" }, () => {
        fetchStats();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div>
      <PageHeader title="Dashboard" description="Overview of your learning environment" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatsCard
          title="Total Students"
          value={loading ? "..." : stats.totalStudents}
          icon={Users}
        />
        <StatsCard
          title="Total Devices"
          value={loading ? "..." : stats.totalDevices}
          icon={Tablet}
        />
        <StatsCard
          title="Assigned Devices"
          value={loading ? "..." : stats.assignedDevices}
          subtitle={`${stats.totalDevices - stats.assignedDevices} unassigned`}
          icon={Tablet}
        />
        <StatsCard
          title="Online Devices"
          value={loading ? "..." : stats.onlineDevices}
          subtitle={`${stats.totalDevices - stats.onlineDevices} offline`}
          icon={stats.onlineDevices > 0 ? Wifi : WifiOff}
        />
      </div>

      <div className="bg-card rounded-lg border border-border p-6">
        <h2 className="text-lg font-semibold mb-4">Device Activity</h2>
        <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
          <p>Activity chart will populate as device data accumulates</p>
        </div>
      </div>
    </div>
  );
}
