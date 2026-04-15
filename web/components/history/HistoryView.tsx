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
import JSZip from "jszip";
import { getFirebaseAuth } from "@/lib/firebase";
import {
  backfillActivityLogIfEmpty,
  deleteActivityEventsByIds,
  logAuditEvent,
  subscribeActivityLog,
} from "@/lib/firestore/activityLog";
import { subscribeUserAppData } from "@/lib/firestore/userAppData";
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
import { ledgerAmountEurLive, sumLedgerEntriesEurLive } from "@/lib/currency";
import { buildCsvBlob } from "@/lib/export/excelCsv";
import { eurToMkd, formatMkd } from "@/lib/export/eurMkd";
import { EXPENSE_OWNER_KEYS } from "@/types/userApp";
import type { ExpenseOwnerKey, UserAppData } from "@/types/userApp";
import type { ActivityEventParsed } from "@/types/activityLog";
import type { ExportRow } from "@/lib/export/excelCsv";
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
      if (typeof window === "undefined") return false;
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
  /** Separate streams: one success must not clear the other's error (e.g. permissions). */
  const [appDataError, setAppDataError] = useState<string | null>(null);
  const [activityLogError, setActivityLogError] = useState<string | null>(null);

  const loadError = useMemo(() => {
    if (appDataError && activityLogError) {
      return `${appDataError}; ${activityLogError}`;
    }
    return appDataError ?? activityLogError;
  }, [appDataError, activityLogError]);

  const [kindFilter, setKindFilter] =
    useState<MoneyTimelineKindFilter>("all");
  const [ownerFilter, setOwnerFilter] =
    useState<MoneyTimelineOwnerFilter>("all");
  const [filterInput, setFilterInput] = useState("");
  const [tablePage, setTablePage] = useState(1);
  const [monthlyExportBusy, setMonthlyExportBusy] = useState(false);

  const {
    rate,
    chfMkdRate,
  } = useEurMkdRate();
  const { paginationEnabled, togglePagination } = useLedgerPaginationPreference();
  const ledgerRows = useLedgerRowsPerView();
  const backfillOnce = useRef(false);
  const narrowHistory = useNarrowHistoryLayout();

  useEffect(() => {
    let unsub: (() => void) | undefined;
    try {
      unsub = subscribeUserAppData(
        user,
        (data) => {
          setAppDataError(null);
          setAppData(data);
          setReady(true);
        },
        (err) => {
          setAppDataError(err.message);
          setReady(true);
        }
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      queueMicrotask(() => {
        setAppDataError(msg);
        setReady(true);
      });
      return;
    }
    return () => unsub?.();
  }, [user]);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    try {
      unsub = subscribeActivityLog(
        user,
        (list) => {
          setActivityLogError(null);
          setEvents(list);
          setReady(true);
        },
        (err) => {
          setActivityLogError(err.message);
          setReady(true);
        }
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      queueMicrotask(() => {
        setActivityLogError(msg);
        setReady(true);
      });
      return;
    }
    return () => unsub?.();
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

  const currentRemainingMkdHistorical = useMemo(() => {
    if (!appData) return 0;
    const budgetMkd = appData.dashboardEntries.reduce(
      (sum, e) => sum + (e.mkdValueAtEntry ?? 0),
      0
    );
    const expensesMkd = Object.values(appData.expenses)
      .flat()
      .reduce((sum, e) => sum + (e.mkdValueAtEntry ?? 0), 0);
    return budgetMkd - expensesMkd;
  }, [appData]);

  const { balanceBeforeById, balanceAfterById } = useMemo(() => {
    // Compute remaining budget before/after each event.
    // We start from current remaining (after all events) and walk backwards (newest -> oldest).
    let after = currentRemainingMkdHistorical;
    const beforeMap = new Map<string, number>();
    const afterMap = new Map<string, number>();
    for (const row of allRows) {
      const impact = budgetImpactMkd(row);
      const before = after - impact;
      afterMap.set(row.id, after);
      beforeMap.set(row.id, before);
      after = before;
    }
    return { balanceBeforeById: beforeMap, balanceAfterById: afterMap };
  }, [allRows, currentRemainingMkdHistorical]);

  const buildExportRows = useCallback(
    (rowsToExport: MoneyTimelineRow[]): ExportRow[] => {
      const mkdFromEur = (eur: number) => formatMkd(eurToMkd(eur, rate));

      const filteredIncomeTotal = rowsToExport
        .filter((row) => row.kind === "income")
        .reduce((sum, row) => sum + row.amount, 0);
      const filteredExpenseTotal = rowsToExport
        .filter((row) => row.kind === "expense")
        .reduce((sum, row) => sum + row.amount, 0);
      const totalBudget = appData
        ? sumLedgerEntriesEurLive(appData.dashboardEntries, rate, chfMkdRate)
        : 0;
      const totalExpenses = appData
        ? Object.values(appData.expenses)
            .flat()
            .reduce((sum, e) => sum + ledgerAmountEurLive(e, rate, chfMkdRate), 0)
        : 0;
      const remaining = totalBudget - totalExpenses;

      const rows: ExportRow[] = [
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
      ...rowsToExport.map((row) => [
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
          value: formatEurDelta(budgetImpactEur(row, rate, chfMkdRate)),
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
        { header: "Lloji", value: rowsToExport.length },
        { header: "Veprimi", value: "" },
        { header: "Pronari", value: "" },
        { header: "Pershkrimi", value: "" },
        { header: "Shuma", value: "" },
        { header: "ShumaMKD", value: "" },
        { header: "Ndikimi", value: "" },
      ],
      ];

      return rows;
    },
    [appData, chfMkdRate, rate]
  );

  const exportMonthlyZipAndClearHistory = useCallback(async () => {
    if (allRows.length === 0) {
      alert("Nuk ka të dhëna në historik për eksport mujor.");
      return;
    }
    if (!confirm("Do të eksportohet ZIP mujor dhe pastaj do të pastrohet i gjithë historiku. Vazhdo?")) {
      return;
    }

    const monthKeyForRow = (row: MoneyTimelineRow): string => {
      if (row.createdAt && Number.isFinite(row.createdAt.getTime())) {
        const y = row.createdAt.getFullYear();
        const m = String(row.createdAt.getMonth() + 1).padStart(2, "0");
        return `${y}-${m}`;
      }
      const parsed = new Date(row.date);
      if (Number.isFinite(parsed.getTime())) {
        const y = parsed.getFullYear();
        const m = String(parsed.getMonth() + 1).padStart(2, "0");
        return `${y}-${m}`;
      }
      return `date-${row.date.replace(/[^\dA-Za-z._-]+/g, "-")}`;
    };

    const groups = new Map<string, MoneyTimelineRow[]>();
    for (const row of allRows) {
      const key = monthKeyForRow(row);
      const list = groups.get(key);
      if (list) {
        list.push(row);
      } else {
        groups.set(key, [row]);
      }
    }

    setMonthlyExportBusy(true);
    try {
      const zip = new JSZip();
      const monthKeys = Array.from(groups.keys()).sort();
      for (const monthKey of monthKeys) {
        const monthRows = groups.get(monthKey) ?? [];
        const csvRows = buildExportRows(monthRows);
        const csvBlob = buildCsvBlob(csvRows);
        zip.file(`historiku-${monthKey}.csv`, csvBlob);
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `historiku-mujor-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);

      await deleteActivityEventsByIds(allRows.map((row) => row.id));
      setFilterInput("");
      setKindFilter("all");
      setOwnerFilter("all");
      setTablePage(1);
      void logAuditEvent(user, {
        actorEmail: user.email ?? null,
        auditSource: "Historiku",
        eventType: "export.excel",
        changeDetails: {
          summary: `Exported monthly ZIP (${groups.size} files) and cleared history (${allRows.length} rows)`,
        },
        action: "delete",
        stream: "income",
        ownerKey: null,
        entryId: null,
        client: "Monthly ZIP Export + Clear",
        amount: allRows.length,
        currency: "EUR",
        date: new Date().toLocaleDateString(),
      }).catch(() => {});
      alert("ZIP mujor u krijua me sukses dhe historiku u pastrua.");
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      alert(`Nuk u arrit eksporti mujor: ${msg}`);
    } finally {
      setMonthlyExportBusy(false);
    }
  }, [allRows, buildExportRows, user]);

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
    const permissionHint =
      /permission|insufficient/i.test(loadError) ? (
        <p className="history-error-hint">
          Publikoni rregullat Firestore për{" "}
          <code>{`orgs/{orgId}/userAppData/main`}</code> dhe{" "}
          <code>activityLog</code> (shih <code>web/firestore.rules</code> në repo).
        </p>
      ) : null;
    return (
      <div id="container" className="app-viewport-lock">
        <div id="right-container">
          <div id="dashboard">
            <p role="alert">{loadError}</p>
            {permissionHint}
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
          <th>Përdoruesi</th>
          <th>Lloji</th>
          <th>Veprimi</th>
          <th>Burimi</th>
          <th>Pronari</th>
          <th>Detaje</th>
          <th>Shuma (€ / MKD / CHF)</th>
          <th>Gjendja para</th>
          <th>Ndikimi në buxhet</th>
          <th>Gjendja pas</th>
        </tr>
      </thead>
      <tbody id="tableBody">
        {filteredRows.length === 0 ? (
          <tr>
            <td colSpan={11} className="history-empty">
              {allRows.length === 0
                ? "Nuk ka aktivitet të regjistruar ende."
                : "Nuk ka rreshta që përputhen me filtrat."}
            </td>
          </tr>
        ) : (
          displayRows.map((row) => (
            <HistoryEntry
              key={row.id}
              row={row}
              layout="table"
              balanceBeforeEur={balanceBeforeById.get(row.id) ?? null}
              balanceAfterEur={balanceAfterById.get(row.id) ?? null}
            />
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
          <th>Përdoruesi</th>
          <th>Lloji</th>
          <th>Veprimi</th>
          <th>Burimi</th>
          <th>Pronari</th>
          <th>Detaje</th>
          <th>Shuma (€ / MKD / CHF)</th>
          <th>Gjendja para</th>
          <th>Ndikimi në buxhet</th>
          <th>Gjendja pas</th>
        </tr>
      </thead>
      <tbody>
        {filteredRows.length === 0 ? (
          <tr>
            <td colSpan={11} className="history-empty">
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
              balanceBeforeEur={balanceBeforeById.get(row.id) ?? null}
              balanceAfterEur={balanceAfterById.get(row.id) ?? null}
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
          <HistoryEntry
            key={row.id}
            row={row}
            layout="card"
            balanceBeforeEur={balanceBeforeById.get(row.id) ?? null}
            balanceAfterEur={balanceAfterById.get(row.id) ?? null}
          />
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
              <button
                type="button"
                className="ledger-pagination-toggle excel-export-btn"
                onClick={() => void exportMonthlyZipAndClearHistory()}
                disabled={monthlyExportBusy}
              >
                {monthlyExportBusy ? "Duke eksportuar..." : "Eksporto Mujor ZIP + Pastro"}
              </button>
              <button
                type="button"
                className="ledger-pagination-toggle"
                onClick={() => {
                  void logAuditEvent(user, {
                    actorEmail: user.email ?? null,
                    auditSource: "Historiku",
                    eventType: "print.page",
                    changeDetails: { summary: "Printed Historiku page" },
                    action: "create",
                    stream: "income",
                    ownerKey: null,
                    entryId: null,
                    client: "Print",
                    amount: 0,
                    currency: "EUR",
                    date: new Date().toLocaleDateString(),
                  }).catch(() => {});
                  window.print();
                }}
              >
                Printo
              </button>
              <button
                type="button"
                className={
                  paginationEnabled
                    ? "ledger-pagination-toggle ledger-pagination-toggle--active"
                    : "ledger-pagination-toggle"
                }
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
            <button type="button" onClick={() => router.push("/dashboard")}>
              Dashboard
            </button>
            <button type="button" onClick={() => router.push("/reports")}>
              Përmbledhje
            </button>
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
              UEB
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
  // Prefer explicit audit event type when present (more readable than action/stream only).
  switch (row.eventType) {
    case "budget.add":
      return "Shtoi buxhet";
    case "budget.edit":
      return "Ndryshoi buxhet";
    case "budget.delete":
      return "Fshiu buxhet";
    case "expense.add":
      return "Shtoi shpenzim";
    case "expense.edit":
      return "Ndryshoi shpenzim";
    case "expense.delete":
      return "Fshiu shpenzim";
    case "rate.eur_mkd.change":
      return "Ndryshoi kursin EUR→MKD";
    case "rate.chf_mkd.change":
      return "Ndryshoi kursin CHF→MKD";
    case "export.excel":
      return "Eksportoi Excel";
    case "print.page":
      return "Printoi";
    case "system.backfill":
      return "Sistem (backfill)";
    default:
      break;
  }
  if (row.kind === "income") {
    if (row.action === "create") return "Shtim në buxhet";
    if (row.action === "delete") return "Heqje nga buxheti";
    return "Ndryshim në buxhet";
  }
  if (row.action === "create") return "Shpenzim i ri";
  if (row.action === "delete") return "Fshirje shpenzimi";
  return "Ndryshim shpenzimi";
}

function actorLabel(row: MoneyTimelineRow): string {
  return row.actorEmail ? row.actorEmail : row.source === "backfill" ? "Sistem" : "Nuk dihet";
}

function sourceLabel(row: MoneyTimelineRow): string {
  return row.auditSource ?? (row.source === "backfill" ? "System" : "—");
}

function detailsLabel(row: MoneyTimelineRow): string {
  if (row.changeDetails?.summary) return row.changeDetails.summary;
  // Fallback to previous → next when possible.
  if (
    row.action === "update" &&
    (row.previousClient != null || row.previousAmount != null || row.previousCurrency != null)
  ) {
    const prevCur = row.previousCurrency ?? row.currency ?? "EUR";
    const nextCur = row.currency ?? prevCur;
    const prevAmount = row.previousAmount != null ? `${row.previousAmount} ${prevCur}` : "";
    const nextAmount = `${row.amount} ${nextCur}`;
    const amountPart =
      prevAmount && prevAmount !== nextAmount ? `${prevAmount} → ${nextAmount}` : nextAmount;
    const prevClient = row.previousClient ?? row.client;
    const clientPart = prevClient !== row.client ? `${prevClient} → ${row.client}` : row.client;
    return `${clientPart} · ${amountPart}`.trim();
  }
  // Create/delete
  return row.client || "—";
}

function budgetImpactMkd(row: MoneyTimelineRow): number {
  const nextMkd =
    typeof row.mkdValueAtEntry === "number" && Number.isFinite(row.mkdValueAtEntry)
      ? row.mkdValueAtEntry
      : 0;
  const prevMkd =
    typeof row.previousMkdValueAtEntry === "number" &&
    Number.isFinite(row.previousMkdValueAtEntry)
      ? row.previousMkdValueAtEntry
      : 0;

  if (row.kind === "income") {
    if (row.action === "create") return nextMkd;
    if (row.action === "delete") return -nextMkd;
    return nextMkd - prevMkd;
  }
  if (row.action === "create") return -nextMkd;
  if (row.action === "delete") return nextMkd;
  return -(nextMkd - prevMkd);
}

function budgetImpactEur(
  row: MoneyTimelineRow,
  eurMkdRate: number,
  chfMkdRate: number
): number {
  // Legacy fallback for rows missing locked MKD values.
  const cur = row.currency ?? "EUR";
  const nextEur = convertToEur(row.amount, cur, eurMkdRate, chfMkdRate);
  const prevCur = row.previousCurrency ?? cur;
  const prevAmount = row.previousAmount ?? 0;
  const prevEur = convertToEur(prevAmount, prevCur, eurMkdRate, chfMkdRate);

  if (row.kind === "income") {
    if (row.action === "create") return nextEur;
    if (row.action === "delete") return -nextEur;
    return nextEur - prevEur; // update
  }

  // expense reduces remaining budget
  if (row.action === "create") return -nextEur;
  if (row.action === "delete") return nextEur;
  return -(nextEur - prevEur); // update
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
  balanceBeforeEur,
  balanceAfterEur,
}: {
  row: MoneyTimelineRow;
  layout: "table" | "card";
  balanceBeforeEur: number | null;
  balanceAfterEur: number | null;
}) {
  const { rate, chfMkdRate } = useEurMkdRate();

  const ownerLabel =
    row.kind === "expense" && row.ownerKey != null
      ? OWNER_LABEL[row.ownerKey]
      : "—";

  const cur = row.currency ?? "EUR";
  const rateAtEntry =
    typeof row.rateAtEntry === "number" && Number.isFinite(row.rateAtEntry)
      ? row.rateAtEntry
      : null;
  const mkdAtEntry =
    typeof row.mkdValueAtEntry === "number" && Number.isFinite(row.mkdValueAtEntry)
      ? row.mkdValueAtEntry
      : null;
  const prevMkdAtEntry =
    typeof row.previousMkdValueAtEntry === "number" &&
    Number.isFinite(row.previousMkdValueAtEntry)
      ? row.previousMkdValueAtEntry
      : null;

  const amountIsUpdate =
    row.action === "update" &&
    row.previousAmount != null &&
    (row.previousAmount !== row.amount ||
      (row.previousCurrency ?? "EUR") !== (row.currency ?? "EUR"));

  const impact = budgetImpactEur(row, rate, chfMkdRate);
  const budgetCell =
    Number.isFinite(impact) ? (
      <span className="amount-eur-mkd amount-eur-mkd--compact">
        <span
          className={
            impact > 0
              ? "history-budget-pos"
              : impact < 0
                ? "history-budget-neg"
                : ""
          }
        >
          {formatEurDelta(impact)}
        </span>
        <span className="amount-mkd">
          {formatMkd(eurToMkd(impact, rate))}
        </span>
      </span>
    ) : (
      "—"
    );

  const balanceBeforeCell =
    balanceBeforeEur == null ? (
      "—"
    ) : (
      <AmountEurMkd compact eur={balanceBeforeEur} />
    );

  const balanceAfterCell =
    balanceAfterEur == null ? (
      "—"
    ) : (
      <AmountEurMkd compact eur={balanceAfterEur} />
    );

  const amountCell = amountIsUpdate ? (
    <>
      <div>
        {formatMoneyAmount(row.previousAmount!)}{" "}
        {row.previousCurrency ?? cur} → {formatMoneyAmount(row.amount)} {cur}
      </div>
      <div className="amount-mkd-sub">
        {prevMkdAtEntry != null && mkdAtEntry != null
          ? `${formatMkd(prevMkdAtEntry)} → ${formatMkd(mkdAtEntry)}`
          : mkdAtEntry != null
            ? formatMkd(mkdAtEntry)
            : "Kurs i panjohur"}
        {rateAtEntry != null ? ` · Kursi: ${formatRate(rateAtEntry)}` : ""}
      </div>
    </>
  ) : (
    <span className="amount-eur-mkd amount-eur-mkd--compact">
      <span className="amount-eur">
        {formatMoneyAmount(row.amount)} {cur}
      </span>
      <span className="amount-mkd">
        <span className="amount-mkd">
          {mkdAtEntry != null ? formatMkd(mkdAtEntry) : "Kurs i panjohur"}
          {rateAtEntry != null ? ` · Kursi: ${formatRate(rateAtEntry)}` : ""}
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
            <dt>Përdoruesi</dt>
            <dd>{actorLabel(row)}</dd>
          </div>
          <div className="history-entry-card__row">
            <dt>Burimi</dt>
            <dd>{sourceLabel(row)}</dd>
          </div>
          <div className="history-entry-card__row">
            <dt>Veprimi</dt>
            <dd>{veprimLabel(row)}</dd>
          </div>
          <div className="history-entry-card__row">
            <dt>Pronari</dt>
            <dd>{ownerLabel}</dd>
          </div>
          <div className="history-entry-card__row">
            <dt>Detaje</dt>
            <dd>{detailsLabel(row)}</dd>
          </div>
          <div className="history-entry-card__row">
            <dt>Shuma</dt>
            <dd className="history-entry-card__amount">{amountCell}</dd>
          </div>
          <div className="history-entry-card__row">
            <dt>Ndikimi në buxhet</dt>
            <dd>{budgetCell}</dd>
          </div>
          <div className="history-entry-card__row">
            <dt>Gjendja para</dt>
            <dd>{balanceBeforeCell}</dd>
          </div>
          <div className="history-entry-card__row">
            <dt>Gjendja pas</dt>
            <dd>{balanceAfterCell}</dd>
          </div>
        </dl>
      </article>
    );
  }

  return (
    <tr>
      <td>{row.date}</td>
      <td className="history-actor">{actorLabel(row)}</td>
      <td>{kindCategory(row)}</td>
      <td>{veprimLabel(row)}</td>
      <td>{sourceLabel(row)}</td>
      <td>{ownerLabel}</td>
      <td className="client">{detailsLabel(row)}</td>
      <td className="amount">{amountCell}</td>
      <td className="history-budget-cell">{balanceBeforeCell}</td>
      <td className="history-budget-cell">{budgetCell}</td>
      <td className="history-budget-cell">{balanceAfterCell}</td>
    </tr>
  );
}
