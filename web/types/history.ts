import type { ActivityAction } from "@/types/activityLog";
import type { AuditChangeDetails, AuditEventType, AuditSource } from "@/types/activityLog";
import type { ExpenseOwnerKey, LedgerCurrency } from "@/types/userApp";

export type MoneyTimelineKind = "income" | "expense";

/** Row in Historiku (from activity log). */
export type MoneyTimelineRow = {
  id: string;
  /** Log timestamp from Firestore (if available). */
  createdAt?: Date | null;
  kind: MoneyTimelineKind;
  action: ActivityAction;
  actorEmail?: string | null;
  auditSource?: AuditSource;
  eventType?: AuditEventType;
  changeDetails?: AuditChangeDetails;
  /** Legacy/system flag from stored activity log docs. */
  source?: "backfill";
  /** Set for expenses; null for dashboard income rows */
  ownerKey: ExpenseOwnerKey | null;
  client: string;
  /** Original amount in `currency`. */
  amount: number;
  currency?: LedgerCurrency;
  /** Locked currency→MKD rate used when this event was recorded. */
  rateAtEntry?: number;
  /** Locked MKD value at entry time (amount × rateAtEntry). */
  mkdValueAtEntry?: number;
  /** EUR equivalent (for MKD line / exports). */
  amountEur?: number;
  date: string;
  /** Change to total budget for income stream (create / update / delete). */
  budgetDelta?: number;
  previousClient?: string;
  previousAmount?: number;
  previousCurrency?: LedgerCurrency;
  previousAmountEur?: number;
  previousRateAtEntry?: number;
  previousMkdValueAtEntry?: number;
};

export type MoneyTimelineKindFilter = "all" | MoneyTimelineKind;

export type MoneyTimelineOwnerFilter = "all" | ExpenseOwnerKey;
