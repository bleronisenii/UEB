/**
 * Parse dates stored from `Date.toLocaleDateString()` (locale-dependent) or ISO-like strings.
 */
export function parseLedgerDateString(dateStr: string): Date | null {
  if (!dateStr || typeof dateStr !== "string") return null;
  const t = dateStr.trim();
  if (!t) return null;

  if (/^\d{4}-\d{2}-\d{2}/.test(t)) {
    const d = new Date(t);
    if (!Number.isNaN(d.getTime())) return d;
  }

  const ms = Date.parse(t);
  if (!Number.isNaN(ms)) return new Date(ms);

  const parts = t.split(/[./\s,-]+/).filter(Boolean);
  if (parts.length < 3) return null;

  const n0 = parseInt(parts[0]!, 10);
  const n1 = parseInt(parts[1]!, 10);
  const n2 = parseInt(parts[2]!, 10);
  if (!Number.isFinite(n0) || !Number.isFinite(n1) || !Number.isFinite(n2)) {
    return null;
  }

  if (parts[0]!.length === 4) {
    const y = n0;
    const m = n1 - 1;
    const day = n2;
    const d = new Date(y, m, day);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  if (n0 > 12) {
    return new Date(n2, n1 - 1, n0);
  }
  if (n1 > 12) {
    return new Date(n2, n0 - 1, n1);
  }

  return new Date(n2, n1 - 1, n0);
}
