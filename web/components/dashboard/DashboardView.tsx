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
  sumAllExpenses,
  updateDashboardEntry,
} from "@/lib/firestore/userAppData";
import { TablePagination } from "@/components/pagination/TablePagination";
import { useLedgerPaginationPreference } from "@/hooks/useLedgerPaginationPreference";
import { useLedgerRowsPerView } from "@/hooks/useLedgerRowsPerView";
import type { LedgerEntry, UserAppData } from "@/types/userApp";

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
  const [filterInput, setFilterInput] = useState("");
  const [tablePage, setTablePage] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingOldClient, setEditingOldClient] = useState("");
  const [editClient, setEditClient] = useState("");
  const [editAmount, setEditAmount] = useState("");

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

  const totalBudget = appData?.totalBudget ?? 0;
  const totalExpenses = appData ? sumAllExpenses(appData) : 0;
  const remaining = totalBudget - totalExpenses;

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
      await addDashboardEntry(user, client, amount, date);
      setClientInput("");
      setAmountInput("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Ruajtja dështoi.";
      alert(msg);
    }
  }, [amountInput, clientInput, user]);

  const onDelete = useCallback(
    async (entry: LedgerEntry) => {
      try {
        await deleteDashboardEntry(user, entry);
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
  }, []);

  const saveEdit = useCallback(
    async (entry: LedgerEntry) => {
      if (!entry.id || editingId !== entry.id) return;
      const newAmount = parseFloat(editAmount);
      try {
        await updateDashboardEntry(
          user,
          entry.id,
          editingOldClient,
          editClient,
          newAmount
        );
        setEditingId(null);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Përditësimi dështoi.";
        alert(msg);
      }
    },
    [editAmount, editClient, editingId, editingOldClient, user]
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
    <table>
      <thead>
        <tr>
          <th>Data</th>
          <th>Klienti</th>
          <th>Shuma</th>
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
              ) : (
                item.amount
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
              <h3>Buxheti Total</h3>
              <p id="totalBudget">{totalBudget} €</p>
            </div>

            <div className="box red">
              <h3>Harxhimet</h3>
              <p id="totalExpenses">{totalExpenses} €</p>
            </div>

            <div className="box blue">
              <h3>Te mbetura</h3>
              <p id="remaining">{remaining} €</p>
            </div>
          </div>
          <div id="filter-container">
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
