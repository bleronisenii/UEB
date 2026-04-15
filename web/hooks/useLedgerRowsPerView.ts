"use client";

import { useSyncExternalStore } from "react";
import {
  computeLedgerRowsPerView,
} from "@/lib/ledgerRowsPerView";
import { TABLE_PAGE_SIZE } from "@/lib/tablePagination";

function subscribe(onChange: () => void) {
  window.addEventListener("resize", onChange);
  window.addEventListener("orientationchange", onChange);
  return () => {
    window.removeEventListener("resize", onChange);
    window.removeEventListener("orientationchange", onChange);
  };
}

function getSnapshot(): number {
  return computeLedgerRowsPerView(window.innerWidth, window.innerHeight);
}

function getServerSnapshot(): number {
  return TABLE_PAGE_SIZE;
}

/** Reactive rows/page and scroll viewport rows from window size. */
export function useLedgerRowsPerView(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
