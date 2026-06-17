export function escapeCsvCell(value: unknown): string {
  let s: string;
  if (value == null) s = "";
  else if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") s = String(value);
  else s = String(value);

  if (/[",\n\r\t]/.test(s) || s.startsWith("=") || s.startsWith("+") || s.startsWith("-") || s.startsWith("@")) {
    s = '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export function buildCsv(rows: unknown[][]): string {
  return rows.map((r) => r.map(escapeCsvCell).join(",")).join("\r\n");
}

export function downloadCsv(rows: unknown[][], filename: string): void {
  const body = buildCsv(rows);
  const utf8WithBom = "\uFEFF" + body;
  const blob = new Blob([utf8WithBom], { type: "text/csv;charset=utf-8" });
  downloadBlob(blob, filename);
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadText(text: string, filename: string, mime = "text/plain;charset=utf-8"): void {
  downloadBlob(new Blob([text], { type: mime }), filename);
}

export function sanitizeName(name: string): string {
  return String(name)
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "untitled";
}
