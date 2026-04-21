import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const reportInput = {
  device_id: "" as string,
  week_start: "" as string,
  kiosk_status: true as boolean,
  device_condition: "" as string,
  missing_status: false as boolean,
  lms_status: "" as string,
};

type ReportInput = typeof reportInput;

export const submitReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: ReportInput) => data)
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

    const { data: existing } = await supabase
      .from("reports")
      .select("id")
      .eq("device_id", data.device_id)
      .eq("week_start", data.week_start)
      .eq("class_id", teacher.assigned_class_id)
      .limit(1);

    if (existing && existing.length > 0) {
      return { error: "A report for this device already exists for the selected week." };
    }

    const { error } = await supabase.from("reports").insert({
      teacher_id: teacher.id,
      class_id: teacher.assigned_class_id,
      device_id: data.device_id,
      week_start: data.week_start,
      kiosk_status: data.kiosk_status,
      device_condition: data.device_condition,
      missing_status: data.missing_status,
      lms_status: data.lms_status,
    });

    if (error) return { error: error.message };
    return { error: null };
  });

export const updateReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      report_id: string;
      week_start: string;
      kiosk_status: boolean;
      device_condition: string;
      missing_status: boolean;
      lms_status: string;
    }) => data
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: teacher } = await supabase
      .from("teachers")
      .select("id")
      .eq("user_id", userId)
      .single();

    if (!teacher) return { error: "Teacher record not found." };

    const deadlineError = await checkDeadline(supabase, data.week_start);
    if (deadlineError) return { error: deadlineError };

    // Snapshot current values into report_history before updating
    const { data: current } = await supabase
      .from("reports")
      .select("kiosk_status, device_condition, missing_status, lms_status")
      .eq("id", data.report_id)
      .eq("teacher_id", teacher.id)
      .single();

    if (current) {
      await supabase.from("report_history").insert({
        report_id: data.report_id,
        kiosk_status: current.kiosk_status,
        device_condition: current.device_condition,
        missing_status: current.missing_status,
        lms_status: current.lms_status,
        changed_by: userId,
      });
    }

    const { error } = await supabase
      .from("reports")
      .update({
        kiosk_status: data.kiosk_status,
        device_condition: data.device_condition,
        missing_status: data.missing_status,
        lms_status: data.lms_status,
      })
      .eq("id", data.report_id)
      .eq("teacher_id", teacher.id);

    if (error) return { error: error.message };
    return { error: null };
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

async function checkDeadline(
  supabase: any,
  weekStart: string
): Promise<string | null> {
  const { data } = await supabase
    .from("settings")
    .select("key, value")
    .in("key", ["report_deadline", "report_week_start"]);

  const deadlineDay = (data?.find((r: any) => r.key === "report_deadline")?.value as any)?.day ?? 2;
  const hour = (data?.find((r: any) => r.key === "report_deadline")?.value as any)?.hour ?? 23;
  const minute = (data?.find((r: any) => r.key === "report_deadline")?.value as any)?.minute ?? 59;
  const weekStartDay = (data?.find((r: any) => r.key === "report_week_start")?.value as any)?.day ?? 2;

  const startDate = new Date(weekStart + "T00:00:00Z");

  let dayOffset = deadlineDay - weekStartDay;
  if (dayOffset < 0) dayOffset += 7;

  const deadlineDate = new Date(startDate);
  deadlineDate.setUTCDate(startDate.getUTCDate() + dayOffset);
  deadlineDate.setUTCHours(hour, minute, 59, 999);

  const now = new Date();
  if (now > deadlineDate) {
    const dayNames = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    return `The deadline for this week's reports was ${dayNames[deadlineDay]} at ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}. Submissions are closed.`;
  }

  return null;
}
