import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "../../components/PageHeader";
import { StatsCard } from "../../components/StatsCard";
import { Tablet, Users, Wifi, WifiOff } from "lucide-react";
import { supabase } from "../../integrations/supabase/client";
import { useEffect, useState, useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

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

type DeviceRow = {
  id: string;
  device_id: string;
  network_status: string;
  last_seen: string | null;
  assigned_student_id: string | null;
};

function bucketDevicesByHour(devices: DeviceRow[]) {
  const now = new Date();
  const buckets: { time: string; online: number; offline: number }[] = [];

  for (let i = 23; i >= 0; i--) {
    const bucketTime = new Date(now);
    bucketTime.setHours(now.getHours() - i, 0, 0, 0);
    const bucketEnd = new Date(bucketTime);
    bucketEnd.setHours(bucketEnd.getHours() + 1);

    let online = 0;
    let offline = 0;

    for (const d of devices) {
      if (!d.last_seen) {
        offline++;
        continue;
      }
      const lastSeen = new Date(d.last_seen);
      // Device was seen within this hour bucket → online at that time
      if (lastSeen >= bucketTime && lastSeen < bucketEnd) {
        online++;
      } else if (lastSeen < bucketTime) {
        // Last seen before this bucket → offline
        offline++;
      } else {
        // Last seen after this bucket → check current status for recent buckets
        if (d.network_status === "online") online++;
        else offline++;
      }
    }

    buckets.push({
      time: bucketTime.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false }),
      online,
      offline,
    });
  }

  return buckets;
}

function DashboardPage() {
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [totalStudents, setTotalStudents] = useState(0);
  const [loading, setLoading] = useState(true);

  async function fetchData() {
    const [studentsRes, devicesRes] = await Promise.all([
      supabase.from("students").select("id", { count: "exact", head: true }),
      supabase.from("devices").select("id, device_id, network_status, last_seen, assigned_student_id"),
    ]);
    setTotalStudents(studentsRes.count ?? 0);
    setDevices((devicesRes.data as DeviceRow[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel("devices-dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "devices" }, () => {
        fetchData();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const stats: DashboardStats = useMemo(() => ({
    totalStudents,
    totalDevices: devices.length,
    assignedDevices: devices.filter((d) => d.assigned_student_id).length,
    onlineDevices: devices.filter((d) => d.network_status === "online").length,
  }), [devices, totalStudents]);

  const chartData = useMemo(() => bucketDevicesByHour(devices), [devices]);

  return (
    <div>
      <PageHeader title="Dashboard" description="Overview of your learning environment" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatsCard title="Total Students" value={loading ? "..." : stats.totalStudents} icon={Users} />
        <StatsCard title="Total Devices" value={loading ? "..." : stats.totalDevices} icon={Tablet} />
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
        <h2 className="text-lg font-semibold mb-1">Device Activity</h2>
        <p className="text-xs text-muted-foreground mb-4">Online vs offline devices over the last 24 hours</p>

        {loading ? (
          <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
            Loading chart data…
          </div>
        ) : devices.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
            No devices registered yet. Add devices to see activity.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gradOnline" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="oklch(0.72 0.19 142)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="oklch(0.72 0.19 142)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradOffline" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="oklch(0.58 0.16 254)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="oklch(0.58 0.16 254)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.25 0.01 260)" />
              <XAxis
                dataKey="time"
                tick={{ fill: "oklch(0.55 0.02 260)", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: "oklch(0.55 0.02 260)", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "oklch(0.17 0.02 260)",
                  border: "1px solid oklch(0.25 0.01 260)",
                  borderRadius: "8px",
                  fontSize: "12px",
                  color: "oklch(0.9 0.01 260)",
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: "12px", color: "oklch(0.55 0.02 260)" }}
              />
              <Area
                type="monotone"
                dataKey="online"
                name="Online"
                stroke="oklch(0.72 0.19 142)"
                fill="url(#gradOnline)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="offline"
                name="Offline"
                stroke="oklch(0.58 0.16 254)"
                fill="url(#gradOffline)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
