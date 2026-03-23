"use client";

import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import type { User } from "firebase/auth";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addExpenseEntry,
  deleteExpenseEntry,
  subscribeUserAppData,
  sumAllExpenses,
  sumOwnerExpenses,
  updateExpenseEntry,
} from "@/lib/firestore/userAppData";
import { getFirebaseAuth } from "@/lib/firebase";
import { TablePagination } from "@/components/pagination/TablePagination";
import { useLedgerPaginationPreference } from "@/hooks/useLedgerPaginationPreference";
import { useLedgerRowsPerView } from "@/hooks/useLedgerRowsPerView";
import type { ExpenseOwnerKey, LedgerEntry, UserAppData } from "@/types/userApp";

const WITHDRAWAL_TITLES: Record<ExpenseOwnerKey, string> = {
  urim: "Pagesat - Urim",
  elvis: "Pagesat - Elvis",
  bunjamin: "Pagesat - Bunjamin",
  puntoret: "Puntorët",
};

const WITHDRAWAL_NAV: Record<ExpenseOwnerKey, { label: string; href: string }[]> = {
  urim: [
    { label: "Elvis", href: "/elvis" },
    { label: "Bunjamin", href: "/bunjamin" },
    { label: "Dashboard", href: "/dashboard" },
    { label: "Puntorët", href: "/puntoret" },
  ],
  elvis: [
    { label: "Bunjamin", href: "/bunjamin" },
    { label: "Urim", href: "/urim" },
    { label: "Dashboard", href: "/dashboard" },
    { label: "Puntorët", href: "/puntoret" },
  ],
  bunjamin: [
    { label: "Urim", href: "/urim" },
    { label: "Elvis", href: "/elvis" },
    { label: "Dashboard", href: "/dashboard" },
    { label: "Puntorët", href: "/puntoret" },
  ],
  puntoret: [
    { label: "Dashboard", href: "/dashboard" },
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
  const [filterInput, setFilterInput] = useState("");
  const [tablePage, setTablePage] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
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

  const totalBudget = appData?.totalBudget ?? 0;
  const totalAllExpenses = appData ? sumAllExpenses(appData) : 0;
  const myTotal = appData ? sumOwnerExpenses(appData, ownerKey) : 0;
  const remaining = totalBudget - totalAllExpenses;

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
      await addExpenseEntry(user, ownerKey, client, amount, date);
      setClientInput("");
      setAmountInput("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Ruajtja dështoi.";
      alert(msg);
    }
  }, [amountInput, clientInput, ownerKey, user]);

  const onDelete = useCallback(
    async (entry: LedgerEntry) => {
      try {
        await deleteExpenseEntry(user, ownerKey, entry);
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
  }, []);

  const saveEdit = useCallback(
    async (entry: LedgerEntry) => {
      if (!entry.id || editingId !== entry.id) return;
      const newAmount = parseFloat(editAmount);
      try {
        await updateExpenseEntry(
          user,
          ownerKey,
          entry.id,
          editClient,
          newAmount
        );
        setEditingId(null);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Përditësimi dështoi.";
        alert(msg);
      }
    },
    [editAmount, editClient, editingId, ownerKey, user]
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

  const title = WITHDRAWAL_TITLES[ownerKey];
  const nav = WITHDRAWAL_NAV[ownerKey];

  const ledgerTable = (
    <table>
      <thead>
        <tr>
          <th>Data</th>
          <th>Përshkrimi</th>
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
                  aria-label="Ndrysho përshkrimin"
                  title="Ndrysho përshkrimin"
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

          <h1>{title}</h1>

          <div className="form-group">
            <label htmlFor={`clientInput-${ownerKey}`}>Përshkrimi</label>
            <input
              id={`clientInput-${ownerKey}`}
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
            <label htmlFor={`amountInput-${ownerKey}`}>Shuma</label>
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
              <h3>Buxheti i mbetur</h3>
              <p id="remaining">{remaining} €</p>
            </div>
            <div className="box red">
              <h3>Harxhimet</h3>
              <p id="totalExpenses">{myTotal} €</p>
            </div>
          </div>
          <div id="filter-container">
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
