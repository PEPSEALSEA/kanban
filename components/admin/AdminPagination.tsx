'use client';

import type { AdminPageSize } from '@/lib/adminList';
import { totalPages } from '@/lib/adminList';

type AdminPaginationProps = {
  page: number;
  limit: AdminPageSize;
  total: number;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: AdminPageSize) => void;
  disabled?: boolean;
};

export default function AdminPagination({
  page,
  limit,
  total,
  onPageChange,
  onLimitChange,
  disabled = false,
}: AdminPaginationProps) {
  const pages = totalPages(total, limit);
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '1rem',
        flexWrap: 'wrap',
        marginTop: '1.25rem',
        padding: '0.75rem 0',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--admin-text-muted)', fontSize: '0.85rem' }}>
        <span>
          Showing {from}-{to} of {total}
        </span>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span>Per page</span>
          <select
            value={limit}
            disabled={disabled}
            onChange={(e) => onLimitChange(Number(e.target.value) === 50 ? 50 : 20)}
            style={{
              padding: '0.35rem 0.5rem',
              borderRadius: '0.4rem',
              border: '1px solid var(--admin-border)',
              background: 'transparent',
              color: 'var(--admin-text-main)',
            }}
          >
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
        </label>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <button
          type="button"
          disabled={disabled || page <= 1}
          onClick={() => onPageChange(page - 1)}
          style={{
            padding: '0.45rem 0.85rem',
            borderRadius: '0.5rem',
            border: '1px solid var(--admin-border)',
            background: 'transparent',
            color: 'var(--admin-text-main)',
            cursor: disabled || page <= 1 ? 'not-allowed' : 'pointer',
            opacity: disabled || page <= 1 ? 0.5 : 1,
            fontWeight: 600,
          }}
        >
          Prev
        </button>
        <span style={{ fontSize: '0.85rem', color: 'var(--admin-text-muted)', fontWeight: 600 }}>
          Page {page} / {pages}
        </span>
        <button
          type="button"
          disabled={disabled || page >= pages}
          onClick={() => onPageChange(page + 1)}
          style={{
            padding: '0.45rem 0.85rem',
            borderRadius: '0.5rem',
            border: '1px solid var(--admin-border)',
            background: 'transparent',
            color: 'var(--admin-text-main)',
            cursor: disabled || page >= pages ? 'not-allowed' : 'pointer',
            opacity: disabled || page >= pages ? 0.5 : 1,
            fontWeight: 600,
          }}
        >
          Next
        </button>
      </div>
    </div>
  );
}
