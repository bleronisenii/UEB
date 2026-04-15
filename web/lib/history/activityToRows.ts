import type { ActivityEventParsed } from "@/types/activityLog";
import type { MoneyTimelineRow } from "@/types/history";

export function activityEventsToRows(events: ActivityEventParsed[]): MoneyTimelineRow[] {
  return events.map(activityToRow);
}

function activityToRow(ev: ActivityEventParsed): MoneyTimelineRow {
  const amountEur =
    typeof ev.amountEur === "number" && Number.isFinite(ev.amountEur)
      ? ev.amountEur
      : ev.amount;
  const previousAmountEur =
    typeof ev.previousAmountEur === "number" &&
    Number.isFinite(ev.previousAmountEur)
      ? ev.previousAmountEur
      : ev.previousAmount;
  return {
    id: ev.id,
    createdAt: ev.createdAt,
    actorEmail: ev.actorEmail,
    auditSource: ev.auditSource,
    eventType: ev.eventType,
    changeDetails: ev.changeDetails,
    source: ev.source,
    kind: ev.stream === "income" ? "income" : "expense",
    action: ev.action,
    ownerKey: ev.stream === "expense" ? ev.ownerKey : null,
    client: ev.client,
    amount: ev.amount,
    currency: ev.currency,
    amountEur,
    rateAtEntry: ev.rateAtEntry,
    mkdValueAtEntry: ev.mkdValueAtEntry,
    date: ev.date,
    budgetDelta: ev.budgetDelta,
    previousClient: ev.previousClient,
    previousAmount: ev.previousAmount,
    previousCurrency: ev.previousCurrency,
    previousAmountEur,
    previousRateAtEntry: ev.previousRateAtEntry,
    previousMkdValueAtEntry: ev.previousMkdValueAtEntry,
  };
}
