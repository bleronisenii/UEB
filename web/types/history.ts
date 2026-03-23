import type { ActivityAction } from "@/types/activityLog";
import type { ExpenseOwnerKey } from "@/types/userApp";

export type MoneyTimelineKind = "income" | "expense";

/** Row in Historiku (from activity log). */
export type MoneyTimelineRow = {
  id: string;
  kind: MoneyTimelineKind;
  action: ActivityAction;
  /** Set for expenses; null for dashboard income rows */
  ownerKey: ExpenseOwnerKey | null;
  client: string;
  amount: number;
  date: string;
  /** Change to total budget for income stream (create / update / delete). */
  budgetDelta?: number;
  previousClient?: string;
  previousAmount?: number;
};

export type MoneyTimelineKindFilter = "all" | MoneyTimelineKind;

export type MoneyTimelineOwnerFilter = "all" | ExpenseOwnerKey;
