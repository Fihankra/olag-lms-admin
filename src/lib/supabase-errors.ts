/**
 * Parses Supabase/PostgreSQL error objects into user-friendly messages.
 */
export function parseSupabaseError(error: {
  code?: string;
  message?: string;
  details?: string;
}): string {
  const code = error.code ?? "";
  const message = error.message ?? "An unknown error occurred";
  const details = error.details ?? "";

  // Unique constraint violation (duplicate key)
  if (code === "23505") {
    const match = message.match(/Key \((\w+)\)=\((.+?)\) already exists/);
    if (match) {
      const field = formatFieldName(match[1]);
      return `A record with ${field} "${match[2]}" already exists. Please use a different value.`;
    }
    const constraintMatch = message.match(/duplicate key value violates unique constraint "(\w+)"/);
    if (constraintMatch) {
      return `This record already exists (duplicate value detected).`;
    }
    return "A record with this value already exists. Please use a different value.";
  }

  // Foreign key violation
  if (code === "23503") {
    const insertMatch = message.match(/Key \((\w+)\)=\((.+?)\) is not present in table "(\w+)"/);
    if (insertMatch) {
      const field = formatFieldName(insertMatch[1]);
      const table = formatFieldName(insertMatch[3]);
      return `The selected ${field} does not exist in ${table}. Please choose a valid option.`;
    }
    const deleteMatch = message.match(
      /Key \((\w+)\)=\((.+?)\) is still referenced from table "(\w+)"/,
    );
    if (deleteMatch) {
      const table = formatFieldName(deleteMatch[3]);
      return `Cannot delete this record because it is still used by ${table}. Remove those references first.`;
    }
    return "This action failed because of a reference to another record.";
  }

  // Not-null violation
  if (code === "23502") {
    const match = message.match(/null value in column "(\w+)"/);
    if (match) {
      return `${formatFieldName(match[1])} is required and cannot be empty.`;
    }
    return "A required field is missing. Please fill in all required fields.";
  }

  // Check constraint violation
  if (code === "23514") {
    return "The value you entered is not valid. Please check your input.";
  }

  // String data too long
  if (code === "22001") {
    return "One of the values you entered is too long. Please shorten it.";
  }

  // Invalid text representation (e.g. invalid enum value)
  if (code === "22P02") {
    const enumMatch = message.match(/invalid input value for enum (\w+): "(.+?)"/);
    if (enumMatch) {
      return `"${enumMatch[2]}" is not a valid option for ${formatFieldName(enumMatch[1])}.`;
    }
    return "One of the values you entered is not in the correct format.";
  }

  // RLS policy violation
  if (code === "42501" || message.includes("row-level security")) {
    return "You don't have permission to perform this action.";
  }

  // Insufficient privilege
  if (code === "42501") {
    return "You don't have permission to perform this action.";
  }

  // Connection / timeout
  if (message.includes("timeout") || message.includes("TIMEOUT")) {
    return "The request timed out. Please try again.";
  }

  if (message.includes("Failed to fetch") || message.includes("NetworkError")) {
    return "Network error. Please check your connection and try again.";
  }

  // Fallback: clean up the raw message
  return message.replace(/^(new row )?violates? /, "").replace(/_/g, " ");
}

function formatFieldName(name: string): string {
  return name
    .replace(/_id$/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
