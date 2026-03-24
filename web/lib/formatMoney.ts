/** Locale: thousands separator + decimal comma (e.g. 1.234,56). */
const MONEY_LOCALE = "de-DE";

const moneyFmt = new Intl.NumberFormat(MONEY_LOCALE, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Formats a numeric amount with grouping and 2 decimal places (comma/dot per locale). */
export function formatMoneyAmount(value: number): string {
  return moneyFmt.format(value);
}

export function formatEur(value: number): string {
  return `${formatMoneyAmount(value)} €`;
}

/** EUR with explicit + for positive values (e.g. budget impact). */
export function formatEurDelta(value: number): string {
  if (value > 0) return `+${formatMoneyAmount(value)} €`;
  return formatEur(value);
}

export function formatMkdAmount(value: number): string {
  return `${formatMoneyAmount(value)} MKD`;
}

/** Exchange rate (e.g. kurs EUR→MKD): fewer trailing zeros when possible. */
export function formatRate(value: number): string {
  return new Intl.NumberFormat(MONEY_LOCALE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(value);
}
