import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "../../components/PageHeader";
import { DataTable } from "../../components/DataTable";
import { StatusBadge } from "../../components/StatusBadge";
import { supabase } from "../../integrations/supabase/client";
import { useEffect, useState, useMemo } from "react";
import { UserPlus, UserMinus, Trash2 } from "lucide-react";
import { AdminOnly } from "../../components/AdminOnly";
import { ExcelImport } from "../../components/ExcelImport";
import { toastResult } from "../../lib/supabase-toast";


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
  students?: { name: string; student_id: string } | null;
};

type Student = { id: string; name: string; student_id: string };

function DevicesPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [filter, setFilter] = useState<"all" | "assigned" | "unassigned" | "online" | "offline">("all");

  // Assign modal state
  const [assignDevice, setAssignDevice] = useState<Device | null>(null);
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [studentSearch, setStudentSearch] = useState("");

  async function fetchDevices() {
    const { data, error } = await supabase
      .from("devices")
      .select("*, students!devices_assigned_student_id_fkey(name, student_id)")
      .order("created_at", { ascending: false });
    if (!toastResult(error)) return;
    setDevices((data as Device[]) ?? []);
  }

  async function fetchStudents() {
    const { data } = await supabase.from("students").select("id, name, student_id");
    setAllStudents(data ?? []);
  }

  useEffect(() => {
    fetchDevices();
    fetchStudents();
    const channel = supabase
      .channel("devices-students-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "devices" }, () => { fetchDevices(); fetchStudents(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "students" }, () => { fetchDevices(); fetchStudents(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  async function toggleKiosk(device: Device) {
    const { error } = await supabase.from("devices").update({ kiosk_mode: !device.kiosk_mode }).eq("id", device.id);
    toastResult(error);
  }


  async function assignStudent(deviceId: string, studentId: string) {
    const student = allStudents.find((s) => s.id === studentId);
    const { error: e1 } = await supabase
      .from("devices")
      .update({ assigned_student_id: studentId, assigned_student_code: student?.student_id ?? null })
      .eq("id", deviceId);
    if (!toastResult(e1)) return;
    const { error: e2 } = await supabase.from("students").update({ assigned_device_id: deviceId }).eq("id", studentId);
    if (!toastResult(e2)) return;
    toastResult(null, "Device assigned");
    setAssignDevice(null);
    setStudentSearch("");
    fetchDevices();
    fetchStudents();
  }

  async function unassignDevice(device: Device) {
    if (!device.assigned_student_id) return;
    const { error: e1 } = await supabase.from("students").update({ assigned_device_id: null }).eq("id", device.assigned_student_id);
    if (!toastResult(e1)) return;
    const { error: e2 } = await supabase
      .from("devices")
      .update({ assigned_student_id: null, assigned_student_code: null })
      .eq("id", device.id);
    if (!toastResult(e2)) return;
    toastResult(null, "Device unassigned");
    fetchDevices();
    fetchStudents();
  }

  async function deleteDevice(device: Device) {
    if (!confirm(`Delete device "${device.device_id}"? This will also remove its assignment.`)) return;
    if (device.assigned_student_id) {
      const { error: e1 } = await supabase
        .from("students")
        .update({ assigned_device_id: null })
        .eq("id", device.assigned_student_id);
      if (!toastResult(e1)) return;
    }
    const { error: e2 } = await supabase.from("devices").delete().eq("id", device.id);
    if (!toastResult(e2)) return;
    toastResult(null, "Device deleted");
    fetchDevices();
    fetchStudents();
  }

  // Students not already assigned to a device
  const assignedStudentIds = useMemo(
    () => new Set(devices.filter((d) => d.assigned_student_id).map((d) => d.assigned_student_id!)),
    [devices]
  );

  const availableStudents = useMemo(() => {
    const q = studentSearch.toLowerCase();
    return allStudents
      .filter((s) => !assignedStudentIds.has(s.id))
      .filter((s) => !q || s.name.toLowerCase().includes(q) || s.student_id.toLowerCase().includes(q));
  }, [allStudents, assignedStudentIds, studentSearch]);

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
      render: (d: Device) =>
        d.students ? (
          <span className="flex items-center gap-2">
            <span>{d.students.name}</span>
            <button
              onClick={(e) => { e.stopPropagation(); unassignDevice(d); }}
              title="Unassign student"
              className="p-0.5 rounded hover:bg-destructive/10 text-destructive transition-colors"
            >
              <UserMinus className="h-3.5 w-3.5" />
            </button>
          </span>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); setAssignDevice(d); setStudentSearch(""); }}
            className="flex items-center gap-1.5 text-xs text-primary hover:underline"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Assign
          </button>
        ),
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
    {
      key: "actions",
      label: "",
      render: (d: Device) => (
        <button
          onClick={(e) => { e.stopPropagation(); deleteDevice(d); }}
          title="Delete device"
          className="p-1 rounded hover:bg-destructive/10 text-destructive transition-colors"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      ),
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
    <AdminOnly><div>
      <PageHeader
        title="Devices"
        description="Manage student tablets and device settings"
        actions={
          <ExcelImport entity="devices" onImportComplete={fetchDevices} />
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


      {/* Assign Student Modal */}
      {assignDevice && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg border border-border p-6 w-full max-w-md mx-4">
            <h2 className="text-lg font-semibold mb-1">Assign Student</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Device: <span className="font-medium text-foreground">{assignDevice.device_id}</span>
            </p>

            <input
              type="text"
              placeholder="Search by name or student ID…"
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
              autoFocus
              className="w-full px-3 py-2 rounded-md bg-input border border-border text-foreground text-sm mb-3"
            />

            <div className="max-h-56 overflow-y-auto border border-border rounded-md divide-y divide-border">
              {availableStudents.length === 0 ? (
                <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                  No available students found
                </div>
              ) : (
                availableStudents.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => assignStudent(assignDevice.id, s.id)}
                    className="w-full text-left px-3 py-2.5 hover:bg-accent transition-colors flex items-center justify-between"
                  >
                    <span className="text-sm font-medium text-foreground">{s.name}</span>
                    <span className="text-xs text-muted-foreground">{s.student_id}</span>
                  </button>
                ))
              )}
            </div>

            <div className="flex justify-end mt-4">
              <button
                onClick={() => { setAssignDevice(null); setStudentSearch(""); }}
                className="px-4 py-2 text-sm rounded-md bg-secondary text-secondary-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div></AdminOnly>
  );
}
