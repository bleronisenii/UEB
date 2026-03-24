import type { Timestamp } from "firebase/firestore";
import type { ExpenseOwnerKey, LedgerCurrency } from "@/types/userApp";

/** Budget-related rows (dashboard) vs expense ledgers. */
export type ActivityStream = "income" | "expense";

export type ActivityAction = "create" | "update" | "delete";

/** Stored under `userAppData/{uid}/activityLog/{autoId}`. */
export type ActivityEvent = {
  action: ActivityAction;
  stream: ActivityStream;
  ownerKey: ExpenseOwnerKey | null;
  entryId: string | null;
  client: string;
  /** Original amount in `currency`. */
  amount: number;
  currency?: LedgerCurrency;
  /** EUR equivalent (for display / MKD line). */
  amountEur?: number;
  date: string;
  previousClient?: string;
  previousAmount?: number;
  previousCurrency?: LedgerCurrency;
  previousAmountEur?: number;
  /** Change to `totalBudget` for income stream (create/update/delete). */
  budgetDelta?: number;
  /** Set when row was synthesized from existing ledger (migration). */
  source?: "backfill";
  createdAt: Timestamp | null;
};

export type ActivityEventParsed = Omit<ActivityEvent, "createdAt"> & {
  id: string;
  createdAt: Date | null;
};
