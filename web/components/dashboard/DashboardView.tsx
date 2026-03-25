"use client";

import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import type { User } from "firebase/auth";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getFirebaseAuth } from "@/lib/firebase";
import {
  addDashboardEntry,
  deleteDashboardEntry,
  subscribeUserAppData,
  updateDashboardEntry,
} from "@/lib/firestore/userAppData";
import { TablePagination } from "@/components/pagination/TablePagination";
import { useLedgerPaginationPreference } from "@/hooks/useLedgerPaginationPreference";
import { useLedgerRowsPerView } from "@/hooks/useLedgerRowsPerView";
import {
  AmountEurMkd,
  FormCurrencyHint,
  LedgerCurrencySelect,
  LedgerRowAmount,
} from "@/components/AmountEurMkd";
import { downloadExcelCsv } from "@/lib/export/excelCsv";
import { parseLedgerAmountInput } from "@/lib/export/eurMkd";
import { formatEur, formatRate } from "@/lib/formatMoney";
import { formatMkd } from "@/lib/export/eurMkd";
import { useEurMkdRate } from "@/contexts/EurMkdRateContext";
import { ledgerAmountEur } from "@/lib/currency";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { logAuditEvent } from "@/lib/firestore/activityLog";
import {
  computeBalancesByCurrency,
  historicalTotalEur,
  historicalTotalMkd,
  liveValuationMkd,
} from "@/lib/balances";
import type { LedgerCurrency, LedgerEntry, UserAppData } from "@/types/userApp";

type DashboardViewProps = {
  user: User;
};

export function DashboardView({ user }: DashboardViewProps) {
  const router = useRouter();
  const [appData, setAppData] = useState<UserAppData | null>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [clientInput, setClientInput] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [currencyInput, setCurrencyInput] = useState<LedgerCurrency>("EUR");
  const [filterInput, setFilterInput] = useState("");
  const [tablePage, setTablePage] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingOldClient, setEditingOldClient] = useState("");
  const [editClient, setEditClient] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editCurrency, setEditCurrency] = useState<LedgerCurrency>("EUR");

  const {
    rateInput,
    setRateInput,
    rate,
    chfMkdRateInput,
    setChfMkdRateInput,
    chfMkdRate,
  } = useEurMkdRate();
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  const { paginationEnabled, togglePagination } = useLedgerPaginationPreference();
  const ledgerRows = useLedgerRowsPerView();

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

  const filteredEntries = useMemo(() => {
    if (!appData) return [];
    const q = filterInput.toLowerCase();
    if (!q) return appData.dashboardEntries;
    return appData.dashboardEntries.filter(
      (item) =>
        item.client.toLowerCase().includes(q) || item.date.includes(q)
    );
  }, [appData, filterInput]);

  const pageSize = Math.max(1, ledgerRows);

  const totalTablePages = paginationEnabled
    ? Math.max(1, Math.ceil(filteredEntries.length / pageSize))
    : 1;

  const safeTablePage = paginationEnabled
    ? Math.min(Math.max(1, tablePage), totalTablePages)
    : 1;

  const displayEntries = useMemo(() => {
    if (!paginationEnabled) return filteredEntries;
    const start = (safeTablePage - 1) * pageSize;
    return filteredEntries.slice(start, start + pageSize);
  }, [filteredEntries, paginationEnabled, safeTablePage, pageSize]);

  const historicalIncomeMkd = useMemo(() => {
    if (!appData) return 0;
    return historicalTotalMkd(appData.dashboardEntries, { eurMkdRate: rate, chfMkdRate });
  }, [appData, chfMkdRate, rate]);

  const historicalIncomeEur = useMemo(() => {
    if (!appData) return 0;
    return historicalTotalEur(appData.dashboardEntries);
  }, [appData]);

  const historicalExpenseMkd = useMemo(() => {
    if (!appData) return 0;
    const all = Object.values(appData.expenses).flat();
    return historicalTotalMkd(all, { eurMkdRate: rate, chfMkdRate });
  }, [appData, chfMkdRate, rate]);

  const historicalExpenseEur = useMemo(() => {
    if (!appData) return 0;
    const all = Object.values(appData.expenses).flat();
    return historicalTotalEur(all);
  }, [appData]);

  const balances = useMemo(() => {
    return appData ? computeBalancesByCurrency(appData) : { EUR: 0, MKD: 0, CHF: 0 };
  }, [appData]);

  const currentBalanceMkdLive = useMemo(() => {
    return liveValuationMkd(balances, { eurMkdRate: rate, chfMkdRate });
  }, [balances, chfMkdRate, rate]);

  // Gjendja Aktuale uses CURRENT manual rates on remaining balances only.
  const remaining = currentBalanceMkdLive / rate;

  const exportDashboard = useCallback(() => {
    if (filteredEntries.length === 0) {
      alert("Nuk ka të dhëna për eksport.");
      return;
    }

    const exportedIncome = filteredEntries.reduce(
      (sum, entry) => sum + ledgerAmountEur(entry),
      0
    );

    const rows = [
      [
        { header: "Data", value: "Data" },
        { header: "Klienti", value: "Klienti" },
        { header: "Valuta", value: "Valuta" },
        { header: "Shuma", value: "Shuma (në valutë)" },
        { header: "Shuma", value: "EUR (ekv.)" },
        { header: "MKD", value: "Shuma (MKD)" },
      ],
      ...filteredEntries.map((entry) => {
        const eur = ledgerAmountEur(entry);
        const cur = entry.currency ?? "EUR";
        const mkdAtEntry =
          entry.mkdValueAtEntry != null && Number.isFinite(entry.mkdValueAtEntry)
            ? entry.mkdValueAtEntry
            : null;
        return [
          { header: "Data", value: entry.date },
          { header: "Klienti", value: entry.client },
          { header: "Valuta", value: cur },
          { header: "Shuma", value: entry.amount },
          { header: "Shuma", value: formatEur(eur) },
          {
            header: "MKD",
            value: mkdAtEntry != null ? formatMkd(mkdAtEntry) : "Kurs i panjohur",
          },
        ];
      }),
      [
        { header: "Data", value: "" },
        { header: "Klienti", value: "" },
        { header: "Valuta", value: "" },
        { header: "Shuma", value: "" },
        { header: "EUR", value: "" },
        { header: "MKD", value: "" },
      ],
      [
        { header: "Data", value: "Përmbledhje" },
        { header: "Klienti", value: "Vlera" },
        { header: "Valuta", value: "" },
        { header: "Shuma", value: "" },
        { header: "EUR", value: "" },
        { header: "MKD", value: "" },
      ],
      [
        {
          header: "Data",
          value: "Kursi i përdorur për konvertim (1 EUR = MKD)",
        },
        { header: "Klienti", value: formatRate(rate) },
        { header: "Valuta", value: "" },
        { header: "Shuma", value: "" },
        { header: "EUR", value: "" },
        { header: "MKD", value: "" },
      ],
      [
        {
          header: "Data",
          value: "Kursi i përdorur për konvertim (1 CHF = MKD)",
        },
        { header: "Klienti", value: formatRate(chfMkdRate) },
        { header: "Valuta", value: "" },
        { header: "Shuma", value: "" },
        { header: "EUR", value: "" },
        { header: "MKD", value: "" },
      ],
      [
        { header: "Data", value: "Totali buxhetit (global)" },
        { header: "Klienti", value: formatMkd(historicalIncomeMkd) },
        { header: "Valuta", value: "" },
        { header: "Shuma", value: "" },
        { header: "EUR", value: "" },
        { header: "MKD", value: "" },
      ],
      [
        { header: "Data", value: "Totali daljeve (global)" },
        { header: "Klienti", value: formatMkd(historicalExpenseMkd) },
        { header: "Valuta", value: "" },
        { header: "Shuma", value: "" },
        { header: "EUR", value: "" },
        { header: "MKD", value: "" },
      ],
      [
        { header: "Data", value: "Fitimi / Gjendja aktuale (global)" },
        { header: "Klienti", value: formatEur(remaining) },
        { header: "Valuta", value: "" },
        { header: "Shuma", value: "" },
        { header: "EUR", value: "" },
        { header: "MKD", value: formatMkd(currentBalanceMkdLive) },
      ],
      [
        { header: "Data", value: "Totali i rreshtave të eksportuar" },
        { header: "Klienti", value: formatEur(exportedIncome) },
        { header: "Valuta", value: "" },
        { header: "Shuma", value: "" },
        { header: "EUR", value: "" },
        { header: "MKD", value: "" },
      ],
      [
        { header: "Data", value: "Numri i rreshtave të eksportuar" },
        { header: "Klienti", value: filteredEntries.length },
        { header: "Valuta", value: "" },
        { header: "Shuma", value: "" },
        { header: "EUR", value: "" },
        { header: "MKD", value: "" },
      ],
    ];
    downloadExcelCsv("dashboard-export", rows);
    void logAuditEvent(user, {
      actorEmail: user.email ?? null,
      auditSource: "Dashboard",
      eventType: "export.excel",
      changeDetails: {
        summary: `Exported Excel (${filteredEntries.length} rows)`,
      },
      action: "create",
      stream: "income",
      ownerKey: null,
      entryId: null,
      client: "Export Excel",
      amount: filteredEntries.length,
      currency: "EUR",
      date: new Date().toLocaleDateString(),
    }).catch(() => {});
  }, [
    chfMkdRate,
    currentBalanceMkdLive,
    filteredEntries,
    historicalExpenseMkd,
    historicalIncomeMkd,
    rate,
    remaining,
    user,
  ]);

  const prevRateRef = useRef<number | null>(null);
  const prevChfRateRef = useRef<number | null>(null);
  useEffect(() => {
    if (prevRateRef.current == null) {
      prevRateRef.current = rate;
      return;
    }
    const prev = prevRateRef.current;
    if (prev !== rate) {
      void logAuditEvent(user, {
        actorEmail: user.email ?? null,
        auditSource: "Dashboard",
        eventType: "rate.eur_mkd.change",
        changeDetails: {
          summary: `EUR→MKD changed from ${prev} to ${rate}`,
          fields: { eurMkdRate: { from: prev, to: rate } },
        },
        action: "update",
        stream: "income",
        ownerKey: null,
        entryId: null,
        client: "EUR→MKD rate",
        amount: rate,
        currency: "MKD",
        date: new Date().toLocaleDateString(),
      }).catch(() => {});
      prevRateRef.current = rate;
    }
  }, [rate, user]);

  useEffect(() => {
    if (prevChfRateRef.current == null) {
      prevChfRateRef.current = chfMkdRate;
      return;
    }
    const prev = prevChfRateRef.current;
    if (prev !== chfMkdRate) {
      void logAuditEvent(user, {
        actorEmail: user.email ?? null,
        auditSource: "Dashboard",
        eventType: "rate.chf_mkd.change",
        changeDetails: {
          summary: `CHF→MKD changed from ${prev} to ${chfMkdRate}`,
          fields: { chfMkdRate: { from: prev, to: chfMkdRate } },
        },
        action: "update",
        stream: "income",
        ownerKey: null,
        entryId: null,
        client: "CHF→MKD rate",
        amount: chfMkdRate,
        currency: "MKD",
        date: new Date().toLocaleDateString(),
      }).catch(() => {});
      prevChfRateRef.current = chfMkdRate;
    }
  }, [chfMkdRate, user]);

  const addItem = useCallback(async () => {
    const client = clientInput.trim();
    const amount = parseFloat(amountInput);
    if (!client || Number.isNaN(amount)) {
      alert("Ju lutem, mbushni të gjitha fushat!");
      return;
    }
    if (amount <= 0) {
      alert("Vlera nuk mund të jetë 0 ose negative!");
      return;
    }
    const date = new Date().toLocaleDateString();
    try {
      await addDashboardEntry(
        user,
        client,
        amount,
        date,
        currencyInput,
        rate,
        chfMkdRate,
        "Dashboard"
      );
      setClientInput("");
      setAmountInput("");
      setCurrencyInput("EUR");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Ruajtja dështoi.";
      alert(msg);
    }
  }, [amountInput, chfMkdRate, clientInput, currencyInput, rate, user]);

  const onDelete = useCallback(
    async (entry: LedgerEntry) => {
      try {
        await deleteDashboardEntry(user, entry, "Dashboard");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Fshirja dështoi.";
        alert(msg);
      }
    },
    [user]
  );

  const startEdit = useCallback((entry: LedgerEntry) => {
    if (!entry.id) return;
    setEditingId(entry.id);
    setEditingOldClient(entry.client);
    setEditClient(entry.client);
    setEditAmount(String(entry.amount));
    setEditCurrency(entry.currency ?? "EUR");
  }, []);

  const saveEdit = useCallback(
    async (entry: LedgerEntry) => {
      if (!entry.id || editingId !== entry.id) return;
      const newAmount = parseLedgerAmountInput(editAmount);
      try {
        await updateDashboardEntry(
          user,
          entry.id,
          editingOldClient,
          editClient,
          newAmount,
          editCurrency,
          rate,
          chfMkdRate,
          "Dashboard"
        );
        setEditingId(null);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Përditësimi dështoi.";
        alert(msg);
      }
    },
    [
      chfMkdRate,
      editAmount,
      editClient,
      editCurrency,
      editingId,
      editingOldClient,
      rate,
      user,
    ]
  );

  const scheduleBlurSave = useCallback(
    (entry: LedgerEntry) => {
      const id = entry.id;
      if (!id) return;
      setTimeout(() => {
        const row = rowRefs.current[id];
        if (row && !row.contains(document.activeElement)) {
          void saveEdit(entry);
        }
      }, 0);
    },
    [saveEdit]
  );

  async function handleSignOut() {
    await signOut(getFirebaseAuth());
    router.replace("/login");
    router.refresh();
  }

  if (!ready && !loadError) {
    return (
      <div id="container">
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
      <div id="container">
        <div id="right-container">
          <div id="dashboard">
            <p>{loadError}</p>
          </div>
        </div>
      </div>
    );
  }

  const ledgerTable = (
    <table className="ledger-data-table">
      <thead>
        <tr>
          <th>Data</th>
          <th>Klienti</th>
          <th>Shuma (€ / MKD / CHF)</th>
          <th>Ndrysho</th>
        </tr>
      </thead>
      <tbody id="tableBody">
        {displayEntries.map((item) => (
          <tr
            key={item.id || `${item.date}-${item.client}-${item.amount}`}
            ref={(el) => {
              if (item.id) rowRefs.current[item.id] = el;
            }}
          >
            <td>{item.date}</td>
            <td className="client">
              {editingId === item.id ? (
                <input
                  type="text"
                  value={editClient}
                  aria-label="Ndrysho klientin"
                  title="Ndrysho klientin"
                  onChange={(e) => setEditClient(e.target.value)}
                  onBlur={() => scheduleBlurSave(item)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void saveEdit(item);
                  }}
                />
              ) : (
                item.client
              )}
            </td>
            <td className="amount">
              {editingId === item.id ? (
                <div className="amount-currency-row">
                  <input
                    type="number"
                    value={editAmount}
                    aria-label="Ndrysho shumën"
                    title="Ndrysho shumën"
                    onChange={(e) => setEditAmount(e.target.value)}
                    onBlur={() => scheduleBlurSave(item)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void saveEdit(item);
                    }}
                  />
                  <LedgerCurrencySelect
                    id={`edit-currency-${item.id}`}
                    value={editCurrency}
                    onChange={setEditCurrency}
                  />
                </div>
              ) : (
                <LedgerRowAmount entry={item} />
              )}
            </td>
            <td>
              <div className="actions">
                <button
                  type="button"
                  className="action-btn edit-btn"
                  onClick={() => startEdit(item)}
                >
                  EDIT
                </button>
                <button
                  type="button"
                  className="action-btn delete-btn"
                  onClick={() => void onDelete(item)}
                >
                  X
                </button>
              </div>
            </td>
          </tr>
        ))}
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
          <ThemeToggle />
        </div>
        <div className="card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Logo" className="logo" />

          <h1>Shto Buxhet</h1>

          <div className="form-group">
            <label htmlFor="clientInput">Klienti</label>
            <input
              id="clientInput"
              type="text"
              placeholder="Shkruaj emrin..."
              value={clientInput}
              onChange={(e) => setClientInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void addItem();
              }}
            />
          </div>

          <div className="form-group">
            <label htmlFor="amountInput">Shuma</label>
            <div className="amount-currency-row">
              <input
                id="amountInput"
                type="number"
                placeholder="Shkruaj shumën..."
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void addItem();
                }}
              />
              <LedgerCurrencySelect
                id="currencyInput-dashboard"
                value={currencyInput}
                onChange={setCurrencyInput}
              />
            </div>
            <FormCurrencyHint amountStr={amountInput} currency={currencyInput} />
          </div>

          <button id="addBtn" type="button" onClick={() => void addItem()}>
            ADD
          </button>
        </div>
      </div>

      <div id="right-container">
        <div id="dashboard">
          <div id="status">
            <div className="box green">
              <h3>Të Hyrat Totale</h3>
              <p id="totalBudget">
                <span className="amount-eur-mkd">
                  <span className="amount-eur">{formatEur(historicalIncomeEur)}</span>
                  <span className="amount-mkd">{formatMkd(historicalIncomeMkd)}</span>
                </span>
              </p>
            </div>

            <div className="box red">
              <h3>Daljet Totale</h3>
              <p id="totalExpenses">
                <span className="amount-eur-mkd">
                  <span className="amount-eur">{formatEur(historicalExpenseEur)}</span>
                  <span className="amount-mkd">{formatMkd(historicalExpenseMkd)}</span>
                </span>
              </p>
            </div>

            <div className="box blue">
              <h3>Gjendja Aktuale</h3>
              <p id="remaining">
                <AmountEurMkd eur={remaining} />
              </p>
            </div>
          </div>
          <div id="filter-container">
            <div className="filter-actions-row">
              <label htmlFor="filterInput" className="sr-only">
                Filtro sipas klientit ose datës
              </label>
              <input
                type="text"
                id="filterInput"
                placeholder="Filtro sipas klientit ose datës..."
                value={filterInput}
                onChange={(e) => {
                  setFilterInput(e.target.value);
                  setTablePage(1);
                }}
              />
              <div className="currency-rates-block">
                <div className="eur-mkd-field">
                  <label htmlFor="eur-mkd-rate-dashboard">
                    Kursi EUR → MKD (1 € sa denarë)
                  </label>
                  <input
                    id="eur-mkd-rate-dashboard"
                    type="number"
                    min={0}
                    step={0.1}
                    placeholder="61.5"
                    value={rateInput}
                    onChange={(e) => setRateInput(e.target.value)}
                  />
                </div>
                <div className="eur-mkd-field">
                  <label htmlFor="chf-mkd-rate-dashboard">
                    Kursi CHF → MKD (1 CHF sa denarë)
                  </label>
                  <input
                    id="chf-mkd-rate-dashboard"
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
                onClick={exportDashboard}
              >
                Eksporto Excel
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
                totalItems={filteredEntries.length}
                pageSize={pageSize}
                onPageChange={setTablePage}
              />
            ) : null}
          </div>

          <div id="buttons">
            <h3>Pagesat:</h3>
            <button type="button" onClick={() => router.push("/history")}>
              Historiku
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
              Puntorët
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
