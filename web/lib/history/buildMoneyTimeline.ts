import { EXPENSE_OWNER_KEYS } from "@/types/userApp";
import type { UserAppData } from "@/types/userApp";
import type { MoneyTimelineRow } from "@/types/history";

/**
 * Phase 1: unified chronological list from current `userAppData` only.
 * Deleted rows are not included (see audit / events for full trail).
 */
export function buildMoneyTimeline(data: UserAppData): MoneyTimelineRow[] {
  const rows: MoneyTimelineRow[] = [];

  for (const e of data.dashboardEntries) {
    rows.push({
      id: e.id ?? `in-${e.date}-${e.client}-${e.amount}`,
      kind: "income",
      action: "create",
      ownerKey: null,
      client: e.client,
      amount: e.amount,
      date: e.date,
    });
  }

  for (const owner of EXPENSE_OWNER_KEYS) {
    for (const e of data.expenses[owner]) {
      rows.push({
        id: e.id ?? `ex-${owner}-${e.date}-${e.client}-${e.amount}`,
        kind: "expense",
        action: "create",
        ownerKey: owner,
        client: e.client,
        amount: e.amount,
        date: e.date,
      });
    }
  }

  rows.sort((a, b) => {
    const byDate = b.date.localeCompare(a.date);
    if (byDate !== 0) return byDate;
    return a.id.localeCompare(b.id);
  });

  return rows;
}
