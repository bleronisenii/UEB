import type { Timestamp } from "firebase/firestore";

export const EXPENSE_OWNER_KEYS = [
  "elvis",
  "urim",
  "bunjamin",
  "puntoret",
] as const;

export type ExpenseOwnerKey = (typeof EXPENSE_OWNER_KEYS)[number];

export type LedgerCurrency = "EUR" | "MKD" | "CHF";

export type LedgerEntry = {
  /** Present for all rows created in the Next app; optional for legacy data */
  id?: string;
  client: string;
  /** Amount in `currency` (legacy rows: EUR). */
  amount: number;
  /** Defaults to EUR when missing (legacy). */
  currency?: LedgerCurrency;
  /** EUR equivalent at save time (for totals); legacy: same as `amount` when currency was EUR. */
  amountEur?: number;
  date: string;
};

export type UserAppData = {
  dashboardEntries: LedgerEntry[];
  totalBudget: number;
  expenses: Record<ExpenseOwnerKey, LedgerEntry[]>;
  updatedAt?: Timestamp | null;
};
