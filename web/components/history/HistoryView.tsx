"use client";

import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import type { User } from "firebase/auth";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getFirebaseAuth } from "@/lib/firebase";
import {
  backfillActivityLogIfEmpty,
  subscribeActivityLog,
} from "@/lib/firestore/activityLog";
import { subscribeUserAppData } from "@/lib/firestore/userAppData";
import { activityEventsToRows } from "@/lib/history/activityToRows";
import { TablePagination } from "@/components/pagination/TablePagination";
import { useLedgerPaginationPreference } from "@/hooks/useLedgerPaginationPreference";
import { useLedgerRowsPerView } from "@/hooks/useLedgerRowsPerView";
import { EXPENSE_OWNER_KEYS } from "@/types/userApp";
import type { ExpenseOwnerKey, UserAppData } from "@/types/userApp";
import type { ActivityEventParsed } from "@/types/activityLog";
import type {
  MoneyTimelineKindFilter,
  MoneyTimelineOwnerFilter,
  MoneyTimelineRow,
} from "@/types/history";
import Link from "next/link";

const OWNER_LABEL: Record<ExpenseOwnerKey, string> = {
  elvis: "Elvis",
  urim: "Urim",
  bunjamin: "Bunjamin",
  puntoret: "Punëtorët",
};

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

  const { paginationEnabled, togglePagination } = useLedgerPaginationPreference();
  const ledgerRows = useLedgerRowsPerView();
  const backfillOnce = useRef(false);

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
    <table>
      <thead>
        <tr>
          <th>Data</th>
          <th>Lloji</th>
          <th>Veprimi</th>
          <th>Pronari</th>
          <th>Përshkrimi</th>
          <th>Shuma</th>
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
          displayRows.map((row) => <HistoryRow key={row.id} row={row} />)
        )}
      </tbody>
    </table>
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
          <button
            type="button"
            className="ledger-pagination-toggle"
            aria-pressed={paginationEnabled}
            onClick={() => {
              togglePagination();
              setTablePage(1);
            }}
          >
            {paginationEnabled ? "Pamje me scroll" : "Ndarë në faqe"}
          </button>
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
            style={{ display: "block", margin: "0 auto" }}
          >
            Kthehu në Dashboard
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
          </div>

          <div className="dashboard-ledger">
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

function HistoryRow({ row }: { row: MoneyTimelineRow }) {
  const ownerLabel =
    row.kind === "expense" && row.ownerKey != null
      ? OWNER_LABEL[row.ownerKey]
      : "—";

  const amountDisplay =
    row.action === "update" &&
    row.previousAmount != null &&
    row.previousAmount !== row.amount
      ? `${row.previousAmount} → ${row.amount}`
      : String(row.amount);

  const clientDisplay =
    row.action === "update" &&
    row.previousClient != null &&
    row.previousClient !== row.client
      ? `${row.previousClient} → ${row.client}`
      : row.client;

  const budgetCell =
    row.kind === "income" && row.budgetDelta != null ? (
      <span
        className={
          row.budgetDelta > 0
            ? "history-budget-pos"
            : row.budgetDelta < 0
              ? "history-budget-neg"
              : ""
        }
      >
        {row.budgetDelta > 0 ? "+" : ""}
        {row.budgetDelta} €
      </span>
    ) : (
      "—"
    );

  return (
    <tr>
      <td>{row.date}</td>
      <td>{kindCategory(row)}</td>
      <td>{veprimLabel(row)}</td>
      <td>{ownerLabel}</td>
      <td className="client">{clientDisplay}</td>
      <td className="amount">{amountDisplay}</td>
      <td className="history-budget-cell">{budgetCell}</td>
    </tr>
  );
}
