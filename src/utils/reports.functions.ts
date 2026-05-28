import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
  week_start: string;
  entries: DeviceReportEntry[];
};

export const submitBatchReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: BatchReportInput) => data)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: teacher } = await supabase
      .from("teachers")
      .select("id, assigned_class_id")
      .eq("user_id", userId)
      .single();

    if (!teacher || !teacher.assigned_class_id) {
      return { error: "You are not assigned as a form master." };
    }

    const deadlineError = await checkDeadline(supabase, data.week_start);
    if (deadlineError) return { error: deadlineError };

    // Fetch existing reports for this class/week
    const { data: existingReports } = await supabase
      .from("reports")
      .select(
        "id, device_id, kiosk_status, device_condition, fault_description, missing_status, missing_accessories, lms_status",
      )
      .eq("class_id", teacher.assigned_class_id)
      .eq("week_start", data.week_start)
      .eq("teacher_id", teacher.id);

    const existingMap = new Map((existingReports ?? []).map((r: any) => [r.device_id, r]));

    const toInsert: any[] = [];
    const toUpdate: { id: string; entry: DeviceReportEntry; old: any }[] = [];

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
          week_start: data.week_start,
          kiosk_status: entry.kiosk_status,
          device_condition: entry.device_condition,
          fault_description: entry.fault_description || null,
          missing_status: entry.missing_status,
          missing_accessories: entry.missing_accessories ?? [],
          lms_status: entry.lms_status,
        });
      }
    }

    // Insert new reports
    if (toInsert.length > 0) {
      const { error } = await supabase.from("reports").insert(toInsert);
      if (error) return { error: error.message };
    }

    // Update changed reports (snapshot history first)
    for (const item of toUpdate) {
      await supabase.from("report_history").insert({
        report_id: item.id,
        kiosk_status: item.old.kiosk_status,
        device_condition: item.old.device_condition,
        fault_description: item.old.fault_description,
        missing_status: item.old.missing_status,
        missing_accessories: item.old.missing_accessories,
        lms_status: item.old.lms_status,
        changed_by: userId,
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
  });

export const getDeadlineSetting = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data } = await supabase
      .from("settings")
      .select("key, value")
      .in("key", ["report_deadline", "report_week_start"]);

    const defaults = { day: 2, hour: 23, minute: 59, weekStartDay: 2 };
    if (!data?.length) return defaults;

    let result = { ...defaults };
    for (const row of data) {
      const v = row.value as Record<string, number>;
      if (row.key === "report_deadline") {
        result.day = v.day ?? defaults.day;
        result.hour = v.hour ?? defaults.hour;
        result.minute = v.minute ?? defaults.minute;
      }
      if (row.key === "report_week_start") {
        result.weekStartDay = v.day ?? defaults.weekStartDay;
      }
    }
    return result;
  });

async function checkDeadline(supabase: any, weekStart: string): Promise<string | null> {
  const { data } = await supabase
    .from("settings")
    .select("key, value")
    .in("key", ["report_deadline", "report_week_start"]);

  const deadlineDay = (data?.find((r: any) => r.key === "report_deadline")?.value as any)?.day ?? 2;
  const hour = (data?.find((r: any) => r.key === "report_deadline")?.value as any)?.hour ?? 23;
  const minute = (data?.find((r: any) => r.key === "report_deadline")?.value as any)?.minute ?? 59;
  const weekStartDay =
    (data?.find((r: any) => r.key === "report_week_start")?.value as any)?.day ?? 2;

  const startDate = new Date(weekStart + "T00:00:00Z");

  let dayOffset = deadlineDay - weekStartDay;
  if (dayOffset < 0) dayOffset += 7;

  const deadlineDate = new Date(startDate);
  deadlineDate.setUTCDate(startDate.getUTCDate() + dayOffset);
  deadlineDate.setUTCHours(hour, minute, 59, 999);

  const now = new Date();
  if (now > deadlineDate) {
    const dayNames = [
      "",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ];
    return `The deadline for this week's reports was ${dayNames[deadlineDay]} at ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}. Submissions are closed.`;
  }

  return null;
}
