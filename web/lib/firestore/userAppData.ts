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
import {
  EXPENSE_OWNER_KEYS,
  type ExpenseOwnerKey,
  type LedgerEntry,
  type UserAppData,
} from "@/types/userApp";

const COLLECTION = "userAppData";

export function userAppDataRef(uid: string) {
  return doc(getFirebaseFirestore(), COLLECTION, uid);
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
    data.dashboardEntries = data.dashboardEntries.filter((e) => e.id !== entry.id);
    data.totalBudget -= entry.amount;
    for (const k of EXPENSE_OWNER_KEYS) {
      data.expenses[k] = data.expenses[k].filter(
        (exp) => exp.client !== entry.client
      );
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
    tx.set(ref, { ...data, updatedAt: serverTimestamp() });
  });
}
