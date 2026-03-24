import { formatMkdAmount } from "@/lib/formatMoney";

const DEFAULT_EUR_MKD_RATE = 61.5;
const DEFAULT_CHF_MKD_RATE = 68;

function parsePositiveRate(raw: string, fallback: number): number {
  let s = String(raw).trim();
  if (!s) return fallback;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > lastDot) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    s = s.replace(/,/g, "");
  }
  const n = parseFloat(s);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

/** Parses user-entered rate; falls back to 61.5 if invalid. Accepts 61,5 or 61.5 or 1.234,56. */
export function parseEurMkdRate(raw: string): number {
  return parsePositiveRate(raw, DEFAULT_EUR_MKD_RATE);
}

/** Parses CHF→MKD rate; falls back to 68 if invalid. */
export function parseChfMkdRate(raw: string): number {
  return parsePositiveRate(raw, DEFAULT_CHF_MKD_RATE);
}

/** Parses amount fields (same comma/dot rules as rates). Returns NaN if empty/invalid. */
export function parseLedgerAmountInput(raw: string): number {
  let s = String(raw).trim();
  if (!s) return NaN;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > lastDot) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    s = s.replace(/,/g, "");
  }
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return NaN;
  return n;
}

export function eurToMkd(eur: number, rate: number): number {
  return eur * rate;
}

export function formatMkd(amount: number): string {
  return formatMkdAmount(amount);
}
