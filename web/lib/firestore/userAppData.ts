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
import {
  EXPENSE_OWNER_KEYS,
  type ExpenseOwnerKey,
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

function ensureExpensesShape(
  raw: Record<string, LedgerEntry[] | undefined> | undefined
): UserAppData["expenses"] {
  const out = {} as UserAppData["expenses"];
  for (const k of EXPENSE_OWNER_KEYS) {
    out[k] = Array.isArray(raw?.[k]) ? raw[k]! : [];
  }
  return out;
}

export function parseUserAppData(raw: Record<string, unknown>): UserAppData {
  const base = createDefaultUserAppData();
  const entries = raw.dashboardEntries;
  const total = raw.totalBudget;
  return {
    dashboardEntries: Array.isArray(entries)
      ? (entries as LedgerEntry[])
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
  dateStr: string
): Promise<void> {
  const ref = userAppDataRef(user.uid);
  const id =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const entry: LedgerEntry = { id, client, amount, date: dateStr };

  await runTransaction(getFirebaseFirestore(), async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists()
      ? parseUserAppData(snap.data() as Record<string, unknown>)
      : createDefaultUserAppData();
    data.dashboardEntries = [...data.dashboardEntries, entry];
    data.totalBudget += amount;
    appendActivityInTransaction(tx, user.uid, {
      action: "create",
      stream: "income",
      ownerKey: null,
      entryId: id,
      client,
      amount,
      date: dateStr,
      budgetDelta: amount,
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
    data.totalBudget -= fromDb.amount;
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
      date: fromDb.date,
      budgetDelta: -fromDb.amount,
    });
    for (const { owner, exp } of cascaded) {
      appendActivityInTransaction(tx, user.uid, {
        action: "delete",
        stream: "expense",
        ownerKey: owner,
        entryId: exp.id ?? null,
        client: exp.client,
        amount: exp.amount,
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
  newAmountInput: number
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
      data.totalBudget = data.totalBudget - prev.amount + newAmountInput;
      next.amount = newAmountInput;
      for (const k of EXPENSE_OWNER_KEYS) {
        data.expenses[k] = data.expenses[k].map((exp) =>
          exp.client === oldClient ? { ...exp, client: next.client } : exp
        );
      }
    }
    data.dashboardEntries = [...data.dashboardEntries];
    data.dashboardEntries[idx] = next;
    const budgetDelta = next.amount - prev.amount;
    appendActivityInTransaction(tx, user.uid, {
      action: "update",
      stream: "income",
      ownerKey: null,
      entryId,
      client: next.client,
      amount: next.amount,
      date: next.date,
      previousClient: prev.client,
      previousAmount: prev.amount,
      budgetDelta,
    });
    tx.set(ref, { ...data, updatedAt: serverTimestamp() });
  });
}

export function sumAllExpenses(data: UserAppData): number {
  let sum = 0;
  for (const k of EXPENSE_OWNER_KEYS) {
    sum += data.expenses[k].reduce((s, e) => s + e.amount, 0);
  }
  return sum;
}

export function sumOwnerExpenses(
  data: UserAppData,
  ownerKey: ExpenseOwnerKey
): number {
  return data.expenses[ownerKey].reduce((s, e) => s + e.amount, 0);
}

export async function addExpenseEntry(
  user: User,
  ownerKey: ExpenseOwnerKey,
  client: string,
  amount: number,
  dateStr: string
): Promise<void> {
  const ref = userAppDataRef(user.uid);
  const id =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const entry: LedgerEntry = { id, client, amount, date: dateStr };

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
  newAmountInput: number
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
    }
    list[idx] = next;
    data.expenses[ownerKey] = list;
    appendActivityInTransaction(tx, user.uid, {
      action: "update",
      stream: "expense",
      ownerKey,
      entryId,
      client: next.client,
      amount: next.amount,
      date: next.date,
      previousClient: prev.client,
      previousAmount: prev.amount,
    });
    tx.set(ref, { ...data, updatedAt: serverTimestamp() });
  });
}
