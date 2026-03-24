"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { parseChfMkdRate, parseEurMkdRate } from "@/lib/export/eurMkd";

const STORAGE_KEY_EUR = "ueb-eur-mkd-rate";
const STORAGE_KEY_CHF = "ueb-chf-mkd-rate";

type EurMkdRateContextValue = {
  rateInput: string;
  setRateInput: (value: string) => void;
  rate: number;
  chfMkdRateInput: string;
  setChfMkdRateInput: (value: string) => void;
  chfMkdRate: number;
};

const EurMkdRateContext = createContext<EurMkdRateContextValue | null>(null);

export function EurMkdRateProvider({ children }: { children: ReactNode }) {
  const [rateInput, setRateInputState] = useState("61.5");
  const [chfMkdRateInput, setChfMkdRateInputState] = useState("68");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_EUR);
      if (stored != null && stored !== "") {
        setRateInputState(stored);
      }
      const storedChf = localStorage.getItem(STORAGE_KEY_CHF);
      if (storedChf != null && storedChf !== "") {
        setChfMkdRateInputState(storedChf);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const setRateInput = useCallback((value: string) => {
    setRateInputState(value);
    try {
      localStorage.setItem(STORAGE_KEY_EUR, value);
    } catch {
      /* ignore */
    }
  }, []);

  const setChfMkdRateInput = useCallback((value: string) => {
    setChfMkdRateInputState(value);
    try {
      localStorage.setItem(STORAGE_KEY_CHF, value);
    } catch {
      /* ignore */
    }
  }, []);

  const rate = useMemo(() => parseEurMkdRate(rateInput), [rateInput]);
  const chfMkdRate = useMemo(
    () => parseChfMkdRate(chfMkdRateInput),
    [chfMkdRateInput]
  );

  const value = useMemo(
    () => ({
      rateInput,
      setRateInput,
      rate,
      chfMkdRateInput,
      setChfMkdRateInput,
      chfMkdRate,
    }),
    [chfMkdRate, chfMkdRateInput, rate, rateInput, setChfMkdRateInput, setRateInput]
  );

  return (
    <EurMkdRateContext.Provider value={value}>
      {children}
    </EurMkdRateContext.Provider>
  );
}

export function useEurMkdRate(): EurMkdRateContextValue {
  const ctx = useContext(EurMkdRateContext);
  if (!ctx) {
    throw new Error("useEurMkdRate must be used within EurMkdRateProvider");
  }
  return ctx;
}
