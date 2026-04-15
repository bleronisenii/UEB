"use client";

type TablePaginationProps = {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
};

export function TablePagination({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
}: TablePaginationProps) {
  if (totalItems === 0) {
    return null;
  }

  const size = Math.max(1, pageSize);
  const from = (page - 1) * size + 1;
  const to = Math.min(page * size, totalItems);

  return (
    <div
      className="table-pagination"
      role="navigation"
      aria-label="Faqet e tabelës"
    >
      <span className="table-pagination-info">
        {from}–{to} nga {totalItems}
      </span>
      <div className="table-pagination-actions">
        <button
          type="button"
          className="table-pagination-btn"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Faqja e mëparshme"
        >
          ‹
        </button>
        <span className="table-pagination-page">
          Faqja {page} / {totalPages}
        </span>
        <button
          type="button"
          className="table-pagination-btn"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Faqja tjetër"
        >
          ›
        </button>
      </div>
    </div>
  );
}
