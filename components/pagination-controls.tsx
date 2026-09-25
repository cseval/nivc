"use client";

export function PaginationControls({
  page,
  pageCount,
  total,
  itemLabel,
  loading,
  onPageChange
}: {
  page: number;
  pageCount: number;
  total: number;
  itemLabel: string;
  loading: boolean;
  onPageChange: (page: number) => void;
}) {
  return (
    <nav className="pagination" aria-label={`${itemLabel} pages`}>
      <span>{total.toLocaleString()} {itemLabel}</span>
      <div className="pagination-actions">
        <button className="btn btn-secondary btn-sm" disabled={loading || page <= 1} onClick={() => onPageChange(page - 1)}>Previous</button>
        <span className="pagination-position">Page {page} of {pageCount}</span>
        <button className="btn btn-secondary btn-sm" disabled={loading || page >= pageCount} onClick={() => onPageChange(page + 1)}>Next</button>
      </div>
    </nav>
  );
}
