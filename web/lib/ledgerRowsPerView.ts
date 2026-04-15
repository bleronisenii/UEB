import { TABLE_PAGE_SIZE } from "@/lib/tablePagination";

/** Matches CSS: `max-height: calc(var(--ledger-scroll-rows) * 48px)` */
export const LEDGER_ROW_HEIGHT_PX = 48;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/**
 * Rows to show per page (pagination) or in the scroll viewport (scroll mode),
 * from viewport size so small phones / short windows get fewer rows and large monitors get more.
 */
export function computeLedgerRowsPerView(
  innerWidth: number,
  innerHeight: number
): number {
  const reserved =
    innerWidth < 600 ? 450 : innerWidth < 1024 ? 400 : 360;
  const maxByHeight = Math.floor(
    Math.max(0, innerHeight - reserved) / LEDGER_ROW_HEIGHT_PX
  );

  let maxByWidth = 22;
  if (innerWidth < 400) maxByWidth = 6;
  else if (innerWidth < 600) maxByWidth = 8;
  else if (innerWidth < 900) maxByWidth = 12;
  else if (innerWidth < 1280) maxByWidth = 16;

  const rows = Math.min(
    maxByHeight > 0 ? maxByHeight : TABLE_PAGE_SIZE,
    maxByWidth
  );
  return clamp(rows, 4, 22);
}
