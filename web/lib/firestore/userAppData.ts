import {
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { getFirebaseFirestore } from "@/lib/firebase";
import type { User } from "firebase/auth";
import { appendActivityInTransaction } from "@/lib/firestore/activityLog";
import { USER_APP_DATA_COLLECTION } from "@/lib/firestore/collections";
import { convertToEur, isLedgerCurrency, ledgerAmountEur } from "@/lib/currency";
import {
  EXPENSE_OWNER_KEYS,
  type ExpenseOwnerKey,
  type LedgerCurrency,
  type LedgerEntry,
  type UserAppData,
} from "@/types/userApp";

export function userAppDataRef(uid: string) {
  return doc(getFirebaseFirestore(), USER_APP_DATA_COLLECTION, uid);
}

export function createDefaultUserAppData(): UserAppData {
  const expenses = {} as UserAppData["expenses"];
  for (const k of EXPENSE_OWNER_KEYS) {
    expenses[k] = [];
  }
  return {
    dashboardEntries: [],
    totalBudget: 0,
    expenses,
    updatedAt: null,
  };
}

function parseLedgerEntry(raw: unknown): LedgerEntry {
  if (!raw || typeof raw !== "object") {
    return { client: "", amount: 0, date: "" };
  }
  const o = raw as Record<string, unknown>;
  const client = typeof o.client === "string" ? o.client : "";
  const amount =
    typeof o.amount === "number" && !Number.isNaN(o.amount) ? o.amount : 0;
  const date = typeof o.date === "string" ? o.date : "";
  const id = typeof o.id === "string" ? o.id : undefined;
  const currency = isLedgerCurrency(o.currency) ? o.currency : undefined;
  let amountEur =
    typeof o.amountEur === "number" && !Number.isNaN(o.amountEur)
      ? o.amountEur
      : undefined;
  if (amountEur === undefined) {
    amountEur = amount;
  }
  const entry: LedgerEntry = { id, client, amount, date, amountEur };
  if (currency) entry.currency = currency;
  return entry;
}

function ensureExpensesShape(
  raw: Record<string, LedgerEntry[] | undefined> | undefined
): UserAppData["expenses"] {
  const out = {} as UserAppData["expenses"];
  for (const k of EXPENSE_OWNER_KEYS) {
    const arr = Array.isArray(raw?.[k]) ? raw[k]! : [];
    out[k] = arr.map(parseLedgerEntry);
  }
  return out;
}

export function parseUserAppData(raw: Record<string, unknown>): UserAppData {
  const base = createDefaultUserAppData();
  const entries = raw.dashboardEntries;
  const total = raw.totalBudget;
  return {
    dashboardEntries: Array.isArray(entries)
      ? (entries as unknown[]).map(parseLedgerEntry)
      : base.dashboardEntries,
    totalBudget: typeof total === "number" && !Number.isNaN(total) ? total : 0,
    expenses: ensureExpensesShape(
      raw.expenses as Record<string, LedgerEntry[] | undefined>
    ),
    updatedAt: (raw.updatedAt as UserAppData["updatedAt"]) ?? null,
  };
}

export function subscribeUserAppData(
  user: User,
  onData: (data: UserAppData) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const ref = userAppDataRef(user.uid);
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        void setDoc(ref, {
          ...createDefaultUserAppData(),
          updatedAt: serverTimestamp(),
        });
        return;
      }
      onData(parseUserAppData(snap.data() as Record<string, unknown>));
    },
    (err) => onError(err)
  );
}

export async function addDashboardEntry(
  user: User,
  client: string,
  amount: number,
  dateStr: string,
  currency: LedgerCurrency,
  eurMkdRate: number,
  chfMkdRate: number
): Promise<void> {
  const ref = userAppDataRef(user.uid);
  const id =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const amountEur = convertToEur(amount, currency, eurMkdRate, chfMkdRate);
  const entry: LedgerEntry = {
    id,
    client,
    amount,
    date: dateStr,
    currency,
    amountEur,
  };

  await runTransaction(getFirebaseFirestore(), async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists()
      ? parseUserAppData(snap.data() as Record<string, unknown>)
      : createDefaultUserAppData();
    data.dashboardEntries = [...data.dashboardEntries, entry];
    data.totalBudget += amountEur;
    appendActivityInTransaction(tx, user.uid, {
      action: "create",
      stream: "income",
      ownerKey: null,
      entryId: id,
      client,
      amount,
      currency,
      amountEur,
      date: dateStr,
      budgetDelta: amountEur,
    });
    tx.set(ref, { ...data, updatedAt: serverTimestamp() });
  });
}

export async function deleteDashboardEntry(
  user: User,
  entry: LedgerEntry
): Promise<void> {
  const ref = userAppDataRef(user.uid);
  await runTransaction(getFirebaseFirestore(), async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const data = parseUserAppData(snap.data() as Record<string, unknown>);
    const fromDb = entry.id
      ? data.dashboardEntries.find((e) => e.id === entry.id)
      : undefined;
    if (!fromDb) return;

    const cascaded: { owner: ExpenseOwnerKey; exp: LedgerEntry }[] = [];
    for (const k of EXPENSE_OWNER_KEYS) {
      for (const exp of data.expenses[k]) {
        if (exp.client === fromDb.client) {
          cascaded.push({ owner: k, exp });
        }
      }
    }

    data.dashboardEntries = data.dashboardEntries.filter(
      (e) => e.id !== entry.id
    );
    const removedEur = ledgerAmountEur(fromDb);
    data.totalBudget -= removedEur;
    for (const k of EXPENSE_OWNER_KEYS) {
      data.expenses[k] = data.expenses[k].filter(
        (exp) => exp.client !== fromDb.client
      );
    }

    appendActivityInTransaction(tx, user.uid, {
      action: "delete",
      stream: "income",
      ownerKey: null,
      entryId: fromDb.id ?? null,
      client: fromDb.client,
      amount: fromDb.amount,
      currency: fromDb.currency ?? "EUR",
      amountEur: removedEur,
      date: fromDb.date,
      budgetDelta: -removedEur,
    });
    for (const { owner, exp } of cascaded) {
      appendActivityInTransaction(tx, user.uid, {
        action: "delete",
        stream: "expense",
        ownerKey: owner,
        entryId: exp.id ?? null,
        client: exp.client,
        amount: exp.amount,
        currency: exp.currency ?? "EUR",
        amountEur: ledgerAmountEur(exp),
        date: exp.date,
      });
    }

    tx.set(ref, { ...data, updatedAt: serverTimestamp() });
  });
}

export async function updateDashboardEntry(
  user: User,
  entryId: string,
  oldClient: string,
  newClientInput: string,
  newAmountInput: number,
  newCurrency: LedgerCurrency,
  eurMkdRate: number,
  chfMkdRate: number
): Promise<void> {
  const ref = userAppDataRef(user.uid);
  await runTransaction(getFirebaseFirestore(), async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const data = parseUserAppData(snap.data() as Record<string, unknown>);
    const idx = data.dashboardEntries.findIndex((e) => e.id === entryId);
    if (idx === -1) return;
    const prev = data.dashboardEntries[idx]!;
    const next: LedgerEntry = { ...prev };
    if (newClientInput.trim()) {
      next.client = newClientInput.trim();
    }
    if (!Number.isNaN(newAmountInput)) {
      const prevEur = ledgerAmountEur(prev);
      next.amount = newAmountInput;
      next.currency = newCurrency;
      next.amountEur = convertToEur(newAmountInput, newCurrency, eurMkdRate, chfMkdRate);
      data.totalBudget = data.totalBudget - prevEur + next.amountEur;
      for (const k of EXPENSE_OWNER_KEYS) {
        data.expenses[k] = data.expenses[k].map((exp) =>
          exp.client === oldClient ? { ...exp, client: next.client } : exp
        );
      }
    }
    data.dashboardEntries = [...data.dashboardEntries];
    data.dashboardEntries[idx] = next;
    const prevEur = ledgerAmountEur(prev);
    const nextEur = ledgerAmountEur(next);
    const budgetDelta = nextEur - prevEur;
    appendActivityInTransaction(tx, user.uid, {
      action: "update",
      stream: "income",
      ownerKey: null,
      entryId,
      client: next.client,
      amount: next.amount,
      currency: next.currency ?? "EUR",
      amountEur: nextEur,
      date: next.date,
      previousClient: prev.client,
      previousAmount: prev.amount,
      previousCurrency: prev.currency ?? "EUR",
      previousAmountEur: prevEur,
      budgetDelta,
    });
    tx.set(ref, { ...data, updatedAt: serverTimestamp() });
  });
}

export function sumAllExpenses(data: UserAppData): number {
  let sum = 0;
  for (const k of EXPENSE_OWNER_KEYS) {
    sum += data.expenses[k].reduce((s, e) => s + ledgerAmountEur(e), 0);
  }
  return sum;
}

export function sumOwnerExpenses(
  data: UserAppData,
  ownerKey: ExpenseOwnerKey
): number {
  return data.expenses[ownerKey].reduce((s, e) => s + ledgerAmountEur(e), 0);
}

export async function addExpenseEntry(
  user: User,
  ownerKey: ExpenseOwnerKey,
  client: string,
  amount: number,
  dateStr: string,
  currency: LedgerCurrency,
  eurMkdRate: number,
  chfMkdRate: number
): Promise<void> {
  const ref = userAppDataRef(user.uid);
  const id =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const amountEur = convertToEur(amount, currency, eurMkdRate, chfMkdRate);
  const entry: LedgerEntry = {
    id,
    client,
    amount,
    date: dateStr,
    currency,
    amountEur,
  };

  await runTransaction(getFirebaseFirestore(), async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists()
      ? parseUserAppData(snap.data() as Record<string, unknown>)
      : createDefaultUserAppData();
    data.expenses[ownerKey] = [...data.expenses[ownerKey], entry];
    appendActivityInTransaction(tx, user.uid, {
      action: "create",
      stream: "expense",
      ownerKey,
      entryId: id,
      client,
      amount,
      currency,
      amountEur,
      date: dateStr,
    });
    tx.set(ref, { ...data, updatedAt: serverTimestamp() });
  });
}

export async function deleteExpenseEntry(
  user: User,
  ownerKey: ExpenseOwnerKey,
  entry: LedgerEntry
): Promise<void> {
  const ref = userAppDataRef(user.uid);
  await runTransaction(getFirebaseFirestore(), async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const data = parseUserAppData(snap.data() as Record<string, unknown>);
    const list = data.expenses[ownerKey];
    const fromDb = entry.id
      ? list.find((e) => e.id === entry.id)
      : list.find(
          (e) =>
            e.client === entry.client &&
            e.date === entry.date &&
            e.amount === entry.amount
        );
    if (!fromDb) return;

    data.expenses[ownerKey] = entry.id
      ? list.filter((e) => e.id !== entry.id)
      : list.filter(
          (e) =>
            !(
              e.client === entry.client &&
              e.date === entry.date &&
              e.amount === entry.amount
            )
        );
    appendActivityInTransaction(tx, user.uid, {
      action: "delete",
      stream: "expense",
      ownerKey,
      entryId: fromDb.id ?? null,
      client: fromDb.client,
      amount: fromDb.amount,
      currency: fromDb.currency ?? "EUR",
      amountEur: ledgerAmountEur(fromDb),
      date: fromDb.date,
    });
    tx.set(ref, { ...data, updatedAt: serverTimestamp() });
  });
}

export async function updateExpenseEntry(
  user: User,
  ownerKey: ExpenseOwnerKey,
  entryId: string,
  newClientInput: string,
  newAmountInput: number,
  newCurrency: LedgerCurrency,
  eurMkdRate: number,
  chfMkdRate: number
): Promise<void> {
  const ref = userAppDataRef(user.uid);
  await runTransaction(getFirebaseFirestore(), async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const data = parseUserAppData(snap.data() as Record<string, unknown>);
    const list = [...data.expenses[ownerKey]];
    const idx = list.findIndex((e) => e.id === entryId);
    if (idx === -1) return;
    const prev = list[idx]!;
    const next: LedgerEntry = { ...prev };
    if (newClientInput.trim()) {
      next.client = newClientInput.trim();
    }
    if (!Number.isNaN(newAmountInput)) {
      next.amount = newAmountInput;
      next.currency = newCurrency;
      next.amountEur = convertToEur(newAmountInput, newCurrency, eurMkdRate, chfMkdRate);
    }
    list[idx] = next;
    data.expenses[ownerKey] = list;
    const prevEur = ledgerAmountEur(prev);
    const nextEur = ledgerAmountEur(next);
    appendActivityInTransaction(tx, user.uid, {
      action: "update",
      stream: "expense",
      ownerKey,
      entryId,
      client: next.client,
      amount: next.amount,
      currency: next.currency ?? "EUR",
      amountEur: nextEur,
      date: next.date,
      previousClient: prev.client,
      previousAmount: prev.amount,
      previousCurrency: prev.currency ?? "EUR",
      previousAmountEur: prevEur,
    });
    tx.set(ref, { ...data, updatedAt: serverTimestamp() });
  });
}
