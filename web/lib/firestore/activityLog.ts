import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
  type DocumentData,
  type Transaction,
  type Unsubscribe,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import { getFirebaseFirestore } from "@/lib/firebase";
import {
  ACTIVITY_LOG_SUBCOLLECTION,
  USER_APP_DATA_COLLECTION,
} from "@/lib/firestore/collections";
import { orgActivityLogCollectionRef } from "@/lib/firestore/orgRefs";
import { getOrgId } from "@/lib/org";
import { EXPENSE_OWNER_KEYS } from "@/types/userApp";
import type { ExpenseOwnerKey } from "@/types/userApp";
import type { UserAppData } from "@/types/userApp";
import { isLedgerCurrency, ledgerAmountEur } from "@/lib/currency";
import type {
  ActivityEvent,
  ActivityEventParsed,
  AuditChangeDetails,
  AuditEventType,
  AuditSource,
} from "@/types/activityLog";

const ACTIVITY_PAGE_SIZE = 2000;

export function activityLogCollectionRef(uid: string) {
  return collection(
    getFirebaseFirestore(),
    USER_APP_DATA_COLLECTION,
    uid,
    ACTIVITY_LOG_SUBCOLLECTION
  );
}

function newOrgActivityDocRef(orgId: string) {
  return doc(orgActivityLogCollectionRef(orgId));
}

export type ActivityWritePayload = Omit<
  ActivityEvent,
  "createdAt" | "source"
> & {
  source?: ActivityEvent["source"];
};

export function appendActivityInTransaction(
  tx: Transaction,
  orgId: string,
  payload: ActivityWritePayload
): void {
  const ref = newOrgActivityDocRef(orgId);
  const { source, ...rest } = payload;
  tx.set(ref, {
    ...rest,
    ...(source ? { source } : {}),
    createdAt: serverTimestamp(),
  });
}

export type AuditWritePayload = Partial<
  Pick<ActivityEvent, "actorEmail" | "auditSource" | "eventType" | "changeDetails">
>;

export async function logAuditEvent(
  user: User,
  payload: ActivityWritePayload
): Promise<void> {
  const ref = newOrgActivityDocRef(getOrgId());
  const { source, ...rest } = payload;
  const db = getFirebaseFirestore();
  const batch = writeBatch(db);
  batch.set(ref, {
    ...rest,
    ...(source ? { source } : {}),
    createdAt: serverTimestamp(),
  });
  await batch.commit();
}

function parseTimestampMs(data: DocumentData): Date | null {
  const ts = data.createdAt;
  if (ts && typeof ts.toDate === "function") {
    return ts.toDate();
  }
  return null;
}

function isExpenseOwnerKey(v: unknown): v is ExpenseOwnerKey {
  return (
    typeof v === "string" &&
    (EXPENSE_OWNER_KEYS as readonly string[]).includes(v)
  );
}

export function parseActivityDoc(
  id: string,
  data: DocumentData
): ActivityEventParsed | null {
  const action = data.action;
  const stream = data.stream;
  if (action !== "create" && action !== "update" && action !== "delete") {
    return null;
  }
  if (stream !== "income" && stream !== "expense") {
    return null;
  }
  const client = typeof data.client === "string" ? data.client : "";
  const amount = typeof data.amount === "number" ? data.amount : 0;
  const currency = isLedgerCurrency(data.currency) ? data.currency : undefined;
  const amountEur =
    typeof data.amountEur === "number" && !Number.isNaN(data.amountEur)
      ? data.amountEur
      : undefined;
  const rateAtEntry =
    typeof data.rateAtEntry === "number" && Number.isFinite(data.rateAtEntry)
      ? data.rateAtEntry
      : undefined;
  const mkdValueAtEntry =
    typeof data.mkdValueAtEntry === "number" &&
    Number.isFinite(data.mkdValueAtEntry)
      ? data.mkdValueAtEntry
      : undefined;
  const previousCurrency = isLedgerCurrency(data.previousCurrency)
    ? data.previousCurrency
    : undefined;
  const previousAmountEur =
    typeof data.previousAmountEur === "number" &&
    !Number.isNaN(data.previousAmountEur)
      ? data.previousAmountEur
      : undefined;
  const previousRateAtEntry =
    typeof data.previousRateAtEntry === "number" &&
    Number.isFinite(data.previousRateAtEntry)
      ? data.previousRateAtEntry
      : undefined;
  const previousMkdValueAtEntry =
    typeof data.previousMkdValueAtEntry === "number" &&
    Number.isFinite(data.previousMkdValueAtEntry)
      ? data.previousMkdValueAtEntry
      : undefined;
  const date = typeof data.date === "string" ? data.date : "";
  const actorEmail =
    typeof data.actorEmail === "string" ? data.actorEmail : data.actorEmail === null ? null : undefined;
  const auditSource =
    typeof data.auditSource === "string" ? (data.auditSource as AuditSource) : undefined;
  const eventType =
    typeof data.eventType === "string" ? (data.eventType as AuditEventType) : undefined;
  const changeDetails =
    data.changeDetails && typeof data.changeDetails === "object"
      ? (data.changeDetails as AuditChangeDetails)
      : undefined;
  const ownerKey =
    stream === "income"
      ? null
      : data.ownerKey === null
        ? null
        : isExpenseOwnerKey(data.ownerKey)
          ? data.ownerKey
          : null;
  return {
    id,
    actorEmail,
    auditSource,
    eventType,
    changeDetails,
    action,
    stream,
    ownerKey,
    entryId: typeof data.entryId === "string" ? data.entryId : null,
    client,
    amount,
    currency,
    amountEur,
    rateAtEntry,
    mkdValueAtEntry,
    date,
    previousClient:
      typeof data.previousClient === "string" ? data.previousClient : undefined,
    previousAmount:
      typeof data.previousAmount === "number" ? data.previousAmount : undefined,
    previousCurrency,
    previousAmountEur,
    previousRateAtEntry,
    previousMkdValueAtEntry,
    budgetDelta:
      typeof data.budgetDelta === "number" ? data.budgetDelta : undefined,
    source: data.source === "backfill" ? "backfill" : undefined,
    createdAt: parseTimestampMs(data),
  };
}

export function subscribeActivityLog(
  user: User,
  onData: (events: ActivityEventParsed[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const orgId = getOrgId();
  const q = query(
    orgActivityLogCollectionRef(orgId),
    orderBy("createdAt", "desc"),
    limit(ACTIVITY_PAGE_SIZE)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list: ActivityEventParsed[] = [];
      for (const d of snap.docs) {
        const parsed = parseActivityDoc(d.id, d.data());
        if (parsed) list.push(parsed);
      }
      onData(list);
    },
    (err) => onError(err)
  );
}

const orgBackfillScheduled = new Set<string>();

/**
 * If the log is empty but the user already has ledger rows, create one
 * `create` event per row so the history view is not blank for legacy data.
 */
export async function backfillActivityLogIfEmpty(
  user: User,
  data: UserAppData
): Promise<void> {
  const orgId = getOrgId();
  if (orgBackfillScheduled.has(orgId)) return;
  orgBackfillScheduled.add(orgId);

  const col = orgActivityLogCollectionRef(orgId);
  const probe = await getDocs(query(col, limit(1)));
  if (!probe.empty) return;

  const hasAny =
    data.dashboardEntries.length > 0 ||
    EXPENSE_OWNER_KEYS.some((k) => data.expenses[k].length > 0);
  if (!hasAny) {
    orgBackfillScheduled.delete(orgId);
    return;
  }

  const db = getFirebaseFirestore();
  let batch = writeBatch(db);
  let n = 0;

  const flush = async () => {
    if (n === 0) return;
    await batch.commit();
    batch = writeBatch(db);
    n = 0;
  };

  const enqueue = async (payload: Record<string, unknown>) => {
    batch.set(doc(col), {
      ...payload,
      createdAt: serverTimestamp(),
    });
    n++;
    if (n >= 450) await flush();
  };

  for (const e of data.dashboardEntries) {
    await enqueue({
      actorEmail: null,
      auditSource: "System",
      eventType: "system.backfill",
      changeDetails: {
        summary: "Backfilled from existing budget rows",
      },
      action: "create",
      stream: "income",
      ownerKey: null,
      entryId: e.id ?? null,
      client: e.client,
      amount: e.amount,
      currency: e.currency ?? "EUR",
      amountEur: ledgerAmountEur(e),
      date: e.date,
      source: "backfill",
    });
  }

  for (const owner of EXPENSE_OWNER_KEYS) {
    for (const e of data.expenses[owner]) {
      await enqueue({
        actorEmail: null,
        auditSource: "System",
        eventType: "system.backfill",
        changeDetails: {
          summary: "Backfilled from existing expense rows",
        },
        action: "create",
        stream: "expense",
        ownerKey: owner,
        entryId: e.id ?? null,
        client: e.client,
        amount: e.amount,
        currency: e.currency ?? "EUR",
        amountEur: ledgerAmountEur(e),
        date: e.date,
        source: "backfill",
      });
    }
  }

  try {
    await flush();
  } catch (e) {
    orgBackfillScheduled.delete(orgId);
    throw e;
  }
}
