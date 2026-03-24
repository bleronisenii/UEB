export type ExportColumn = {
  header: string;
  value: string | number | null | undefined;
};

export type ExportRow = ExportColumn[];

function escapeCsvCell(value: string | number | null | undefined): string {
  const raw = value == null ? "" : String(value);
  const escaped = raw.replace(/"/g, "\"\"");
  return `"${escaped}"`;
}

export function downloadExcelCsv(filename: string, rows: ExportRow[]): void {
  if (rows.length === 0) return;

  const csvLines = rows.map((row) => row.map((cell) => escapeCsvCell(cell.value)).join(","));
  // UTF-8 BOM keeps Albanian characters readable in Excel.
  const csv = `\uFEFF${csvLines.join("\r\n")}`;

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
