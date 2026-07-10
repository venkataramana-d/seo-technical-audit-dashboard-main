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

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
