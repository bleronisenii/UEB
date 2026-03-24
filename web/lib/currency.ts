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
