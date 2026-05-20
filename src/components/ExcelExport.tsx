import { Download } from "lucide-react";
import * as XLSX from "xlsx";

interface ExcelExportProps {
  data: Record<string, unknown>[];
  filename: string;
  sheetName: string;
  disabled?: boolean;
}

export function ExcelExport({ data, filename, sheetName, disabled }: ExcelExportProps) {
  function handleExport() {
    if (!data.length) return;
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    const colWidths = Object.keys(data[0]).map(() => ({ wch: 20 }));
    ws["!cols"] = colWidths;
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, `${filename}.xlsx`);
  }

  return (
    <button
      onClick={handleExport}
      disabled={disabled || !data.length}
      className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-md bg-secondary text-secondary-foreground text-sm font-medium hover:bg-secondary/80 transition-colors disabled:opacity-50"
      title="Export to Excel"
    >
      <Download className="h-4 w-4 shrink-0" />
      <span className="hidden sm:inline">Export</span>
    </button>
  );
}
