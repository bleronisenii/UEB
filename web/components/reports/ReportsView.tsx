"use client";

import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import type { User } from "firebase/auth";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getFirebaseAuth } from "@/lib/firebase";
import { subscribeUserAppData } from "@/lib/firestore/userAppData";
import { downloadExcelCsv } from "@/lib/export/excelCsv";
import { formatEur, formatRate } from "@/lib/formatMoney";
import { eurToMkd, formatMkd } from "@/lib/export/eurMkd";
import { useEurMkdRate } from "@/contexts/EurMkdRateContext";
import {
  buildPeriodSummary,
  type SummaryPeriodMode,
} from "@/lib/summary/periodSummary";
import type { UserAppData } from "@/types/userApp";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { logAuditEvent } from "@/lib/firestore/activityLog";

type ReportsViewProps = {
  user: User;
};

export function ReportsView({ user }: ReportsViewProps) {
  const router = useRouter();
  const [appData, setAppData] = useState<UserAppData | null>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<SummaryPeriodMode>("month");

  const { rate, chfMkdRate } = useEurMkdRate();

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
        auditSource: "Përmbledhje",
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
        auditSource: "Përmbledhje",
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

  const rows = useMemo(() => {
    if (!appData) return [];
    return buildPeriodSummary(appData, mode, rate, chfMkdRate);
  }, [appData, chfMkdRate, mode, rate]);

  const exportReport = useCallback(() => {
    if (rows.length === 0) {
      alert("Nuk ka të dhëna për eksport.");
      return;
    }
    const periodCol = mode === "month" ? "Muaji" : "Viti";
    const kindLabel =
      mode === "month" ? "Përmbledhje mujore" : "Përmbledhje vjetore";
    const out = [
      [
        { header: "x", value: periodCol },
        { header: "x", value: "Të ardhurat (EUR)" },
        { header: "x", value: "Shpenzimet (EUR)" },
        { header: "x", value: "Diferenca (EUR)" },
        { header: "x", value: "Të ardhurat (MKD)" },
        { header: "x", value: "Shpenzimet (MKD)" },
        { header: "x", value: "Diferenca (MKD)" },
      ],
      [
        { header: "x", value: kindLabel },
        { header: "x", value: "" },
        { header: "x", value: "" },
        { header: "x", value: "" },
        { header: "x", value: "" },
        { header: "x", value: "" },
        { header: "x", value: "" },
      ],
      ...rows.map((r) => [
        { header: "x", value: r.label },
        { header: "x", value: formatEur(r.incomeEur) },
        { header: "x", value: formatEur(r.expenseEur) },
        { header: "x", value: formatEur(r.netEur) },
        {
          header: "x",
          value: formatMkd(eurToMkd(r.incomeEur, rate)),
        },
        {
          header: "x",
          value: formatMkd(eurToMkd(r.expenseEur, rate)),
        },
        {
          header: "x",
          value: formatMkd(eurToMkd(r.netEur, rate)),
        },
      ]),
      [
        { header: "x", value: "" },
        { header: "x", value: "" },
        { header: "x", value: "" },
        { header: "x", value: "" },
        { header: "x", value: "" },
        { header: "x", value: "" },
        { header: "x", value: "" },
      ],
      [
        {
          header: "x",
          value: "Kursi i përdorur (1 EUR = MKD)",
        },
        { header: "x", value: formatRate(rate) },
        { header: "x", value: "" },
        { header: "x", value: "" },
        { header: "x", value: "" },
        { header: "x", value: "" },
        { header: "x", value: "" },
      ],
      [
        {
          header: "x",
          value: "Kursi i përdorur (1 CHF = MKD)",
        },
        { header: "x", value: formatRate(chfMkdRate) },
        { header: "x", value: "" },
        { header: "x", value: "" },
        { header: "x", value: "" },
        { header: "x", value: "" },
        { header: "x", value: "" },
      ],
    ];
    const slug =
      mode === "month" ? "permbledhje-mujore" : "permbledhje-vjetore";
    downloadExcelCsv(`eksport-${slug}`, out);
    void logAuditEvent(user, {
      actorEmail: user.email ?? null,
      auditSource: "Përmbledhje",
      eventType: "export.excel",
      changeDetails: {
        summary: `Exported Excel (${mode}) (${rows.length} rows)`,
      },
      action: "create",
      stream: "income",
      ownerKey: null,
      entryId: null,
      client: "Export Excel",
      amount: rows.length,
      currency: "EUR",
      date: new Date().toLocaleDateString(),
    }).catch(() => {});
  }, [chfMkdRate, mode, rate, rows]);

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
          <h1>Përmbledhje</h1>
          <p className="history-intro">
            Shiko të ardhurat dhe shpenzimet sipas muajit ose vitit. Shumat janë në
            EUR (ekvivalent) si në buxhet.
          </p>
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="ledger-pagination-toggle"
            style={{ display: "block", margin: "0 auto 8px" }}
          >
            Dashboard
          </button>
          <button
            type="button"
            onClick={() => router.push("/history")}
            className="ledger-pagination-toggle"
            style={{ display: "block", margin: "0 auto" }}
          >
            Historiku
          </button>
        </div>
      </div>

      <div id="right-container">
        <div id="dashboard">
          <div id="filter-container">
            <div className="filter-actions-row reports-summary-toolbar">
              <div className="reports-mode-toggle" role="group" aria-label="Lloji i përmbledhjes">
                <button
                  type="button"
                  className={
                    mode === "month"
                      ? "ledger-pagination-toggle reports-mode--active"
                      : "ledger-pagination-toggle"
                  }
                  onClick={() => setMode("month")}
                >
                  Mujore
                </button>
                <button
                  type="button"
                  className={
                    mode === "year"
                      ? "ledger-pagination-toggle reports-mode--active"
                      : "ledger-pagination-toggle"
                  }
                  onClick={() => setMode("year")}
                >
                  Vjetore
                </button>
              </div>
              <button
                type="button"
                className="ledger-pagination-toggle excel-export-btn"
                onClick={exportReport}
              >
                Eksporto Excel
              </button>
              <button
                type="button"
                className="ledger-pagination-toggle"
                onClick={() => {
                  void logAuditEvent(user, {
                    actorEmail: user.email ?? null,
                    auditSource: "Përmbledhje",
                    eventType: "print.page",
                    changeDetails: { summary: "Printed Përmbledhje page" },
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
            </div>
          </div>

          <h2 className="print-only-page-title">Përmbledhje</h2>
          <div className="dashboard-ledger">
            <div className="ledger-table-wrap">
              <table className="reports-summary-table">
                <thead>
                  <tr>
                    <th>{mode === "month" ? "Muaji" : "Viti"}</th>
                    <th>Të ardhurat</th>
                    <th>Shpenzimet</th>
                    <th>Diferenca</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="reports-summary-empty">
                        Nuk ka të dhëna me datë të vlefshme për këtë përmbledhje.
                      </td>
                    </tr>
                  ) : (
                    rows.map((r) => (
                      <tr key={r.key}>
                        <td>{r.label}</td>
                        <td>{formatEur(r.incomeEur)}</td>
                        <td>{formatEur(r.expenseEur)}</td>
                        <td
                          className={
                            r.netEur >= 0
                              ? "reports-net-pos"
                              : "reports-net-neg"
                          }
                        >
                          {formatEur(r.netEur)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div id="buttons">
            <h3>Navigim:</h3>
            <button type="button" onClick={() => router.push("/dashboard")}>
              Dashboard
            </button>
            <button type="button" onClick={() => router.push("/history")}>
              Historiku
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
