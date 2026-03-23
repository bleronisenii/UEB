import type { ActivityEventParsed } from "@/types/activityLog";
import type { MoneyTimelineRow } from "@/types/history";

export function activityEventsToRows(events: ActivityEventParsed[]): MoneyTimelineRow[] {
  return events.map(activityToRow);
}

function activityToRow(ev: ActivityEventParsed): MoneyTimelineRow {
  return {
    id: ev.id,
    kind: ev.stream === "income" ? "income" : "expense",
    action: ev.action,
    ownerKey: ev.stream === "expense" ? ev.ownerKey : null,
    client: ev.client,
    amount: ev.amount,
    date: ev.date,
    budgetDelta: ev.budgetDelta,
    previousClient: ev.previousClient,
    previousAmount: ev.previousAmount,
  };
}
