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
  /**
   * Legacy field: EUR equivalent at save time (older logic).
   * Kept for backward compatibility; new historical logic prefers `mkdValueAtEntry` + `rateAtEntry`.
   */
  amountEur?: number;
  /**
   * Locked exchange rate used when the entry was created/last edited.
   * Meaning: currency→MKD for the entry's currency.
   * - MKD: 1
   * - EUR: EUR→MKD at entry
   * - CHF: CHF→MKD at entry
   */
  rateAtEntry?: number;
  /** Locked MKD value at entry time (originalAmount × rateAtEntry). */
  mkdValueAtEntry?: number;
  /**
   * Creation timestamp for array-stored entries.
   * IMPORTANT: Firestore `serverTimestamp()` is not supported inside arrays, so we store a plain number (ms).
   * Legacy data may still contain a Firestore Timestamp; we parse it safely.
   */
  createdAt?: number | Timestamp | null;
  date: string;
};

export type UserAppData = {
  dashboardEntries: LedgerEntry[];
  totalBudget: number;
  expenses: Record<ExpenseOwnerKey, LedgerEntry[]>;
  updatedAt?: Timestamp | null;
};
