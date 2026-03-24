"use client";

/** Historiku: budget activity timeline; narrow layout uses cards (and short landscape viewports). */

import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import type { User } from "firebase/auth";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { getFirebaseAuth } from "@/lib/firebase";
import {
  backfillActivityLogIfEmpty,
  subscribeActivityLog,
} from "@/lib/firestore/activityLog";
import { subscribeUserAppData, sumAllExpenses } from "@/lib/firestore/userAppData";
import { activityEventsToRows } from "@/lib/history/activityToRows";
import { TablePagination } from "@/components/pagination/TablePagination";
import { useLedgerPaginationPreference } from "@/hooks/useLedgerPaginationPreference";
import { useLedgerRowsPerView } from "@/hooks/useLedgerRowsPerView";
import { AmountEurMkd } from "@/components/AmountEurMkd";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { useEurMkdRate } from "@/contexts/EurMkdRateContext";
import {
  formatEur,
  formatEurDelta,
  formatMoneyAmount,
  formatRate,
} from "@/lib/formatMoney";
import { amountToMkdDisplay, convertToEur } from "@/lib/currency";
import { downloadExcelCsv } from "@/lib/export/excelCsv";
import { eurToMkd, formatMkd } from "@/lib/export/eurMkd";
import { EXPENSE_OWNER_KEYS } from "@/types/userApp";
import type { ExpenseOwnerKey, UserAppData } from "@/types/userApp";
import type { ActivityEventParsed } from "@/types/activityLog";
import type {
  MoneyTimelineKindFilter,
  MoneyTimelineOwnerFilter,
  MoneyTimelineRow,
} from "@/types/history";

const OWNER_LABEL: Record<ExpenseOwnerKey, string> = {
  elvis: "Elvis",
  urim: "Urim",
  bunjamin: "Bunjamin",
  puntoret: "UEB",
};

const HISTORY_MOBILE_MAX_PX = 640;
/** Match globals.css: phone landscape is often wider than 640px but very short — still use card layout. */
const HISTORY_SHORT_VIEWPORT_MAX_PX = 560;

function useNarrowHistoryLayout(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mqNarrow = window.matchMedia(
        `(max-width: ${HISTORY_MOBILE_MAX_PX}px)`
      );
      const mqShortViewport = window.matchMedia(
        `(max-width: 1024px) and (max-height: ${HISTORY_SHORT_VIEWPORT_MAX_PX}px)`
      );
      mqNarrow.addEventListener("change", onChange);
      mqShortViewport.addEventListener("change", onChange);
      return () => {
        mqNarrow.removeEventListener("change", onChange);
        mqShortViewport.removeEventListener("change", onChange);
      };
    },
    () => {
      const narrow = window.matchMedia(
        `(max-width: ${HISTORY_MOBILE_MAX_PX}px)`
      ).matches;
      const shortViewport = window.matchMedia(
        `(max-width: 1024px) and (max-height: ${HISTORY_SHORT_VIEWPORT_MAX_PX}px)`
      ).matches;
      return narrow || shortViewport;
    },
    () => false
  );
}

type HistoryViewProps = {
  user: User;
};

export function HistoryView({ user }: HistoryViewProps) {
  const router = useRouter();
  const [appData, setAppData] = useState<UserAppData | null>(null);
  const [events, setEvents] = useState<ActivityEventParsed[]>([]);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [kindFilter, setKindFilter] =
    useState<MoneyTimelineKindFilter>("all");
  const [ownerFilter, setOwnerFilter] =
    useState<MoneyTimelineOwnerFilter>("all");
  const [filterInput, setFilterInput] = useState("");
  const [tablePage, setTablePage] = useState(1);

  const {
    rateInput,
    setRateInput,
    rate,
    chfMkdRateInput,
    setChfMkdRateInput,
    chfMkdRate,
  } = useEurMkdRate();
  const { paginationEnabled, togglePagination } = useLedgerPaginationPreference();
  const ledgerRows = useLedgerRowsPerView();
  const backfillOnce = useRef(false);
  const narrowHistory = useNarrowHistoryLayout();

  useEffect(() => {
    const unsub = subscribeUserAppData(
      user,
      (data) => {
        setLoadError(null);
        setAppData(data);
        setReady(true);
      },
      (err) => {
        setLoadError(err.message);
        setReady(true);
      }
    );
    return () => unsub();
  }, [user]);

  useEffect(() => {
    const unsub = subscribeActivityLog(
      user,
      (list) => {
        setLoadError(null);
        setEvents(list);
        setReady(true);
      },
      (err) => {
        setLoadError(err.message);
        setReady(true);
      }
    );
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!appData || backfillOnce.current) return;
    backfillOnce.current = true;
    void backfillActivityLogIfEmpty(user, appData).catch(() => {});
  }, [user, appData]);

  const allRows = useMemo(
    () => activityEventsToRows(events),
    [events]
  );

  const filteredRows = useMemo(() => {
    const q = filterInput.trim().toLowerCase();
    return allRows.filter((row) => {
      if (kindFilter !== "all" && row.kind !== kindFilter) return false;
      if (ownerFilter !== "all") {
        if (row.kind === "income") return false;
        if (row.ownerKey !== ownerFilter) return false;
      }
      if (!q) return true;
      const ownerPart =
        row.ownerKey != null ? OWNER_LABEL[row.ownerKey].toLowerCase() : "";
      return (
        row.client.toLowerCase().includes(q) ||
        row.date.includes(q) ||
        String(row.amount).includes(q) ||
        (row.currency?.toLowerCase().includes(q) ?? false) ||
        ownerPart.includes(q)
      );
    });
  }, [allRows, filterInput, kindFilter, ownerFilter]);

  const pageSize = Math.max(1, ledgerRows);

  const totalTablePages = paginationEnabled
    ? Math.max(1, Math.ceil(filteredRows.length / pageSize))
    : 1;

  const safeTablePage = paginationEnabled
    ? Math.min(Math.max(1, tablePage), totalTablePages)
    : 1;

  const displayRows = useMemo(() => {
    if (!paginationEnabled) return filteredRows;
    const start = (safeTablePage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, paginationEnabled, safeTablePage, pageSize]);

  const exportHistory = useCallback(() => {
    if (filteredRows.length === 0) {
      alert("Nuk ka të dhëna për eksport.");
      return;
    }

    const mkdFromEur = (eur: number) => formatMkd(eurToMkd(eur, rate));

    const filteredIncomeTotal = filteredRows
      .filter((row) => row.kind === "income")
      .reduce((sum, row) => sum + row.amount, 0);
    const filteredExpenseTotal = filteredRows
      .filter((row) => row.kind === "expense")
      .reduce((sum, row) => sum + row.amount, 0);
    const totalBudget = appData?.totalBudget ?? 0;
    const totalExpenses = appData ? sumAllExpenses(appData) : 0;
    const remaining = totalBudget - totalExpenses;

    const rows = [
      [
        { header: "Data", value: "Data" },
        { header: "Lloji", value: "Lloji" },
        { header: "Veprimi", value: "Veprimi" },
        { header: "Pronari", value: "Pronari" },
        { header: "Pershkrimi", value: "Përshkrimi" },
        { header: "Shuma", value: "Shuma" },
        { header: "ShumaMKD", value: "Shuma (MKD)" },
        { header: "Ndikimi", value: "Ndikimi në buxhet" },
      ],
      ...filteredRows.map((row) => [
        { header: "Data", value: row.date },
        { header: "Lloji", value: kindCategory(row) },
        { header: "Veprimi", value: veprimLabel(row) },
        {
          header: "Pronari",
          value:
            row.kind === "expense" && row.ownerKey != null
              ? OWNER_LABEL[row.ownerKey]
              : "—",
        },
        {
          header: "Pershkrimi",
          value:
            row.action === "update" &&
            row.previousClient != null &&
            row.previousClient !== row.client
              ? `${row.previousClient} -> ${row.client}`
              : row.client,
        },
        {
          header: "Shuma",
          value: formatHistoryAmountExport(row),
        },
        {
          header: "ShumaMKD",
          value: formatMkd(
            amountToMkdDisplay(
              row.amount,
              row.currency ?? "EUR",
              rate,
              chfMkdRate
            )
          ),
        },
        {
          header: "Ndikimi",
          value:
            row.kind === "income" && row.budgetDelta != null
              ? formatEurDelta(row.budgetDelta)
              : "—",
        },
      ]),
      [
        { header: "Data", value: "" },
        { header: "Lloji", value: "" },
        { header: "Veprimi", value: "" },
        { header: "Pronari", value: "" },
        { header: "Pershkrimi", value: "" },
        { header: "Shuma", value: "" },
        { header: "ShumaMKD", value: "" },
        { header: "Ndikimi", value: "" },
      ],
      [
        { header: "Data", value: "Përmbledhje" },
        { header: "Lloji", value: "Vlera" },
        { header: "Veprimi", value: "" },
        { header: "Pronari", value: "" },
        { header: "Pershkrimi", value: "" },
        { header: "Shuma", value: "" },
        { header: "ShumaMKD", value: "" },
        { header: "Ndikimi", value: "" },
      ],
      [
        {
          header: "Data",
          value: "Kursi i përdorur për konvertim (1 EUR = MKD)",
        },
        { header: "Lloji", value: String(rate) },
        { header: "Veprimi", value: "" },
        { header: "Pronari", value: "" },
        { header: "Pershkrimi", value: "" },
        { header: "Shuma", value: "" },
        { header: "ShumaMKD", value: "" },
        { header: "Ndikimi", value: "" },
      ],
      [
        {
          header: "Data",
          value: "Kursi i përdorur për konvertim (1 CHF = MKD)",
        },
        { header: "Lloji", value: String(chfMkdRate) },
        { header: "Veprimi", value: "" },
        { header: "Pronari", value: "" },
        { header: "Pershkrimi", value: "" },
        { header: "Shuma", value: "" },
        { header: "ShumaMKD", value: "" },
        { header: "Ndikimi", value: "" },
      ],
      [
        { header: "Data", value: "Totali buxhetit (global)" },
        { header: "Lloji", value: formatEur(totalBudget) },
        { header: "Veprimi", value: "" },
        { header: "Pronari", value: "" },
        { header: "Pershkrimi", value: "" },
        { header: "Shuma", value: "" },
        { header: "ShumaMKD", value: mkdFromEur(totalBudget) },
        { header: "Ndikimi", value: "" },
      ],
      [
        { header: "Data", value: "Totali daljeve (global)" },
        { header: "Lloji", value: `${totalExpenses} €` },
        { header: "Veprimi", value: "" },
        { header: "Pronari", value: "" },
        { header: "Pershkrimi", value: "" },
        { header: "Shuma", value: "" },
        { header: "ShumaMKD", value: mkdFromEur(totalExpenses) },
        { header: "Ndikimi", value: "" },
      ],
      [
        { header: "Data", value: "Fitimi / Gjendja aktuale (global)" },
        { header: "Lloji", value: formatEur(remaining) },
        { header: "Veprimi", value: "" },
        { header: "Pronari", value: "" },
        { header: "Pershkrimi", value: "" },
        { header: "Shuma", value: "" },
        { header: "ShumaMKD", value: mkdFromEur(remaining) },
        { header: "Ndikimi", value: "" },
      ],
      [
        { header: "Data", value: "Totali i të hyrave (rreshtat e eksportuar)" },
        { header: "Lloji", value: `${filteredIncomeTotal} €` },
        { header: "Veprimi", value: "" },
        { header: "Pronari", value: "" },
        { header: "Pershkrimi", value: "" },
        { header: "Shuma", value: "" },
        { header: "ShumaMKD", value: mkdFromEur(filteredIncomeTotal) },
        { header: "Ndikimi", value: "" },
      ],
      [
        { header: "Data", value: "Totali i shpenzimeve (rreshtat e eksportuar)" },
        { header: "Lloji", value: formatEur(filteredExpenseTotal) },
        { header: "Veprimi", value: "" },
        { header: "Pronari", value: "" },
        { header: "Pershkrimi", value: "" },
        { header: "Shuma", value: "" },
        { header: "ShumaMKD", value: mkdFromEur(filteredExpenseTotal) },
        { header: "Ndikimi", value: "" },
      ],
      [
        { header: "Data", value: "Numri i rreshtave të eksportuar" },
        { header: "Lloji", value: filteredRows.length },
        { header: "Veprimi", value: "" },
        { header: "Pronari", value: "" },
        { header: "Pershkrimi", value: "" },
        { header: "Shuma", value: "" },
        { header: "ShumaMKD", value: "" },
        { header: "Ndikimi", value: "" },
      ],
    ];
    downloadExcelCsv("historiku-export", rows);
  }, [appData, filteredRows, rate, chfMkdRate]);

  const onKindChange = useCallback((v: MoneyTimelineKindFilter) => {
    setKindFilter(v);
    setTablePage(1);
    if (v === "income") setOwnerFilter("all");
  }, []);

  const onOwnerChange = useCallback((v: MoneyTimelineOwnerFilter) => {
    setOwnerFilter(v);
    setTablePage(1);
  }, []);

  async function handleSignOut() {
    await signOut(getFirebaseAuth());
    router.replace("/login");
    router.refresh();
  }

  if (!ready && !loadError) {
    return (
      <div id="container" className="app-viewport-lock">
        <div id="right-container">
          <div id="dashboard">
            <p>Duke u ngarkuar…</p>
          </div>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div id="container" className="app-viewport-lock">
        <div id="right-container">
          <div id="dashboard">
            <p>{loadError}</p>
          </div>
        </div>
      </div>
    );
  }

  const ledgerTable = (
    <table className="history-data-table">
      <thead>
        <tr>
          <th>Data</th>
          <th>Lloji</th>
          <th>Veprimi</th>
          <th>Pronari</th>
          <th>Përshkrimi</th>
          <th>Shuma (€ / MKD / CHF)</th>
          <th>Ndikimi në buxhet</th>
        </tr>
      </thead>
      <tbody id="tableBody">
        {filteredRows.length === 0 ? (
          <tr>
            <td colSpan={7} className="history-empty">
              {allRows.length === 0
                ? "Nuk ka aktivitet të regjistruar ende."
                : "Nuk ka rreshta që përputhen me filtrat."}
            </td>
          </tr>
        ) : (
          displayRows.map((row) => (
            <HistoryEntry key={row.id} row={row} layout="table" />
          ))
        )}
      </tbody>
    </table>
  );

  /** Full filtered list for print only — compact table like Përmbledhje (not mobile cards). */
  const historyPrintTable = (
    <table className="history-data-table history-print-data-table">
      <thead>
        <tr>
          <th>Data</th>
          <th>Lloji</th>
          <th>Veprimi</th>
          <th>Pronari</th>
          <th>Përshkrimi</th>
          <th>Shuma (€ / MKD / CHF)</th>
          <th>Ndikimi në buxhet</th>
        </tr>
      </thead>
      <tbody>
        {filteredRows.length === 0 ? (
          <tr>
            <td colSpan={7} className="history-empty">
              {allRows.length === 0
                ? "Nuk ka aktivitet të regjistruar ende."
                : "Nuk ka rreshta që përputhen me filtrat."}
            </td>
          </tr>
        ) : (
          filteredRows.map((row) => (
            <HistoryEntry
              key={`print-${row.id}`}
              row={row}
              layout="table"
            />
          ))
        )}
      </tbody>
    </table>
  );

  const historyMobileCards =
    filteredRows.length === 0 ? (
      <p className="history-empty--card">
        {allRows.length === 0
          ? "Nuk ka aktivitet të regjistruar ende."
          : "Nuk ka rreshta që përputhen me filtrat."}
      </p>
    ) : (
      <div className="history-card-stack">
        {displayRows.map((row) => (
          <HistoryEntry key={row.id} row={row} layout="card" />
        ))}
      </div>
    );

  return (
    <div id="container" className="app-viewport-lock">
      <div id="left-container">
        <div className="dashboard-column-toolbar">
          <button
            type="button"
            className="dashboard-toolbar-signout"
            onClick={() => void handleSignOut()}
          >
            Dil
          </button>
          <ThemeToggle />
        </div>
        <div className="card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Logo" className="logo" />

          <h1>Historiku</h1>
          <p className="history-intro">
          Këtu regjistrohet çdo veprim që lidhet me buxhetin dhe shpenzimet, përfshirë shtimet, fshirjet dhe ndryshimet.
          </p>

          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="ledger-pagination-toggle"
            style={{ display: "block", margin: "0 auto 8px" }}
          >
            Kthehu në Dashboard
          </button>
          <button
            type="button"
            onClick={() => router.push("/reports")}
            className="ledger-pagination-toggle"
            style={{ display: "block", margin: "0 auto" }}
          >
            Përmbledhje
          </button>
        </div>
      </div>

      <div id="right-container">
        <div id="dashboard">
          <div id="filter-container" className="history-filters">
            <div className="history-filter-row">
              <label htmlFor="history-kind" className="sr-only">
                Lloji
              </label>
              <select
                id="history-kind"
                value={kindFilter}
                onChange={(e) =>
                  onKindChange(e.target.value as MoneyTimelineKindFilter)
                }
              >
                <option value="all">Të gjitha llojet</option>
                <option value="income">Vetëm të ardhurat (buxheti)</option>
                <option value="expense">Vetëm shpenzimet</option>
              </select>

              <label htmlFor="history-owner" className="sr-only">
                Pronari
              </label>
              <select
                id="history-owner"
                value={ownerFilter}
                disabled={kindFilter === "income"}
                onChange={(e) =>
                  onOwnerChange(e.target.value as MoneyTimelineOwnerFilter)
                }
              >
                <option value="all">Të gjithë pronarët</option>
                {EXPENSE_OWNER_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {OWNER_LABEL[k]}
                  </option>
                ))}
              </select>
            </div>
            <div className="filter-actions-row">
              <label htmlFor="history-search" className="sr-only">
                Kërko
              </label>
              <input
                type="text"
                id="history-search"
                placeholder="Kërko sipas përshkrimit, datës ose shumës…"
                value={filterInput}
                onChange={(e) => {
                  setFilterInput(e.target.value);
                  setTablePage(1);
                }}
              />
              <div className="currency-rates-block">
                <div className="eur-mkd-field">
                  <label htmlFor="eur-mkd-rate-history">
                    Kursi EUR → MKD (1 € sa denarë)
                  </label>
                  <input
                    id="eur-mkd-rate-history"
                    type="number"
                    min={0}
                    step={0.1}
                    placeholder="61.5"
                    value={rateInput}
                    onChange={(e) => setRateInput(e.target.value)}
                  />
                </div>
                <div className="eur-mkd-field">
                  <label htmlFor="chf-mkd-rate-history">
                    Kursi CHF → MKD (1 CHF sa denarë)
                  </label>
                  <input
                    id="chf-mkd-rate-history"
                    type="number"
                    min={0}
                    step={0.1}
                    placeholder="68"
                    value={chfMkdRateInput}
                    onChange={(e) => setChfMkdRateInput(e.target.value)}
                  />
                </div>
              </div>
              <button
                type="button"
                className="ledger-pagination-toggle excel-export-btn"
                onClick={exportHistory}
              >
                Eksporto Excel
              </button>
              <button
                type="button"
                className="ledger-pagination-toggle"
                onClick={() => window.print()}
              >
                Printo
              </button>
              <button
                type="button"
                className="ledger-pagination-toggle"
                aria-pressed={paginationEnabled}
                onClick={() => {
                  togglePagination();
                  setTablePage(1);
                }}
              >
                {paginationEnabled ? "Scroll" : "Faqe"}
              </button>
            </div>
          </div>

          <h2 className="print-only-page-title">Historiku</h2>
          <div className="dashboard-ledger history-ledger">
            <div className="history-print-only" aria-hidden="true">
              {historyPrintTable}
            </div>
            {narrowHistory ? (
              historyMobileCards
            ) : (
              <div
                className={
                  paginationEnabled
                    ? "ledger-table-wrap"
                    : "ledger-table-wrap ledger-table-wrap--scroll"
                }
              >
                {paginationEnabled ? (
                  ledgerTable
                ) : (
                  <div className="ledger-table-scroll">{ledgerTable}</div>
                )}
              </div>
            )}

            {paginationEnabled ? (
              <TablePagination
                page={safeTablePage}
                totalPages={totalTablePages}
                totalItems={filteredRows.length}
                pageSize={pageSize}
                onPageChange={setTablePage}
              />
            ) : null}
          </div>

          <div id="buttons">
            <h3>Pagesat:</h3>
            <button type="button" onClick={() => router.push("/urim")}>
              Urim
            </button>
            <button type="button" onClick={() => router.push("/elvis")}>
              Elvis
            </button>
            <button type="button" onClick={() => router.push("/bunjamin")}>
              Bunjamin
            </button>
            <button type="button" onClick={() => router.push("/puntoret")}>
              Puntorët
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function kindCategory(row: MoneyTimelineRow): string {
  return row.kind === "income" ? "Të ardhura (buxhet)" : "Shpenzim";
}

function veprimLabel(row: MoneyTimelineRow): string {
  if (row.kind === "income") {
    if (row.action === "create") return "Shtim në buxhet";
    if (row.action === "delete") return "Heqje nga buxheti";
    return "Ndryshim në buxhet";
  }
  if (row.action === "create") return "Shpenzim i ri";
  if (row.action === "delete") return "Fshirje shpenzimi";
  return "Ndryshim shpenzimi";
}

function timelineRowEur(row: MoneyTimelineRow): number {
  return row.amountEur ?? row.amount;
}

function formatHistoryAmountExport(row: MoneyTimelineRow): string {
  const cur = row.currency ?? "EUR";
  const prevCur = row.previousCurrency ?? cur;
  if (
    row.action === "update" &&
    row.previousAmount != null &&
    (row.previousAmount !== row.amount || prevCur !== cur)
  ) {
    return `${formatMoneyAmount(row.previousAmount)} ${prevCur} → ${formatMoneyAmount(row.amount)} ${cur}`;
  }
  return `${formatMoneyAmount(row.amount)} ${cur}`;
}

function HistoryEntry({
  row,
  layout,
}: {
  row: MoneyTimelineRow;
  layout: "table" | "card";
}) {
  const { rate, chfMkdRate } = useEurMkdRate();

  const ownerLabel =
    row.kind === "expense" && row.ownerKey != null
      ? OWNER_LABEL[row.ownerKey]
      : "—";

  const clientDisplay =
    row.action === "update" &&
    row.previousClient != null &&
    row.previousClient !== row.client
      ? `${row.previousClient} → ${row.client}`
      : row.client;

  const cur = row.currency ?? "EUR";
  const eur = timelineRowEur(row);
  const prevEur =
    row.previousAmountEur ??
    (row.previousAmount != null ? row.previousAmount : undefined);

  const amountIsUpdate =
    row.action === "update" &&
    row.previousAmount != null &&
    (row.previousAmount !== row.amount ||
      (row.previousCurrency ?? "EUR") !== (row.currency ?? "EUR"));

  const budgetCell =
    row.kind === "income" && row.budgetDelta != null ? (
      <span className="amount-eur-mkd amount-eur-mkd--compact">
        <span
          className={
            row.budgetDelta > 0
              ? "history-budget-pos"
              : row.budgetDelta < 0
                ? "history-budget-neg"
                : ""
          }
        >
          {formatEurDelta(row.budgetDelta)}
        </span>
        <span className="amount-mkd">
          {formatMkd(eurToMkd(row.budgetDelta, rate))}
        </span>
      </span>
    ) : (
      "—"
    );

  const amountCell = amountIsUpdate ? (
    <>
      <div>
        {formatMoneyAmount(row.previousAmount!)}{" "}
        {row.previousCurrency ?? cur} → {formatMoneyAmount(row.amount)} {cur}
      </div>
      <div className="amount-mkd-sub">
        {formatEur(prevEur!)} → {formatEur(eur)}
      </div>
      <div className="amount-mkd-sub">
        {formatMkd(
          amountToMkdDisplay(row.amount, cur, rate, chfMkdRate)
        )}
      </div>
    </>
  ) : cur === "EUR" ? (
    <AmountEurMkd compact eur={eur} />
  ) : (
    <span className="amount-eur-mkd amount-eur-mkd--compact">
      <span className="amount-eur">
        {formatMoneyAmount(row.amount)} {cur}
      </span>
      <span className="amount-mkd">
        <span className="amount-eur">
          {formatEur(convertToEur(row.amount, cur, rate, chfMkdRate))}
        </span>
        <span className="amount-mkd">
          {formatMkd(amountToMkdDisplay(row.amount, cur, rate, chfMkdRate))}
        </span>
      </span>
    </span>
  );

  if (layout === "card") {
    return (
      <article className="history-entry-card">
        <div className="history-entry-card__header">
          <time dateTime={row.date}>{row.date}</time>
          <span className="history-entry-card__kind">{kindCategory(row)}</span>
        </div>
        <dl className="history-entry-card__fields">
          <div className="history-entry-card__row">
            <dt>Veprimi</dt>
            <dd>{veprimLabel(row)}</dd>
          </div>
          <div className="history-entry-card__row">
            <dt>Pronari</dt>
            <dd>{ownerLabel}</dd>
          </div>
          <div className="history-entry-card__row">
            <dt>Përshkrimi</dt>
            <dd>{clientDisplay}</dd>
          </div>
          <div className="history-entry-card__row">
            <dt>Shuma</dt>
            <dd className="history-entry-card__amount">{amountCell}</dd>
          </div>
          {row.kind === "income" ? (
            <div className="history-entry-card__row">
              <dt>Ndikimi në buxhet</dt>
              <dd>{budgetCell}</dd>
            </div>
          ) : null}
        </dl>
      </article>
    );
  }

  return (
    <tr>
      <td>{row.date}</td>
      <td>{kindCategory(row)}</td>
      <td>{veprimLabel(row)}</td>
      <td>{ownerLabel}</td>
      <td className="client">{clientDisplay}</td>
      <td className="amount">{amountCell}</td>
      <td className="history-budget-cell">{budgetCell}</td>
    </tr>
  );
}
