import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../api/axiosInstance.js';

/**
 * Server-paginated, server-searched list.
 *
 * These tables used to fetch up to 1000 rows and filter them in the browser,
 * which meant the list silently truncated past that point and the search box
 * could only ever match inside the fetched window. Paging and searching both
 * belong on the server; this hook owns the query state and keeps the request
 * in sync with it.
 *
 * Search is debounced so typing doesn't fire a request per keystroke, and an
 * AbortController drops responses for queries the user has already moved on
 * from — otherwise a slow early response can land after a fast later one and
 * overwrite the results with stale rows.
 */
export function usePaginatedList(endpoint, { limit = 25, extraParams = {}, debounceMs = 300 } = {}) {
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0, hasNext: false, hasPrev: false });
  // Collection-wide extras the server computes (e.g. how many users are
  // admins) — these cannot be tallied from the current page.
  const [meta, setMeta] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const abortRef = useRef(null);
  // Serialised so the effect below compares by value, not object identity —
  // an inline `extraParams` object would otherwise refire on every render.
  const extraKey = JSON.stringify(extraParams);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), debounceMs);
    return () => clearTimeout(t);
  }, [search, debounceMs]);

  // Any change to the query itself returns to page 1; staying on page 7 of a
  // new, shorter result set shows an empty table.
  useEffect(() => { setPage(1); }, [debouncedSearch, extraKey]);

  const fetchPage = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError('');
    try {
      const { data } = await api.get(endpoint, {
        params: {
          page,
          limit,
          ...(debouncedSearch ? { search: debouncedSearch } : {}),
          ...JSON.parse(extraKey),
        },
        signal: controller.signal,
      });
      setItems(data.items || data.users || data.prompts || []);
      if (data.pagination) setPagination(data.pagination);
      setMeta(data.meta || {});
    } catch (err) {
      if (err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError') return;
      setError(err?.response?.data?.message || 'Failed to load.');
    } finally {
      // Only the newest request clears the spinner, so an aborted one can't
      // leave the table looking settled while a newer fetch is still running.
      if (abortRef.current === controller) setLoading(false);
    }
  }, [endpoint, page, limit, debouncedSearch, extraKey]);

  useEffect(() => { fetchPage(); return () => abortRef.current?.abort(); }, [fetchPage]);

  return {
    items, pagination, meta, loading, error,
    page, setPage,
    search, setSearch,
    reload: fetchPage,
    // Optimistic local removal after a delete, so the row disappears without
    // a round-trip; the count is corrected on the next fetch.
    removeLocal: (id) => setItems((arr) => arr.filter((x) => x._id !== id)),
  };
}
