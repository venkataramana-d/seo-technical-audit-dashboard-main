export function scoreColor(score: number): string {
  if (score >= 90) return "#10B981";
  if (score >= 70) return "#0369A1";
  if (score >= 50) return "#D97706";
  return "#DC2626";
}

export function severityColor(severity: string): { text: string; bg: string } {
  const s = (severity || "").toLowerCase();
  if (s === "critical") return { text: "var(--sev-critical)", bg: "var(--sev-critical-bg)" };
  if (s === "high") return { text: "var(--sev-high)", bg: "var(--sev-high-bg)" };
  if (s === "warning") return { text: "var(--sev-warning)", bg: "var(--sev-warning-bg)" };
  if (s === "medium") return { text: "var(--sev-medium)", bg: "var(--sev-medium-bg)" };
  return { text: "var(--sev-low)", bg: "var(--sev-low-bg)" };
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
