import { useState } from "react";

interface Column<T> {
  key: string;
  label: string;
  render?: (item: T) => React.ReactNode;
  /** Hide this column below sm breakpoint */
  hideOnMobile?: boolean;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  pageSize?: number;
  onRowClick?: (item: T) => void;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export function DataTable<T extends Record<string, unknown>>({
  data,
  columns,
  pageSize = 10,
  onRowClick,
}: DataTableProps<T>) {
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(pageSize);
  const totalPages = Math.ceil(data.length / size);
  // Clamp in case filtering shrank the data below the current page
  const current = Math.min(page, Math.max(0, totalPages - 1));
  const paged = data.slice(current * size, (current + 1) * size);
  const sizeOptions = PAGE_SIZE_OPTIONS.includes(pageSize)
    ? PAGE_SIZE_OPTIONS
    : [...PAGE_SIZE_OPTIONS, pageSize].sort((a, b) => a - b);

  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`text-left px-3 sm:px-4 py-2.5 sm:py-3 font-medium text-muted-foreground whitespace-nowrap text-xs sm:text-sm ${col.hideOnMobile ? "hidden sm:table-cell" : ""}`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  No data found
                </td>
              </tr>
            ) : (
              paged.map((item, i) => (
                <tr
                  key={i}
                  onClick={() => onRowClick?.(item)}
                  className={`border-b border-border last:border-0 transition-colors hover:bg-muted/20 ${onRowClick ? "cursor-pointer" : ""}`}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm ${col.hideOnMobile ? "hidden sm:table-cell" : ""}`}
                    >
                      {col.render ? col.render(item) : String(item[col.key] ?? "")}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {data.length > sizeOptions[0] && (
        <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-2.5 sm:py-3 border-t border-border">
          <div className="flex items-center gap-3">
            <p className="text-[11px] sm:text-xs text-muted-foreground">
              Page {current + 1}/{totalPages} ({data.length})
            </p>
            <label className="flex items-center gap-1.5 text-[11px] sm:text-xs text-muted-foreground">
              Rows
              <select
                value={size}
                onChange={(e) => {
                  setSize(Number(e.target.value));
                  setPage(0);
                }}
                className="px-1.5 py-0.5 rounded-md bg-secondary text-secondary-foreground border border-border"
              >
                {sizeOptions.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={() => setPage(Math.max(0, current - 1))}
              disabled={current === 0}
              className="px-2.5 sm:px-3 py-1 text-xs rounded-md bg-secondary text-secondary-foreground disabled:opacity-50"
            >
              Prev
            </button>
            <button
              onClick={() => setPage(Math.min(totalPages - 1, current + 1))}
              disabled={current >= totalPages - 1}
              className="px-2.5 sm:px-3 py-1 text-xs rounded-md bg-secondary text-secondary-foreground disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
