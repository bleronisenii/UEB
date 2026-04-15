"use client";

import { useEurMkdRate } from "@/contexts/EurMkdRateContext";
import {
  convertToEur,
} from "@/lib/currency";
import { formatEur, formatMoneyAmount } from "@/lib/formatMoney";
import { eurToMkd, formatMkd, parseLedgerAmountInput } from "@/lib/export/eurMkd";
import type { LedgerCurrency, LedgerEntry } from "@/types/userApp";

type AmountEurMkdProps = {
  eur: number;
  className?: string;
  /** Smaller MKD line (tables / dense UI) */
  compact?: boolean;
};

export function AmountEurMkd({ eur, className, compact }: AmountEurMkdProps) {
  const { rate } = useEurMkdRate();
  const mkd = formatMkd(eurToMkd(eur, rate));
  return (
    <span
      className={[
        "amount-eur-mkd",
        compact ? "amount-eur-mkd--compact" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className="amount-eur">{formatEur(eur)}</span>
      <span className="amount-mkd">{mkd}</span>
    </span>
  );
}

/** Live conversion preview under amount inputs (EUR/MKD/CHF use user EUR↔MKD and CHF↔MKD rates). */
export function FormCurrencyHint({
  amountStr,
  currency,
}: {
  amountStr: string;
  currency: LedgerCurrency;
}) {
  const { rate, chfMkdRate } = useEurMkdRate();
  const n = parseLedgerAmountInput(amountStr);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (currency === "EUR") {
    return (
      <p className="amount-mkd-hint">≈ {formatMkd(eurToMkd(n, rate))}</p>
    );
  }
  if (currency === "MKD") {
    return (
      <p className="amount-mkd-hint">≈ {formatEur(n / rate)}</p>
    );
  }
  const mkdFromChf = n * chfMkdRate;
  const eur = convertToEur(n, "CHF", rate, chfMkdRate);
  return (
    <p className="amount-mkd-hint">
      ≈ {formatMkd(mkdFromChf)} · ≈ {formatEur(eur)}
    </p>
  );
}

export function LedgerCurrencySelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: LedgerCurrency;
  onChange: (c: LedgerCurrency) => void;
}) {
  return (
    <select
      id={id}
      className="ledger-currency-select"
      value={value}
      onChange={(e) => onChange(e.target.value as LedgerCurrency)}
      aria-label="Valuta"
    >
      <option value="EUR">EUR</option>
      <option value="MKD">MKD</option>
      <option value="CHF">CHF</option>
    </select>
  );
}

/** Table cell: face amount + locked MKD-at-entry (if available). */
export function LedgerRowAmount({ entry }: { entry: LedgerEntry }) {
  const cur = entry.currency ?? "EUR";
  const mkdLocked =
    entry.mkdValueAtEntry != null && Number.isFinite(entry.mkdValueAtEntry)
      ? entry.mkdValueAtEntry
      : null;
  return (
    <span className="amount-eur-mkd amount-eur-mkd--compact ledger-row-amount">
      <span className="amount-eur">
        {formatMoneyAmount(entry.amount)} {cur}
      </span>
      <span className="ledger-row-amount-equiv">
        <span className="amount-mkd">
          {mkdLocked != null ? formatMkd(mkdLocked) : "Kurs i panjohur"}
        </span>
      </span>
    </span>
  );
}
