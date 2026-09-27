import type { LayoutExport, Widget } from "./types";

export function serializeLayout(widgets: Widget[]): string {
  const payload: LayoutExport = { version: 1, exportedAt: Date.now(), widgets };
  return JSON.stringify(payload, null, 2);
}

export function deserializeLayout(json: string): Widget[] {
  const parsed = JSON.parse(json) as LayoutExport;
  if (!parsed || !Array.isArray(parsed.widgets)) {
    throw new Error("Invalid layout file: missing widgets array");
  }
  return parsed.widgets;
}

export function downloadTextFile(filename: string, contents: string, mime = "application/json") {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
