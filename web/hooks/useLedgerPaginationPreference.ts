"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "ueb-ledger-pagination-enabled";

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) onStoreChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onStoreChange);
    window.removeEventListener("storage", onStorage);
  };
}

function readStored(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function getServerSnapshot(): boolean {
  return false;
}

/**
 * Persisted preference: when false, tables use legacy scroll (all rows, scrollbar after viewport-based row count).
 * When true, rows are split into pages.
 */
export function useLedgerPaginationPreference() {
  const paginationEnabled = useSyncExternalStore(
    subscribe,
    readStored,
    getServerSnapshot
  );

  const setPaginationEnabled = useCallback((value: boolean) => {
    try {
      localStorage.setItem(STORAGE_KEY, String(value));
    } catch {
      /* ignore */
    }
    emit();
  }, []);

  const togglePagination = useCallback(() => {
    setPaginationEnabled(!paginationEnabled);
  }, [paginationEnabled, setPaginationEnabled]);

  return { paginationEnabled, setPaginationEnabled, togglePagination };
}
