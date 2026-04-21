import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "../../components/PageHeader";
import { DataTable } from "../../components/DataTable";
import { StatusBadge } from "../../components/StatusBadge";
import { supabase } from "../../integrations/supabase/client";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/_authenticated/devices")({
  component: DevicesPage,
  head: () => ({
    meta: [
      { title: "Devices — OLAG LMS" },
      { name: "description", content: "Manage student tablets and device settings" },
    ],
  }),
});

type Device = {
  id: string;
  device_id: string;
  assigned_student_id: string | null;
  network_status: string;
  network_name: string | null;
  kiosk_mode: boolean;
  last_seen: string | null;
  students?: { name: string } | null;
};

function DevicesPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [filter, setFilter] = useState<"all" | "assigned" | "unassigned" | "online" | "offline">("all");
  const [showAddModal, setShowAddModal] = useState(false);
  const [newDeviceId, setNewDeviceId] = useState("");

  async function fetchDevices() {
    const { data } = await supabase
      .from("devices")
      .select("*, students(name)")
      .order("created_at", { ascending: false });
    setDevices((data as Device[]) ?? []);
  }

  useEffect(() => {
    fetchDevices();
    const channel = supabase
      .channel("devices-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "devices" }, () => fetchDevices())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  async function toggleKiosk(device: Device) {
    await supabase.from("devices").update({ kiosk_mode: !device.kiosk_mode }).eq("id", device.id);
  }

  async function addDevice() {
    if (!newDeviceId.trim()) return;
    await supabase.from("devices").insert({ device_id: newDeviceId.trim() });
    setNewDeviceId("");
    setShowAddModal(false);
    fetchDevices();
  }

  const filtered = devices.filter((d) => {
    if (filter === "assigned") return d.assigned_student_id;
    if (filter === "unassigned") return !d.assigned_student_id;
    if (filter === "online") return d.network_status === "online";
    if (filter === "offline") return d.network_status === "offline";
    return true;
  });

  const columns = [
    { key: "device_id", label: "Device ID" },
    {
      key: "network_status",
      label: "Status",
      render: (d: Device) => <StatusBadge status={d.network_status as "online" | "offline"} />,
    },
    {
      key: "assigned_student_id",
      label: "Assigned To",
      render: (d: Device) => d.students?.name ?? <span className="text-muted-foreground">—</span>,
    },
    {
      key: "kiosk_mode",
      label: "Kiosk",
      render: (d: Device) => (
        <button
          onClick={(e) => { e.stopPropagation(); toggleKiosk(d); }}
          className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
            d.kiosk_mode ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
          }`}
        >
          {d.kiosk_mode ? "ON" : "OFF"}
        </button>
      ),
    },
    {
      key: "last_seen",
      label: "Last Seen",
      render: (d: Device) =>
        d.last_seen ? new Date(d.last_seen).toLocaleString() : "—",
    },
  ];

  const filters: { label: string; value: typeof filter }[] = [
    { label: "All", value: "all" },
    { label: "Assigned", value: "assigned" },
    { label: "Unassigned", value: "unassigned" },
    { label: "Online", value: "online" },
    { label: "Offline", value: "offline" },
  ];

  return (
    <div>
      <PageHeader
        title="Devices"
        description="Manage tablets and device configurations"
        actions={
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Add Device
          </button>
        }
      />

      <div className="flex gap-2 mb-4 flex-wrap">
        {filters.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              filter === f.value ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <DataTable data={filtered as Record<string, unknown>[]} columns={columns as any} />

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg border border-border p-6 w-full max-w-md mx-4">
            <h2 className="text-lg font-semibold mb-4">Add New Device</h2>
            <input
              type="text"
              placeholder="Device ID (10-digit)"
              value={newDeviceId}
              onChange={(e) => setNewDeviceId(e.target.value)}
              maxLength={10}
              className="w-full px-3 py-2 rounded-md bg-input border border-border text-foreground text-sm mb-4"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-sm rounded-md bg-secondary text-secondary-foreground"
              >
                Cancel
              </button>
              <button
                onClick={addDevice}
                className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
