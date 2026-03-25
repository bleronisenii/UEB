import type { LedgerCurrency, LedgerEntry, UserAppData } from "@/types/userApp";
import { mkdValueAtEntryForAmount, rateAtEntryForCurrency } from "@/lib/currency";

export type CurrencyBalances = Record<LedgerCurrency, number>;

export type CurrentRates = {
  eurMkdRate: number;
  chfMkdRate: number;
};

export function emptyBalances(): CurrencyBalances {
  return { EUR: 0, MKD: 0, CHF: 0 };
}

function entryCurrency(e: Pick<LedgerEntry, "currency">): LedgerCurrency {
  return e.currency ?? "EUR";
}

export function computeBalancesByCurrency(data: UserAppData): CurrencyBalances {
  const b = emptyBalances();
  for (const inc of data.dashboardEntries) {
    const cur = entryCurrency(inc);
    b[cur] += inc.amount;
  }
  for (const owner of Object.keys(data.expenses) as (keyof typeof data.expenses)[]) {
    for (const exp of data.expenses[owner]) {
      const cur = entryCurrency(exp);
      b[cur] -= exp.amount;
    }
  }
  return b;
}

export function liveValuationMkd(balances: CurrencyBalances, rates: CurrentRates): number {
  return (
    balances.MKD +
    balances.EUR * rates.eurMkdRate +
    balances.CHF * rates.chfMkdRate
  );
}

/** Historical total in EUR using locked-at-entry EUR equivalents (fallbacks do NOT use current rates). */
export function historicalTotalEur(entries: ReadonlyArray<LedgerEntry>): number {
  return entries.reduce((sum, e) => {
    if (typeof e.amountEur === "number" && Number.isFinite(e.amountEur)) {
      return sum + e.amountEur;
    }
    // Safe fallback: if missing, treat as EUR legacy amount (old rows were EUR).
    return sum + e.amount;
  }, 0);
}

/** Historical total in MKD using locked-at-entry values (falls back safely). */
export function historicalTotalMkd(entries: ReadonlyArray<LedgerEntry>, ratesAtEntryFallback: CurrentRates): number {
  return entries.reduce((sum, e) => {
    const cur = entryCurrency(e);
    if (typeof e.mkdValueAtEntry === "number" && Number.isFinite(e.mkdValueAtEntry)) {
      return sum + e.mkdValueAtEntry;
    }
    const r =
      typeof e.rateAtEntry === "number" && Number.isFinite(e.rateAtEntry) && e.rateAtEntry > 0
        ? e.rateAtEntry
        : rateAtEntryForCurrency(cur, ratesAtEntryFallback.eurMkdRate, ratesAtEntryFallback.chfMkdRate);
    return sum + mkdValueAtEntryForAmount(e.amount, cur, r);
  }, 0);
}

