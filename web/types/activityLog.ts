import type { Timestamp } from "firebase/firestore";
import type { ExpenseOwnerKey, LedgerCurrency } from "@/types/userApp";

/** Budget-related rows (dashboard) vs expense ledgers. */
export type ActivityStream = "income" | "expense";

export type ActivityAction = "create" | "update" | "delete";

/** More specific, human-readable event category. Stored for audit trail UX. */
export type AuditEventType =
  | "budget.add"
  | "budget.edit"
  | "budget.delete"
  | "expense.add"
  | "expense.edit"
  | "expense.delete"
  | "rate.eur_mkd.change"
  | "rate.chf_mkd.change"
  | "export.excel"
  | "print.page"
  | "system.backfill";

export type AuditSource =
  | "Dashboard"
  | "Historiku"
  | "Përmbledhje"
  | "Pagesat"
  | "System"
  | string;

export type AuditChangeDetails = {
  summary?: string;
  fields?: Record<string, { from?: unknown; to?: unknown }>;
};

/** Stored under `userAppData/{uid}/activityLog/{autoId}`. */
export type ActivityEvent = {
  /** Actor email (authenticated user) when available. */
  actorEmail?: string | null;
  /** UI/module where the action was triggered (Dashboard, Pagesat, etc.). */
  auditSource?: AuditSource;
  /** Specific event type (more detailed than action/stream). */
  eventType?: AuditEventType;
  /** Optional structured details for "what exactly changed". */
  changeDetails?: AuditChangeDetails;

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
