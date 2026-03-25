import { eurToMkd } from "@/lib/export/eurMkd";
import type { LedgerCurrency, LedgerEntry } from "@/types/userApp";

/** Default when no user rate (same as parseChfMkdRate fallback). */
export const CHF_TO_MKD_DEFAULT = 68;

export function isLedgerCurrency(v: unknown): v is LedgerCurrency {
  return v === "EUR" || v === "MKD" || v === "CHF";
}

/**
 * Converts an amount in `currency` to EUR using user EUR→MKD and CHF→MKD rates
 * (CHF via MKD: EUR = amount × CHF/MKD ÷ EUR/MKD).
 * EUR does not depend on `eurMkdRate`; MKD and CHF require valid positive rates.
 */
export function convertToEur(
  amount: number,
  currency: LedgerCurrency,
  eurMkdRate: number,
  chfMkdRate: number = CHF_TO_MKD_DEFAULT
): number {
  if (!Number.isFinite(amount) || amount <= 0) {
    return 0;
  }
  switch (currency) {
    case "EUR":
      return amount;
    case "MKD":
      if (!Number.isFinite(eurMkdRate) || eurMkdRate <= 0) return 0;
      return amount / eurMkdRate;
    case "CHF":
      if (!Number.isFinite(eurMkdRate) || eurMkdRate <= 0) return 0;
      if (!Number.isFinite(chfMkdRate) || chfMkdRate <= 0) return 0;
      return (amount * chfMkdRate) / eurMkdRate;
    default:
      return amount;
  }
}

/** Canonical EUR for totals; legacy rows without `amountEur` are treated as EUR `amount`. */
export function ledgerAmountEur(entry: Pick<LedgerEntry, "amount" | "amountEur">): number {
  if (entry.amountEur != null && Number.isFinite(entry.amountEur)) {
    return entry.amountEur;
  }
  return entry.amount;
}

/**
 * Live EUR equivalent for UI/summary values.
 *
 * IMPORTANT: We intentionally do NOT rely on stored `amountEur` because CHF/MKD rows
 * must recompute when the user changes rates (status cards, reports, history, exports).
 * For EUR rows, `amount` is already EUR and does not depend on rates.
 */
export function ledgerAmountEurLive(
  entry: Pick<LedgerEntry, "amount" | "currency">,
  eurMkdRate: number,
  chfMkdRate: number = CHF_TO_MKD_DEFAULT
): number {
  const cur = entry.currency ?? "EUR";
  if (cur === "EUR") return entry.amount;
  return convertToEur(entry.amount, cur, eurMkdRate, chfMkdRate);
}

export function sumLedgerEntriesEurLive(
  entries: ReadonlyArray<Pick<LedgerEntry, "amount" | "currency">>,
  eurMkdRate: number,
  chfMkdRate: number = CHF_TO_MKD_DEFAULT
): number {
  return entries.reduce(
    (sum, e) => sum + ledgerAmountEurLive(e, eurMkdRate, chfMkdRate),
    0
  );
}

/**
 * MKD shown next to a ledger amount: EUR→MKD via EUR rate; MKD unchanged; CHF→MKD via CHF rate only
 * (not EUR_equiv × EUR rate, so tweaking EUR/MKD does not move CHF’s MKD line).
 */
export function amountToMkdDisplay(
  amount: number,
  currency: LedgerCurrency,
  eurMkdRate: number,
  chfMkdRate: number
): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  switch (currency) {
    case "EUR":
      if (!Number.isFinite(eurMkdRate) || eurMkdRate <= 0) return 0;
      return eurToMkd(amount, eurMkdRate);
    case "MKD":
      return amount;
    case "CHF":
      if (!Number.isFinite(chfMkdRate) || chfMkdRate <= 0) return 0;
      return amount * chfMkdRate;
    default:
      if (!Number.isFinite(eurMkdRate) || eurMkdRate <= 0) return 0;
      return eurToMkd(amount, eurMkdRate);
  }
}

/** Rate locked at entry time: currency→MKD (EUR uses eurMkdRate, CHF uses chfMkdRate, MKD=1). */
export function rateAtEntryForCurrency(
  currency: LedgerCurrency,
  eurMkdRate: number,
  chfMkdRate: number
): number {
  switch (currency) {
    case "MKD":
      return 1;
    case "EUR":
      return eurMkdRate;
    case "CHF":
      return chfMkdRate;
    default:
      return eurMkdRate;
  }
}

export function mkdValueAtEntryForAmount(
  amount: number,
  currency: LedgerCurrency,
  rateAtEntry: number
): number {
  if (!Number.isFinite(amount)) return 0;
  if (currency === "MKD") return amount;
  if (!Number.isFinite(rateAtEntry) || rateAtEntry <= 0) return 0;
  return amount * rateAtEntry;
}
