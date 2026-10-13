import { supabase } from "@/integrations/supabase/client";

type DeviceReportEntry = {
  device_id: string;
  kiosk_status: boolean;
  device_condition: string;
  fault_description: string | null;
  missing_status: boolean;
  missing_accessories: string[];
  lms_status: string;
};

type BatchReportInput = {
  /** YYYY-MM-DD, any date up to today */
  report_date: string;
  entries: DeviceReportEntry[];
};

type ExistingReport = {
  id: string;
  device_id: string;
  kiosk_status: boolean | null;
  device_condition: string | null;
  fault_description: string | null;
  missing_status: boolean | null;
  missing_accessories: string[] | null;
  lms_status: string | null;
};

export async function submitBatchReport(data: BatchReportInput): Promise<{
  error: string | null;
  inserted?: number;
  updated?: number;
}> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: teacher } = await supabase
    .from("teachers")
    .select("id, assigned_class_id")
    .eq("user_id", user.id)
    .single();

  if (!teacher || !teacher.assigned_class_id) {
    return { error: "You are not assigned as a form master." };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.report_date)) {
    return { error: "Please choose a valid report date." };
  }
  if (data.report_date > localDateString(new Date())) {
    return { error: "You can't submit a report for a future date." };
  }

  const { data: existingReports } = await supabase
    .from("reports")
    .select(
      "id, device_id, kiosk_status, device_condition, fault_description, missing_status, missing_accessories, lms_status",
    )
    .eq("class_id", teacher.assigned_class_id)
    .eq("report_date", data.report_date)
    .eq("teacher_id", teacher.id);

  const existingMap = new Map(
    (existingReports ?? []).map((r) => [r.device_id, r as ExistingReport]),
  );

  const toInsert: {
    teacher_id: string;
    class_id: string;
    device_id: string;
    report_date: string;
    kiosk_status: boolean;
    device_condition: string;
    fault_description: string | null;
    missing_status: boolean;
    missing_accessories: string[];
    lms_status: string;
  }[] = [];
  const toUpdate: { id: string; entry: DeviceReportEntry; old: ExistingReport }[] = [];

  for (const entry of data.entries) {
    const existing = existingMap.get(entry.device_id);
    if (existing) {
      const changed =
        existing.kiosk_status !== entry.kiosk_status ||
        existing.device_condition !== entry.device_condition ||
        existing.fault_description !== (entry.fault_description || null) ||
        existing.missing_status !== entry.missing_status ||
        JSON.stringify(existing.missing_accessories ?? []) !==
          JSON.stringify(entry.missing_accessories ?? []) ||
        existing.lms_status !== entry.lms_status;
      if (changed) {
        toUpdate.push({ id: existing.id, entry, old: existing });
      }
    } else {
      toInsert.push({
        teacher_id: teacher.id,
        class_id: teacher.assigned_class_id,
        device_id: entry.device_id,
        report_date: data.report_date,
        kiosk_status: entry.kiosk_status,
        device_condition: entry.device_condition,
        fault_description: entry.fault_description || null,
        missing_status: entry.missing_status,
        missing_accessories: entry.missing_accessories ?? [],
        lms_status: entry.lms_status,
      });
    }
  }

  if (toInsert.length > 0) {
    const { error } = await supabase.from("reports").insert(toInsert);
    if (error) return { error: error.message };
  }

  for (const item of toUpdate) {
    await supabase.from("report_history").insert({
      report_id: item.id,
      kiosk_status: item.old.kiosk_status,
      device_condition: item.old.device_condition,
      fault_description: item.old.fault_description,
      missing_status: item.old.missing_status,
      missing_accessories: item.old.missing_accessories,
      lms_status: item.old.lms_status,
      changed_by: user.id,
    });

    await supabase
      .from("reports")
      .update({
        kiosk_status: item.entry.kiosk_status,
        device_condition: item.entry.device_condition,
        fault_description: item.entry.fault_description || null,
        missing_status: item.entry.missing_status,
        missing_accessories: item.entry.missing_accessories ?? [],
        lms_status: item.entry.lms_status,
      })
      .eq("id", item.id)
      .eq("teacher_id", teacher.id);
  }

  return {
    error: null,
    inserted: toInsert.length,
    updated: toUpdate.length,
  };
}

/** YYYY-MM-DD in the user's local timezone */
export function localDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
