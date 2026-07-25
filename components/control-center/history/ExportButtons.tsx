"use client";

import { FileSpreadsheet, FileText } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { downloadTextFile } from "@/lib/control-center/export";
import type { MachineEvent } from "@/lib/control-center/types";

function toRows(events: MachineEvent[]) {
  return events.map((e) => ({
    Timestamp: new Date(e.timestamp).toISOString(),
    Type: e.type,
    Severity: e.severity,
    Message: e.message,
    MachineId: e.machineId,
    StoreId: e.storeId,
  }));
}

function escapeCsv(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function ExportButtons({ events }: { events: MachineEvent[] }) {
  function exportCsv() {
    const rows = toRows(events);
    if (rows.length === 0) {
      toast.error("No rows to export");
      return;
    }
    const headers = Object.keys(rows[0]);
    const lines = [headers.join(","), ...rows.map((r) => headers.map((h) => escapeCsv(String(r[h as keyof typeof r]))).join(","))];
    downloadTextFile(`history-${Date.now()}.csv`, lines.join("\n"), "text/csv");
    toast.success(`Exported ${rows.length} rows to CSV`);
  }

  function exportExcel() {
    const rows = toRows(events);
    if (rows.length === 0) {
      toast.error("No rows to export");
      return;
    }
    const headers = Object.keys(rows[0]);
    const table = `
      <table>
        <thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
        <tbody>${rows
          .map((r) => `<tr>${headers.map((h) => `<td>${String(r[h as keyof typeof r])}</td>`).join("")}</tr>`)
          .join("")}</tbody>
      </table>`;
    downloadTextFile(`history-${Date.now()}.xls`, table, "application/vnd.ms-excel");
    toast.success(`Exported ${rows.length} rows to Excel`);
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" className="gap-1.5" onClick={exportCsv}>
        <FileText className="h-3.5 w-3.5" /> Export CSV
      </Button>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={exportExcel}>
        <FileSpreadsheet className="h-3.5 w-3.5" /> Export Excel
      </Button>
    </div>
  );
}
