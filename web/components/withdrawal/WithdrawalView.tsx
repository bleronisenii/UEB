"use client";

import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import type { User } from "firebase/auth";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addExpenseEntry,
  deleteExpenseEntry,
  subscribeUserAppData,
  updateExpenseEntry,
} from "@/lib/firestore/userAppData";
import { getFirebaseAuth } from "@/lib/firebase";
import {
  AmountEurMkd,
  FormCurrencyHint,
  LedgerCurrencySelect,
  LedgerRowAmount,
} from "@/components/AmountEurMkd";
import { TablePagination } from "@/components/pagination/TablePagination";
import { useLedgerPaginationPreference } from "@/hooks/useLedgerPaginationPreference";
import { useLedgerRowsPerView } from "@/hooks/useLedgerRowsPerView";
import { useEurMkdRate } from "@/contexts/EurMkdRateContext";
import { formatEur, formatRate } from "@/lib/formatMoney";
import { downloadExcelCsv } from "@/lib/export/excelCsv";
import { parseLedgerAmountInput } from "@/lib/export/eurMkd";
import { eurToMkd, formatMkd } from "@/lib/export/eurMkd";
import {
  amountToMkdDisplay,
  ledgerAmountEurLive,
  sumLedgerEntriesEurLive,
} from "@/lib/currency";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { logAuditEvent } from "@/lib/firestore/activityLog";
import type {
  ExpenseOwnerKey,
  LedgerCurrency,
  LedgerEntry,
  UserAppData,
} from "@/types/userApp";

const WITHDRAWAL_TITLES: Record<ExpenseOwnerKey, string> = {
  urim: "Pagesat - Urim",
  elvis: "Pagesat - Elvis",
  bunjamin: "Pagesat - Bunjamin",
  puntoret: "UEB",
};

const WITHDRAWAL_NAV: Record<ExpenseOwnerKey, { label: string; href: string }[]> = {
  urim: [
    { label: "Elvis", href: "/elvis" },
    { label: "Bunjamin", href: "/bunjamin" },
    { label: "Dashboard", href: "/dashboard" },
    { label: "Historiku", href: "/history" },
    { label: "Përmbledhje", href: "/reports" },
    { label: "UEB", href: "/ueb" },
  ],
  elvis: [
    { label: "Bunjamin", href: "/bunjamin" },
    { label: "Urim", href: "/urim" },
    { label: "Dashboard", href: "/dashboard" },
    { label: "Historiku", href: "/history" },
    { label: "Përmbledhje", href: "/reports" },
    { label: "UEB", href: "/ueb" },
  ],
  bunjamin: [
    { label: "Urim", href: "/urim" },
    { label: "Elvis", href: "/elvis" },
    { label: "Dashboard", href: "/dashboard" },
    { label: "Historiku", href: "/history" },
    { label: "Përmbledhje", href: "/reports" },
    { label: "UEB", href: "/ueb" },
  ],
  puntoret: [
    { label: "Dashboard", href: "/dashboard" },
    { label: "Historiku", href: "/history" },
    { label: "Përmbledhje", href: "/reports" },
    { label: "Urim", href: "/urim" },
    { label: "Elvis", href: "/elvis" },
    { label: "Bunjamin", href: "/bunjamin" },
  ],
};

export type WithdrawalViewProps = {
  user: User;
  ownerKey: ExpenseOwnerKey;
};

export function WithdrawalView({ user, ownerKey }: WithdrawalViewProps) {
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
    const list = appData?.expenses[ownerKey] ?? [];
    const q = filterInput.toLowerCase();
    if (!q) return list;
    return list.filter(
      (item) =>
        item.client.toLowerCase().includes(q) || item.date.includes(q)
    );
  }, [appData, ownerKey, filterInput]);

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

  const totalBudget = useMemo(() => {
    return appData
      ? sumLedgerEntriesEurLive(appData.dashboardEntries, rate, chfMkdRate)
      : 0;
  }, [appData, chfMkdRate, rate]);

  const totalAllExpenses = useMemo(() => {
    if (!appData) return 0;
    return Object.values(appData.expenses).flat().reduce(
      (sum, e) => sum + ledgerAmountEurLive(e, rate, chfMkdRate),
      0
    );
  }, [appData, chfMkdRate, rate]);

  const myTotal = useMemo(() => {
    if (!appData) return 0;
    return (appData.expenses[ownerKey] ?? []).reduce(
      (sum, e) => sum + ledgerAmountEurLive(e, rate, chfMkdRate),
      0
    );
  }, [appData, chfMkdRate, ownerKey, rate]);

  const remaining = totalBudget - totalAllExpenses;
  const title = WITHDRAWAL_TITLES[ownerKey];
  const nav = WITHDRAWAL_NAV[ownerKey];
  const entryLabel = "Përshkrimi";
  const entryPlaceholder = "Shkruaje përshkrimin...";

  const exportWithdrawals = useCallback(() => {
    if (filteredEntries.length === 0) {
      alert("Nuk ka të dhëna për eksport.");
      return;
    }

    const mkdFromEur = (eur: number) => formatMkd(eurToMkd(eur, rate));

    const exportedTotal = filteredEntries.reduce(
      (sum, entry) => sum + ledgerAmountEurLive(entry, rate, chfMkdRate),
      0
    );

    const rows = [
      [
        { header: "Data", value: "Data" },
        { header: "Përshkrimi", value: entryLabel },
        { header: "Valuta", value: "Valuta" },
        { header: "Shuma", value: "Shuma (në valutë)" },
        { header: "EUR", value: "EUR (ekv.)" },
        { header: "MKD", value: "Shuma (MKD)" },
      ],
      ...filteredEntries.map((entry) => {
        const eur = ledgerAmountEurLive(entry, rate, chfMkdRate);
        const cur = entry.currency ?? "EUR";
        return [
          { header: "Data", value: entry.date },
          { header: "Përshkrimi", value: entry.client },
          { header: "Valuta", value: cur },
          { header: "Shuma", value: entry.amount },
          { header: "EUR", value: formatEur(eur) },
          {
            header: "MKD",
            value: formatMkd(
              amountToMkdDisplay(entry.amount, cur, rate, chfMkdRate)
            ),
          },
        ];
      }),
      [
        { header: "Data", value: "" },
        { header: "Përshkrimi", value: "" },
        { header: "Valuta", value: "" },
        { header: "Shuma", value: "" },
        { header: "EUR", value: "" },
        { header: "MKD", value: "" },
      ],
      [
        { header: "Data", value: "Përmbledhje" },
        { header: "Përshkrimi", value: "Vlera" },
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
        { header: "Përshkrimi", value: formatRate(rate) },
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
        { header: "Përshkrimi", value: formatRate(chfMkdRate) },
        { header: "Valuta", value: "" },
        { header: "Shuma", value: "" },
        { header: "EUR", value: "" },
        { header: "MKD", value: "" },
      ],
      [
        { header: "Data", value: "Totali buxhetit (global)" },
        { header: "Përshkrimi", value: formatEur(totalBudget) },
        { header: "Valuta", value: "" },
        { header: "Shuma", value: "" },
        { header: "EUR", value: "" },
        { header: "MKD", value: mkdFromEur(totalBudget) },
      ],
      [
        { header: "Data", value: "Totali daljeve (global)" },
        { header: "Përshkrimi", value: formatEur(totalAllExpenses) },
        { header: "Valuta", value: "" },
        { header: "Shuma", value: "" },
        { header: "EUR", value: "" },
        { header: "MKD", value: mkdFromEur(totalAllExpenses) },
      ],
      [
        { header: "Data", value: "Fitimi / Gjendja aktuale (global)" },
        { header: "Përshkrimi", value: formatEur(remaining) },
        { header: "Valuta", value: "" },
        { header: "Shuma", value: "" },
        { header: "EUR", value: "" },
        { header: "MKD", value: mkdFromEur(remaining) },
      ],
      [
        { header: "Data", value: `Totali i tabit ${title}` },
        { header: "Përshkrimi", value: formatEur(myTotal) },
        { header: "Valuta", value: "" },
        { header: "Shuma", value: "" },
        { header: "EUR", value: "" },
        { header: "MKD", value: mkdFromEur(myTotal) },
      ],
      [
        { header: "Data", value: "Totali i rreshtave të eksportuar" },
        { header: "Përshkrimi", value: formatEur(exportedTotal) },
        { header: "Valuta", value: "" },
        { header: "Shuma", value: "" },
        { header: "EUR", value: "" },
        { header: "MKD", value: mkdFromEur(exportedTotal) },
      ],
      [
        { header: "Data", value: "Numri i rreshtave të eksportuar" },
        { header: "Përshkrimi", value: filteredEntries.length },
        { header: "Valuta", value: "" },
        { header: "Shuma", value: "" },
        { header: "EUR", value: "" },
        { header: "MKD", value: "" },
      ],
    ];
    const exportOwnerKey = ownerKey === "puntoret" ? "ueb" : ownerKey;
    downloadExcelCsv(`${exportOwnerKey}-export`, rows);
    void logAuditEvent(user, {
      actorEmail: user.email ?? null,
      auditSource: "Pagesat",
      eventType: "export.excel",
      changeDetails: {
        summary: `Exported Excel (${ownerKey}) (${filteredEntries.length} rows)`,
      },
      action: "create",
      stream: "expense",
      ownerKey,
      entryId: null,
      client: "Export Excel",
      amount: filteredEntries.length,
      currency: "EUR",
      date: new Date().toLocaleDateString(),
    }).catch(() => {});
  }, [
    chfMkdRate,
    entryLabel,
    filteredEntries,
    myTotal,
    ownerKey,
    rate,
    remaining,
    title,
    totalAllExpenses,
    totalBudget,
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
        auditSource: "Pagesat",
        eventType: "rate.eur_mkd.change",
        changeDetails: {
          summary: `EUR→MKD changed from ${prev} to ${rate}`,
          fields: { eurMkdRate: { from: prev, to: rate } },
        },
        action: "update",
        stream: "expense",
        ownerKey,
        entryId: null,
        client: "EUR→MKD rate",
        amount: rate,
        currency: "MKD",
        date: new Date().toLocaleDateString(),
      }).catch(() => {});
      prevRateRef.current = rate;
    }
  }, [ownerKey, rate, user]);

  useEffect(() => {
    if (prevChfRateRef.current == null) {
      prevChfRateRef.current = chfMkdRate;
      return;
    }
    const prev = prevChfRateRef.current;
    if (prev !== chfMkdRate) {
      void logAuditEvent(user, {
        actorEmail: user.email ?? null,
        auditSource: "Pagesat",
        eventType: "rate.chf_mkd.change",
        changeDetails: {
          summary: `CHF→MKD changed from ${prev} to ${chfMkdRate}`,
          fields: { chfMkdRate: { from: prev, to: chfMkdRate } },
        },
        action: "update",
        stream: "expense",
        ownerKey,
        entryId: null,
        client: "CHF→MKD rate",
        amount: chfMkdRate,
        currency: "MKD",
        date: new Date().toLocaleDateString(),
      }).catch(() => {});
      prevChfRateRef.current = chfMkdRate;
    }
  }, [chfMkdRate, ownerKey, user]);

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
      await addExpenseEntry(
        user,
        ownerKey,
        client,
        amount,
        date,
        currencyInput,
        rate,
        chfMkdRate,
        "Pagesat"
      );
      setClientInput("");
      setAmountInput("");
      setCurrencyInput("EUR");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Ruajtja dështoi.";
      alert(msg);
    }
  }, [amountInput, chfMkdRate, clientInput, currencyInput, ownerKey, rate, user]);

  const onDelete = useCallback(
    async (entry: LedgerEntry) => {
      try {
        await deleteExpenseEntry(user, ownerKey, entry, "Pagesat");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Fshirja dështoi.";
        alert(msg);
      }
    },
    [ownerKey, user]
  );

  const startEdit = useCallback((entry: LedgerEntry) => {
    if (!entry.id) return;
    setEditingId(entry.id);
    setEditClient(entry.client);
    setEditAmount(String(entry.amount));
    setEditCurrency(entry.currency ?? "EUR");
  }, []);

  const saveEdit = useCallback(
    async (entry: LedgerEntry) => {
      if (!entry.id || editingId !== entry.id) return;
      const newAmount = parseLedgerAmountInput(editAmount);
      try {
        await updateExpenseEntry(
          user,
          ownerKey,
          entry.id,
          editClient,
          newAmount,
          editCurrency,
          rate,
          chfMkdRate,
          "Pagesat"
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
      ownerKey,
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
    <table className="ledger-data-table">
      <thead>
        <tr>
          <th>Data</th>
          <th>{entryLabel}</th>
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
                  aria-label={`Ndrysho ${entryLabel.toLowerCase()}`}
                  title={`Ndrysho ${entryLabel.toLowerCase()}`}
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
                    id={`edit-currency-${ownerKey}-${item.id}`}
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

          <h1>{title}</h1>

          <div className="form-group">
            <label htmlFor={`clientInput-${ownerKey}`}>{entryLabel}</label>
            <input
              id={`clientInput-${ownerKey}`}
              type="text"
              placeholder={entryPlaceholder}
              value={clientInput}
              onChange={(e) => setClientInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void addItem();
              }}
            />
          </div>

          <div className="form-group">
            <label htmlFor={`amountInput-${ownerKey}`}>Shuma</label>
            <div className="amount-currency-row">
              <input
                id={`amountInput-${ownerKey}`}
                type="number"
                placeholder="Shkruaj shumën..."
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void addItem();
                }}
              />
              <LedgerCurrencySelect
                id={`currencyInput-${ownerKey}`}
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
            <div className="box blue">
              <h3>Gjendja Aktuale</h3>
              <p id="remaining">
                <AmountEurMkd eur={remaining} />
              </p>
            </div>
            <div className="box red">
              <h3>Daljet</h3>
              <p id="totalExpenses">
                <AmountEurMkd eur={myTotal} />
              </p>
            </div>
          </div>
          <div id="filter-container">
            <div className="filter-actions-row">
              <label htmlFor={`filterInput-${ownerKey}`} className="sr-only">
                Filtro sipas klientit ose datës
              </label>
              <input
                type="text"
                id={`filterInput-${ownerKey}`}
                placeholder="Filtro sipas klientit ose datës..."
                value={filterInput}
                onChange={(e) => {
                  setFilterInput(e.target.value);
                  setTablePage(1);
                }}
              />
              <div className="currency-rates-block">
                <div className="eur-mkd-field">
                  <label htmlFor={`eur-mkd-rate-${ownerKey}`}>
                    Kursi EUR → MKD (1 € sa denarë)
                  </label>
                  <input
                    id={`eur-mkd-rate-${ownerKey}`}
                    type="number"
                    min={0}
                    step={0.1}
                    placeholder="61.5"
                    value={rateInput}
                    onChange={(e) => setRateInput(e.target.value)}
                  />
                </div>
                <div className="eur-mkd-field">
                  <label htmlFor={`chf-mkd-rate-${ownerKey}`}>
                    Kursi CHF → MKD (1 CHF sa denarë)
                  </label>
                  <input
                    id={`chf-mkd-rate-${ownerKey}`}
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
                onClick={exportWithdrawals}
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
            {nav.map((item) => (
              <button
                key={item.href}
                type="button"
                onClick={() => router.push(item.href)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
