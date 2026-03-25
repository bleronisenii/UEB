import { parseLedgerDateString } from "@/lib/dates/parseLedgerDate";
import { ledgerAmountEurLive } from "@/lib/currency";
import { EXPENSE_OWNER_KEYS, type UserAppData } from "@/types/userApp";

export type SummaryPeriodMode = "month" | "year";

export type PeriodSummaryRow = {
  key: string;
  label: string;
  incomeEur: number;
  expenseEur: number;
  netEur: number;
};

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function yearKey(d: Date): string {
  return String(d.getFullYear());
}

function formatMonthLabel(key: string): string {
  const [ys, ms] = key.split("-");
  const y = Number(ys);
  const m = Number(ms);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
    return key;
  }
  const d = new Date(y, m - 1, 1);
  return new Intl.DateTimeFormat("sq-AL", { month: "long", year: "numeric" }).format(d);
}

export function buildPeriodSummary(
  data: UserAppData,
  mode: SummaryPeriodMode,
  eurMkdRate: number,
  chfMkdRate: number
): PeriodSummaryRow[] {
  const map = new Map<string, { income: number; expense: number }>();

  function bump(key: string, kind: "income" | "expense", eur: number) {
    const cur = map.get(key) ?? { income: 0, expense: 0 };
    if (kind === "income") cur.income += eur;
    else cur.expense += eur;
    map.set(key, cur);
  }

  for (const e of data.dashboardEntries) {
    const d = parseLedgerDateString(e.date);
    if (!d) continue;
    const key = mode === "month" ? monthKey(d) : yearKey(d);
    bump(key, "income", ledgerAmountEurLive(e, eurMkdRate, chfMkdRate));
  }

  for (const owner of EXPENSE_OWNER_KEYS) {
    for (const e of data.expenses[owner]) {
      const d = parseLedgerDateString(e.date);
      if (!d) continue;
      const key = mode === "month" ? monthKey(d) : yearKey(d);
      bump(key, "expense", ledgerAmountEurLive(e, eurMkdRate, chfMkdRate));
    }
  }

  const keys = [...map.keys()].sort((a, b) => b.localeCompare(a));
  return keys.map((key) => {
    const v = map.get(key)!;
    return {
      key,
      label: mode === "month" ? formatMonthLabel(key) : key,
      incomeEur: v.income,
      expenseEur: v.expense,
      netEur: v.income - v.expense,
    };
  });
}
