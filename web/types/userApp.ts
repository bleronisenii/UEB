import type { Timestamp } from "firebase/firestore";

export const EXPENSE_OWNER_KEYS = [
  "elvis",
  "urim",
  "bunjamin",
  "puntoret",
] as const;

export type ExpenseOwnerKey = (typeof EXPENSE_OWNER_KEYS)[number];

export type LedgerEntry = {
  /** Present for all rows created in the Next app; optional for legacy data */
  id?: string;
  client: string;
  amount: number;
  date: string;
};

export type UserAppData = {
  dashboardEntries: LedgerEntry[];
  totalBudget: number;
  expenses: Record<ExpenseOwnerKey, LedgerEntry[]>;
  updatedAt?: Timestamp | null;
};
