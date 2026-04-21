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

    // Get teacher record
    const { data: teacher } = await supabase
      .from("teachers")
      .select("id, assigned_class_id")
      .eq("user_id", userId)
      .single();

    if (!teacher || !teacher.assigned_class_id) {
      return { error: "You are not assigned as a form master." };
    }

    // Check deadline
    const deadlineError = await checkDeadline(supabase, data.week_start);
    if (deadlineError) return { error: deadlineError };

    // Check duplicate
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

    // Verify teacher owns this report
    const { data: teacher } = await supabase
      .from("teachers")
      .select("id")
      .eq("user_id", userId)
      .single();

    if (!teacher) return { error: "Teacher record not found." };

    // Check deadline
    const deadlineError = await checkDeadline(supabase, data.week_start);
    if (deadlineError) return { error: deadlineError };

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
      .select("value")
      .eq("key", "report_deadline")
      .single();

    // Default: Friday 23:59
    const defaults = { day: 5, hour: 23, minute: 59 };
    if (!data?.value) return defaults;

    const v = data.value as Record<string, number>;
    return {
      day: v.day ?? defaults.day,
      hour: v.hour ?? defaults.hour,
      minute: v.minute ?? defaults.minute,
    };
  });

async function checkDeadline(
  supabase: any,
  weekStart: string
): Promise<string | null> {
  // Get deadline setting
  const { data: setting } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "report_deadline")
    .single();

  // Default: Friday 23:59
  const day = (setting?.value as any)?.day ?? 5;
  const hour = (setting?.value as any)?.hour ?? 23;
  const minute = (setting?.value as any)?.minute ?? 59;

  // Calculate deadline datetime for this week_start
  const monday = new Date(weekStart + "T00:00:00Z");
  const deadlineDate = new Date(monday);
  // day: 1=Mon ... 7=Sun
  deadlineDate.setUTCDate(monday.getUTCDate() + (day - 1));
  deadlineDate.setUTCHours(hour, minute, 59, 999);

  const now = new Date();
  if (now > deadlineDate) {
    const dayNames = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    return `The deadline for this week's reports was ${dayNames[day]} at ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}. Submissions are closed.`;
  }

  return null;
}
