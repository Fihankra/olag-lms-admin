import { toast } from "sonner";
import { parseSupabaseError } from "./supabase-errors";

type SupabaseError = { code?: string; message?: string; details?: string };

/**
 * Show a success toast if no error, or a parsed error toast if there is one.
 * Returns `true` if the operation succeeded (no error).
 */
export function toastResult(
  error: SupabaseError | null,
  successMessage?: string,
): boolean {
  if (error) {
    toast.error(parseSupabaseError(error));
    return false;
  }
  if (successMessage) toast.success(successMessage);
  return true;
}

/**
 * Show a parsed Supabase error toast.
 */
export function toastError(error: SupabaseError) {
  toast.error(parseSupabaseError(error));
}
